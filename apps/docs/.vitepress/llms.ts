import type { Plugin } from 'vite';

/**
 * The site again, as markdown a model can read.
 *
 * A coding agent asked to write a Gesso app has never seen Gesso. It
 * was trained on React, and it will write `useState` and a `div` unless
 * something it reads says otherwise. The pages say otherwise, but in
 * HTML wrapped in a theme, with the code that matters pulled in by
 * `<<<` at build time and the examples drawn in a canvas it cannot see.
 *
 * So the build writes three things beside the HTML, following the
 * llms.txt convention (https://llmstxt.org):
 *
 *   - `llms.txt`, the index: every page, in sidebar order, with its
 *     description, linking to the markdown below.
 *   - `<page>.md` for every page, so `/guide/counter` is also
 *     `/guide/counter.md`.
 *   - `llms-full.txt`, every page in one file, for an agent that would
 *     rather read the whole site than follow links.
 *
 * Each page is its own source with the snippet includes expanded, so a
 * page that quotes `CounterExample.tsx` carries the code it quotes, and
 * with the `<LiveExample />` lines taken out, since a canvas is nothing
 * to a reader of text. Links are made absolute, because the markdown is
 * read out of context more often than not.
 *
 * It is a Vite plugin in the site's config, reading through the
 * bundler's own `fs` and writing with `emitFile`, rather than a
 * `buildEnd` hook with `node:fs`: this repository typechecks without
 * Node's types, so that nothing meant for a worker can reach for them,
 * and the bundler already has both halves.
 *
 * Sidebar order is the order because it is the order a person is meant
 * to read in, and a model benefits from the same progression: what a
 * component is, before what a channel is.
 */

/** Where the site is served. The markdown is read away from it, so links say so. */
export const SITE = 'https://gesso-docs.vercel.app';

export interface SidebarItem {
  readonly text?: string;
  readonly link?: string;
  readonly items?: readonly SidebarItem[];
}

export interface LlmsPage {
  /** The sidebar section the page is listed under. */
  readonly section: string;
  readonly title: string;
  /** The site path, as the sidebar links it: `/guide/counter`, `/components/`. */
  readonly link: string;
  readonly description: string;
  /** The page as standalone markdown. */
  readonly markdown: string;
}

/**
 * The source file behind a sidebar link: `/components/` is
 * `components/index.md`. It is also where the page's markdown is
 * served, so the two paths are one function.
 */
