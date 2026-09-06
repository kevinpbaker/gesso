/**
 * The docs site gate (`DOCS_ROADMAP.md` section 6).
 *
 * `pnpm docs:build` already catches a dead link and a snippet path that
 * points at nothing. What it does not catch is everything below, each
 * of which turns a page into a lie, or hides it, without failing
 * anything:
 *
 *   - `<LiveExample id="foo" />` with no `FooExampleWorker.ts` behind
 *     it. The component mounts a canvas, asks for a worker that is not
 *     there, and the page shows an empty box. Renaming an example is
 *     the usual way to get here.
 *   - `<<< @/src/examples/Foo.tsx#region` naming a region marker that
 *     has been renamed or deleted. VitePress quietly emits an empty
 *     code block, so the page keeps its prose and loses the code the
 *     prose is about.
 *   - An em dash, in a page or in an example's source. Section 3's rule
 *     7, and a standing rule for the repository: the site is clean
 *     today, and this is what keeps it so once nobody is looking.
 *   - A page with no `description` in its front matter. It is what a
 *     search result and a link preview show, so a page without one is
 *     published with a blank where its one-line summary goes.
 *   - A `.tsx` under `src/examples/` with neither a worker nor a spec
 *     beside it. Rule 2 is that every example is a spec; an example
 *     that is quoted by a page and tested by nothing is exactly the
 *     snippet that rots.
 *   - A page nothing in the sidebar links to. A dead link fails the
 *     build, so the sidebar can never run ahead of the pages, but the
 *     other direction is silent: a page can be built, deployed and
 *     unreachable.
 *
 * It also checks one thing `docs:build` does catch, but late and with a
 * stack trace rather than a sentence: an unquoted `description` holding
 * a colon. Front matter is YAML, so `description: A thing: and another`
 * reads as a mapping and throws. It is the single most common way a new
 * page fails the build, and the fix is quoting the value, so the gate
 * says exactly that instead of leaving a `YAMLException` to be read.
 *
 * All of it is cheap to check by reading the files, which is what this
 * does: node and `fs`, no markdown parser, no VitePress, no TypeScript.
 * It reads the syntaxes the pages and the config actually use and
 * nothing else, so three things are deliberately outside it. A page
 * that embeds an example some third way is not covered. The sidebar is
 * read as `link: '…'` strings rather than by importing the config, so a
 * sidebar built by a function would read as empty. And the em dash rule
 * covers the pages and `apps/docs/src`, not the site's Vue chrome,
 * because that is where the prose is.
 *
 *   pnpm docs:check
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const site = join(root, 'apps/docs');
const examples = join(site, 'src/examples');
const sources = join(site, 'src');
const config = join(site, '.vitepress/config.ts');

/** Directories that hold build output or dependencies, not pages. */
const SKIP = new Set(['node_modules', 'dist', '.vitepress']);

/** Every markdown page on the site, depth-first, with stable ordering. */
function pages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP.has(entry)) {
      continue;
    }
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...pages(path));
    } else if (entry.endsWith('.md')) {
      out.push(path);
    }
  }
  return out;
}

/**
 * The live example ids that have a worker behind them.
 *
 * The id is the worker's basename with `ExampleWorker.ts` removed and
 * lowercased. This is the rule `LiveExample.vue` resolves with, copied
 * rather than shared because the component is Vue and this is a node
 * script; the regex is the same one, so a rename that breaks one
 * breaks the other.
 */
function workerIds(problems: string[]): Map<string, string> {
  const ids = new Map<string, string>();
  for (const entry of readdirSync(examples).sort()) {
    if (!/(?:Example)?Worker\.ts$/.test(entry)) {
      continue;
    }
    const id = entry.replace(/(?:Example)?Worker\.ts$/, '').toLowerCase();
    const existing = ids.get(id);
    if (existing !== undefined) {
      problems.push(`apps/docs/src/examples: ${existing} and ${entry} both answer to id "${id}".`);
      continue;
    }
    ids.set(id, entry);
  }
  return ids;
}

