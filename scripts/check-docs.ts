/**
 * The docs site gate (`DOCS_ROADMAP.md` section 6).
 *
 * `pnpm docs:build` already catches a dead link and a snippet path that
 * points at nothing. Two things it does not catch, both of which turn a
 * page into a lie without failing anything:
 *
 *   - `<LiveExample id="foo" />` with no `FooExampleWorker.ts` behind
 *     it. The component mounts a canvas, asks for a worker that is not
 *     there, and the page shows an empty box. Renaming an example is
 *     the usual way to get here.
 *   - `<<< @/src/examples/Foo.tsx#region` naming a region marker that
 *     has been renamed or deleted. VitePress quietly emits an empty
 *     code block, so the page keeps its prose and loses the code the
 *     prose is about.
 *
 * Both are cheap to check by reading the files, which is what this
 * does: node and `fs`, no markdown parser, no VitePress. It reads the
 * same two syntaxes the pages use and nothing else, so a page that
 * invents a third form is not covered.
 *
 *   pnpm docs:check
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const site = join(root, 'apps/docs');
const examples = join(site, 'src/examples');

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

for (const page of files) {
  const source = readFileSync(page, 'utf8');
  const where = relative(root, page);

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
  console.error(
    `\n${problems.length} broken reference${problems.length === 1 ? '' : 's'} across ${files.length} pages.\n`
  );
  process.exit(1);
}

console.log(
  `${files.length} pages: ${liveExamples} live examples and ${snippets} snippets all resolve ` +
    `(${ids.size} example workers).`
);