export function sourceOf(link: string): string {
  const path = link.replace(/^\//, '');
  return path === '' || path.endsWith('/') ? `${path}index.md` : `${path}.md`;
}

/** Splits YAML front matter off a page, reading only the `description` it needs. */
export function splitFrontMatter(source: string): { description: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  if (match === null) {
    return { description: '', body: source };
  }
  const line = /^description:\s*(.*)$/m.exec(match[1])?.[1]?.trim() ?? '';
  const quoted = /^(['"])(.*)\1$/.exec(line);
  // YAML's single-quoted form escapes a quote by doubling it.
  const description = quoted === null ? line : quoted[1] === "'" ? quoted[2].replaceAll("''", "'") : quoted[2];
  return { description, body: source.slice(match[0].length) };
}

/**
 * The lines between `#region name` and `#endregion name`, the way
 * VitePress cuts them: marker lines for any region are dropped, so a
 * region that contains another reads as plain code, and the result is
 * dedented.
 */
export function extractRegion(code: string, region: string): string | null {
  const lines = code.split('\n');
  const marker = (kind: 'region' | 'endregion') => new RegExp(`#${kind}\\s+${escapeRegExp(region)}\\b`);
  const start = lines.findIndex(line => marker('region').test(line));
  if (start === -1) {
    return null;
  }
  const end = lines.findIndex((line, index) => index > start && marker('endregion').test(line));
  if (end === -1) {
    return null;
  }
  const inner = lines.slice(start + 1, end).filter(line => !/#(?:end)?region\b/.test(line));
  return dedent(inner).join('\n');
}

function dedent(lines: readonly string[]): string[] {
  const indents = lines.filter(line => line.trim() !== '').map(line => /^ */.exec(line)![0].length);
  const by = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map(line => line.slice(by));
}

/**
 * A path under a directory, with `..` resolved: `@/../playground/x.ts`
 * from the site's source directory is the playground's file. POSIX
 * paths only, which is what Vite hands a plugin on every platform.
 */
export function resolvePath(dir: string, relative: string): string {
  const parts: string[] = [];
  for (const part of `${dir}/${relative}`.split('/')) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.' && part !== '') {
      parts.push(part);
    }
  }
  return `/${parts.join('/')}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One page as standalone markdown.
 *
 * Reads only the syntaxes the pages use. A `<<< @/path#region` line,
 * with VitePress's optional `{highlight}` and `[title]` after it,
 * becomes a fenced block of the code it names, and `@` is the site's
 * source directory. A line that is nothing but a capitalised
 * self-closing tag outside a fence is a Vue component, a live canvas or
 * a demo, and is dropped. Anything else is passed through.
 */
export async function pageMarkdown(
  body: string,
  srcDir: string,
  read: (path: string) => Promise<string>
): Promise<string> {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of body.split('\n')) {
    const opener = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence !== null) {
      out.push(line);
      if (opener !== undefined && opener[0] === fence[0] && opener.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (opener !== undefined) {
      fence = opener;
      out.push(line);
      continue;
    }
    const include = /^<<<\s+@\/(\S+?)(?:#([\w-]+))?(?:\{[^}]*\})?(?:\s+\[[^\]]*\])?\s*$/.exec(line);
    if (include !== null) {
      const [, path, region] = include;
      const code = await read(resolvePath(srcDir, path));
      const quoted = region === undefined ? code.trimEnd() : extractRegion(code, region);
      if (quoted === null) {
        throw new Error(`${path} has no region named ${region}.`);
      }
      out.push('```' + (/\.(\w+)$/.exec(path)?.[1] ?? ''), quoted, '```');
      continue;
    }
    if (/^\s*<[A-Z][\w-]*(?:\s[^>]*)?\/>\s*$/.test(line)) {
      continue;
    }
    out.push(line);
  }
  return (
    absoluteLinks(
      out
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    ) + '\n'
  );
}

/** `](/guide/x)` to `](https://…/guide/x)`, leaving code alone. */
function absoluteLinks(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```)/)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/\]\(\/(?!\/)/g, `](${SITE}/`)))
    .join('');
}

/** Every page the sidebar lists, in order, read and converted. */
export async function collectPages(
  sidebar: readonly SidebarItem[],
  srcDir: string,
  read: (path: string) => Promise<string>
): Promise<LlmsPage[]> {
  const pages: LlmsPage[] = [];
  const seen = new Set<string>();
  const walk = async (items: readonly SidebarItem[], section: string) => {
    for (const item of items) {
      if (item.link !== undefined && !seen.has(item.link)) {
        seen.add(item.link);
        const { description, body } = splitFrontMatter(await read(resolvePath(srcDir, sourceOf(item.link))));
        pages.push({
          section,
          title: item.text ?? item.link,
          link: item.link,
          description,
          markdown: await pageMarkdown(body, srcDir, read)
        });
      }
      if (item.items !== undefined) {
        await walk(item.items, item.link === undefined ? (item.text ?? section) : section);
      }
    }
  };
  await walk(sidebar, 'Gesso');
  return pages;
}

const INTRO = [
  '# Gesso',
  '',
  '> A declarative UI toolkit for the web in the spirit of SwiftUI and Jetpack Compose: components that run once, a real layout engine with typed props, and a theme instead of CSS. The interface is drawn to a canvas from a worker.',
  '',
  'Gesso is not React and has no DOM. A component function runs once, state is a cell bound into the tree, layout is `row`, `column` and `box` with typed props, and colour comes from theme tokens. Read "Components run once" and "Cells and bindings" before writing a component.',
  '',
  `Every page below is also available as markdown at its URL with \`.md\` appended. Each section is also one file, listed under "Whole sections" with its size, so an agent can read the part it needs at once: start with the Guide. The whole site is one file at ${SITE}/llms-full.txt, which is larger than most models can hold.`
].join('\n');

/**
 * The most characters a section file holds before it is split into
 * parts: about 75,000 tokens, which leaves a model room to work. A
 * section is split between pages, never inside one.
 */
export const SECTION_LIMIT = 300_000;

/** A section's file, as `llms.txt` lists it. */
export interface LlmsSection {
  readonly title: string;
  readonly fileName: string;
  readonly text: string;
}

/** `Guide` → `guide`, `Text and type` → `text-and-type`. */
function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * The site again, one file per sidebar section, in sidebar order:
 * `llms-guide.txt`, `llms-layout.txt` … A section larger than `limit`
 * becomes numbered parts, `llms-components-1.txt` and on.
 *
 * `llms-full.txt` is every page in one file, and was the only way to
 * read more than one page at a time; at 1.9 MB, about 470,000 tokens,
 * no model holds it. A section is the unit an agent asks for anyway:
 * the guide to write its first screen, the components to find one.
 */
export function llmsSections(pages: readonly LlmsPage[], limit = SECTION_LIMIT): LlmsSection[] {
  const groups: { title: string; pages: LlmsPage[] }[] = [];
  for (const page of pages) {
    const last = groups[groups.length - 1];
    if (last?.title === page.section) {
      last.pages.push(page);
    } else {
      groups.push({ title: page.section, pages: [page] });
    }
  }
  const out: LlmsSection[] = [];
  for (const group of groups) {
    const parts: string[][] = [[]];
    let size = 0;
    for (const page of group.pages) {
      const text = `<!-- ${SITE}${page.link} -->\n\n${page.markdown}`;
      if (size > 0 && size + text.length > limit) {
        parts.push([]);
        size = 0;
      }
      parts[parts.length - 1]!.push(text);
      size += text.length;
    }
    parts.forEach((part, index) => {
      const numbered = parts.length === 1 ? '' : `-${index + 1}`;
      const title = parts.length === 1 ? group.title : `${group.title}, part ${index + 1} of ${parts.length}`;
      out.push({
        title,
        fileName: `llms-${slug(group.title)}${numbered}.txt`,
        text: [`# Gesso: ${title}`, ...part].join('\n\n---\n\n') + '\n'
      });
    });
  }
  return out;
}

/** The `llms.txt` index: every page, then every section's file with its size. */
export function llmsIndex(pages: readonly LlmsPage[], files: readonly LlmsSection[] = llmsSections(pages)): string {
  const sections: string[] = [INTRO];
  let current: string | null = null;
  for (const page of pages) {
    if (page.section !== current) {
      current = page.section;
      sections.push('', `## ${current}`, '');
    }
    const summary = page.description === '' ? '' : `: ${page.description}`;
    sections.push(`- [${page.title}](${SITE}/${sourceOf(page.link)})${summary}`);
  }
  if (files.length > 0) {
    sections.push('', '## Whole sections', '');
    for (const file of files) {
      const tokens = Math.max(1, Math.round(file.text.length / 4 / 1000));
      sections.push(`- [${file.title}](${SITE}/${file.fileName}): about ${tokens},000 tokens`);
    }
  }
  return sections.join('\n') + '\n';
}

/** `llms-full.txt`: every page, in order, each headed by where it lives. */
export function llmsFull(pages: readonly LlmsPage[]): string {
  const parts = [INTRO];
  for (const page of pages) {
    parts.push(`<!-- ${SITE}${page.link} -->\n\n${page.markdown}`);
  }
  return parts.join('\n\n---\n\n');
}

/**
 * The plugin: on the client build only, so the files are emitted once,
 * into the root of the site.
 */
export function llmsFiles(sidebar: readonly SidebarItem[]): Plugin {
  let srcDir = '';
  return {
    name: 'gesso-docs:llms',
    apply: 'build',
    configResolved(config) {
      srcDir = config.root;
    },
    async generateBundle() {
      if (this.environment.name !== 'client') {
        return;
      }
      const read = (path: string) => this.fs.readFile(path, { encoding: 'utf8' });
      const pages = await collectPages(sidebar, srcDir, read);
      for (const page of pages) {
        this.emitFile({ type: 'asset', fileName: sourceOf(page.link), source: page.markdown });
      }
      const sections = llmsSections(pages);
      for (const section of sections) {
        this.emitFile({ type: 'asset', fileName: section.fileName, source: section.text });
      }
      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: llmsIndex(pages, sections) });
      this.emitFile({ type: 'asset', fileName: 'llms-full.txt', source: llmsFull(pages) });
      this.info(`llms.txt: ${pages.length} pages`);
    }
  };
}