/** Every TypeScript source under `apps/docs/src`, which is where the snippets live. */
function exampleSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP.has(entry)) {
      continue;
    }
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...exampleSources(path));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(path);
    }
  }
  return out;
}

/**
 * An example module that nothing quotes into a canvas and nothing runs.
 *
 * A `.tsx` under `src/examples/` earns its place one of two ways: a
 * `*Worker.ts` beside it, which is what a page embeds, or a `.spec.ts`
 * beside it, which is what makes its claim checkable. Most have both.
 * Neither means an example that a page can only quote, with no test
 * behind the quote, which is rule 2's whole subject.
 */
function checkExampleModules(problems: string[]): number {
  const entries = readdirSync(examples).sort();
  const present = new Set(entries);
  let checked = 0;
  for (const entry of entries) {
    if (!entry.endsWith('.tsx')) {
      continue;
    }
    checked += 1;
    const base = entry.slice(0, -'.tsx'.length);
    if (present.has(`${base}Worker.ts`) || present.has(`${base}.spec.ts`)) {
      continue;
    }
    problems.push(
      `apps/docs/src/examples/${entry}: no ${base}Worker.ts and no ${base}.spec.ts beside it, so nothing runs it. ` +
        `Every live example is a spec: add ${base}.spec.ts measuring what its page claims, and a worker too if a page embeds it.`
    );
  }
  return checked;
}

/**
 * A page's route, as the sidebar would have to write it.
 *
 * `/components/index.md` and `/components/` are the same page, so both
 * forms collapse to `/components` and either spelling in the config
 * counts. A fragment is dropped: a link into a heading still reaches
 * the page.
 */
function route(link: string): string {
  let path = link.split('#')[0].replace(/\.(?:md|html)$/, '');
  if (path.endsWith('/index')) {
    path = path.slice(0, -'index'.length);
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path;
}

/**
 * Every route the sidebar links to.
 *
 * Read as text rather than by importing the config, because this is a
 * plain node script and the config is TypeScript that pulls VitePress
 * in with it. Only the part of the file from `sidebar:` onwards is
 * read, so a page reachable from the top nav alone still counts as an
 * orphan: the nav holds seven entries and the sidebar is where a
 * reader browses.
 */
function sidebarRoutes(): Set<string> {
  const source = readFileSync(config, 'utf8');
  const start = source.indexOf('sidebar:');
  const sidebar = start === -1 ? '' : source.slice(start);
  return new Set([...sidebar.matchAll(/\blink:\s*'([^']+)'/g)].map(match => route(match[1])));
}

/** The home page, which the nav reaches and the sidebar deliberately does not. */
const NAV_ONLY = new Set(['/']);

/**
 * An em dash, anywhere.
 *
 * Reported by line, because the fix is to repunctuate that sentence
 * rather than to delete a character: which mark replaces it depends on
 * what the dash was doing.
 */
function checkEmDashes(source: string, where: string, problems: string[]): void {
  source.split('\n').forEach((line, index) => {
    if (line.includes('—')) {
      problems.push(
        `${where}:${index + 1}: an em dash. Repunctuate the sentence: a pair of commas or brackets for an aside, ` +
          `a colon for an explanation, a semicolon or a full stop between two clauses.`
      );
    }
  });
}

/** `<LiveExample id="foo" height="320" />`, in any attribute order. */
const LIVE_EXAMPLE = /<LiveExample\b[^>]*?\bid="([^"]*)"/g;

/** A VitePress snippet import, which has to start its own line. */
const SNIPPET = /^<<<\s+(\S+)/gm;

/** `// #region name`, and the HTML comment form a markdown file uses. */
function hasRegion(source: string, region: string): boolean {
  const marker = new RegExp(String.raw`#region\s+${region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*(?:-->)?\s*$`, 'm');
  return marker.test(source);
}

const problems: string[] = [];
const ids = workerIds(problems);
const files = pages(site);
let liveExamples = 0;
let snippets = 0;

/**
 * The front matter: that there is a `description`, and that its value
 * parses.
 *
 * Only the front matter block is read, and only two keys. A
 * `description` already wrapped in single or double quotes is fine
 * however many colons it holds. The home page is the one page without a
 * description, and it says which page it is by carrying VitePress's
 * `layout: home`, so that is what exempts it rather than its path.
 */
function checkFrontMatter(source: string, where: string, problems: string[]): void {
  const lines = source.split('\n');
  const block: string[] = [];
  if (lines[0] === '---') {
    for (const line of lines.slice(1)) {
      if (line === '---') {
        break;
      }
      block.push(line);
    }
  }

  let described = false;
  let home = false;
  for (const line of block) {
    if (line.trim() === 'layout: home') {
      home = true;
    }
    if (!line.startsWith('description: ')) {
      continue;
    }
    const value = line.slice('description: '.length).trim();
    if (value.length === 0) {
      continue;
    }
    described = true;
    if (!value.startsWith("'") && !value.startsWith('"') && value.includes(':')) {
      problems.push(
        `${where}: front matter description holds a colon and is not quoted, so the YAML fails to parse. Wrap the value in single quotes.`
      );
    }
  }

  if (!described && !home) {
    problems.push(
      `${where}: front matter carries no description, which is what a search result and a link preview show. ` +
        `Add a one-sentence description; only the home page goes without, and it says so with layout: home.`
    );
  }
}

const routes = sidebarRoutes();
const modules = checkExampleModules(problems);

for (const file of exampleSources(sources)) {
  checkEmDashes(readFileSync(file, 'utf8'), relative(root, file), problems);
}

for (const page of files) {
  const source = readFileSync(page, 'utf8');
  const where = relative(root, page);

  checkFrontMatter(source, where, problems);
  checkEmDashes(source, where, problems);

  const path = route(`/${relative(site, page).replace(/\.md$/, '')}`);
  if (!routes.has(path) && !NAV_ONLY.has(path)) {
    problems.push(
      `${where}: nothing in apps/docs/.vitepress/config.ts's sidebar links to ${path}, so no reader can reach it. ` +
        `Add { text: '…', link: '${path}' } to the section it belongs in.`
    );
  }

  for (const match of source.matchAll(LIVE_EXAMPLE)) {
    liveExamples += 1;
    const id = match[1];
    if (!ids.has(id)) {
      problems.push(`${where}: <LiveExample id="${id}"> has no apps/docs/src/examples/*ExampleWorker.ts behind it.`);
    }
  }

  for (const match of source.matchAll(SNIPPET)) {
    snippets += 1;
    // The token can carry a line range or a language in braces, and a
    // title in brackets; neither is part of the path.
    const token = match[1].replace(/\{[^}]*\}$/, '').replace(/\[[^\]]*\]$/, '');
    const hash = token.lastIndexOf('#');
    const path = hash === -1 ? token : token.slice(0, hash);
    const region = hash === -1 ? '' : token.slice(hash + 1);
    if (!path.startsWith('@/')) {
      problems.push(`${where}: snippet path "${token}" is not site-absolute; write it as @/src/...`);
      continue;
    }
    const target = join(site, path.slice(2));
    let body: string;
    try {
      body = readFileSync(target, 'utf8');
    } catch {
      problems.push(`${where}: snippet ${path} points at a file that does not exist.`);
      continue;
    }
    if (region.length > 0 && !hasRegion(body, region)) {
      problems.push(`${where}: snippet ${path} has no "#region ${region}" marker.`);
    }
  }
}

if (problems.length > 0) {
  console.error('');
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} across ${files.length} pages.\n`);
  process.exit(1);
}

console.log(
  `${files.length} pages: ${liveExamples} live examples and ${snippets} snippets all resolve ` +
    `(${ids.size} example workers), every page has a description and a place in the sidebar, ` +
    `${modules} example modules each carry a worker or a spec, and nothing holds an em dash.`
);
