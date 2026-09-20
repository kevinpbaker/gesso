/**
 * The generated reference pages.
 *
 * Two pages on the docs site are not written by hand:
 *
 *   apps/docs/reference/properties.md  the property registry
 *   apps/docs/reference/api.md         the author-facing API index
 *
 * Both are generated from committed sources, so neither can quietly go
 * stale the way a hand-maintained table does. `pnpm docs:reference`
 * rewrites them; `pnpm docs:reference:check` regenerates into a temp
 * directory and fails on any difference, which is the same shape as
 * `pnpm api:check` and is meant to run beside it.
 *
 * Where each half comes from:
 *
 *   - The properties page reads `UiProperties` at runtime, so name,
 *     default, inheritance and dirty flags are the values the runtime
 *     itself uses, not a transcription of them. It runs through
 *     vite-node rather than node for the same reason `bench:graph`
 *     does: the dirty flags are a TypeScript enum, which the strip-only
 *     loader in node rejects, and the registry imports its neighbours
 *     without file extensions.
 *   - The API index reads the committed `packages/*\/api/*.api.d.ts`
 *     reports, which are the honest record of the public surface, and
 *     narrows them to the names an application actually types.
 *
 * That narrowing needs a list, and where the list should live is an
 * open question: a file in the docs, or an `exports`
 * split in the packages. This script takes the first, and the list is
 * `apps/docs/src/reference/author-surface.ts`. Nothing under
 * `packages/` is restructured, the packages keep exporting what they
 * export, and the docs own the editorial decision about what a reader
 * should be shown. The header of that file argues the case; the page
 * itself says where the list is, so a reader who disagrees with an
 * omission knows which file to edit.
 *
 * Prose in both pages is hand written, in the two curated files, and
 * never lifted from TSDoc unedited: source comments are written for
 * somebody changing the code, and they carry em dashes, which this
 * site does not use. The generator refuses to emit an em dash at all.
 *
 *   pnpm docs:reference          # rewrite the pages
 *   pnpm docs:reference:check    # verify; exits non-zero on drift
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { DirtyFlags } from '../packages/core/src/graph/DirtyFlags.ts';
import { UiProperties } from '../packages/core/src/properties/UiProperty.ts';
import type { UiPropertyDefinition } from '../packages/core/src/properties/UiPropertyDefinition.ts';
import {
  AUTHOR_SURFACE,
  AUTHOR_SURFACE_GROUPS,
  type SurfacePackage
} from '../apps/docs/src/reference/author-surface.ts';
import { MAX_TSDOC_SUMMARY, PROPERTY_GROUPS, PROPERTY_NOTES } from '../apps/docs/src/reference/property-notes.ts';

const root = join(import.meta.dirname, '..');
const check = process.argv.includes('--check');

/**
 * The em dash, spelled by code point.
 *
 * The site does not use them, and neither does this file: writing the
 * character here would put one in the very script whose job is to keep
 * them out, and defeat the `grep` that checks for them.
 */
const EM_DASH = '\u2014';

/** Where the generated pages live, relative to the repository root. */
const PAGES = {
  properties: 'apps/docs/reference/properties.md',
  api: 'apps/docs/reference/api.md'
} as const;

/** The packages that carry an API report, in the order the index reads. */
const PACKAGES: readonly SurfacePackage[] = ['core', 'framework', 'components', 'testing', 'devtools'];

/** Anything that would make a page unreadable, collected before failing. */
const problems: string[] = [];

function fail(message: string): void {
  problems.push(message);
}

// ---------------------------------------------------------------------------
// The property registry
// ---------------------------------------------------------------------------

/** The dirty flags a property can declare, in the order they read. */
const FLAG_NAMES: readonly (readonly [string, DirtyFlags])[] = [
  ['Content', DirtyFlags.Content],
  ['Paint', DirtyFlags.Paint],
  ['Layout', DirtyFlags.Layout],
  ['SubtreeLayout', DirtyFlags.SubtreeLayout],
  ['Children', DirtyFlags.Children],
  ['Transform', DirtyFlags.Transform],
  ['Properties', DirtyFlags.Properties],
  ['Environment', DirtyFlags.Environment],
  ['Semantics', DirtyFlags.Semantics]
];

function formatFlags(affects: DirtyFlags): string {
  const set = FLAG_NAMES.filter(([, bit]) => (affects & bit) !== 0).map(([name]) => name);
  return set.length === 0 ? 'None' : set.join(', ');
}

/**
 * Renders a default value for a table cell.
 *
 * Most are `undefined`, which is the honest answer: the property is
 * unset, and what the node ends up with comes from inheritance or from
 * whatever reads it. The rest are small enough to print, and the ones
 * that are not have an override in `property-notes.ts`.
 */
function formatDefault(value: unknown): string {
  if (value === undefined) {
    return '`unset`';
  }
  if (value instanceof Set) {
    const members = [...value].map(member => String(member));
    return members.length === 0 ? '`empty set`' : `\`${members.join(', ')}\``;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? '`empty`' : `\`${JSON.stringify(value)}\``;
  }
  if (typeof value === 'string') {
    return `\`${value}\``;
  }
  return `\`${JSON.stringify(value)}\``;
}

/**
 * The first sentence of each property's doc comment, by property name.
 *
 * Read from the source text rather than from the runtime, because a
 * comment is not a value. Only used where `property-notes.ts` has
 * nothing to say, and rejected there if it is long or carries a dash.
 */
function tsdocSummaries(): Map<string, string> {
  const source = readFileSync(join(root, 'packages/core/src/properties/UiProperty.ts'), 'utf8');
  const entry = /(?:^ {2}\/\*\*\n(?<doc>(?: {3}\*.*\n)*) {3}\*\/\n)?^ {2}(?<key>[A-Za-z0-9_]+): defineProperty/gm;
  const out = new Map<string, string>();
  for (const match of source.matchAll(entry)) {
    const doc = match.groups?.doc;
    const key = match.groups?.key;
    if (doc === undefined || key === undefined) {
      continue;
    }
    const text = doc
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    // A sentence ends at a full stop followed by a space or the end of
    // the comment. Parenthesised lists of values keep their stops
    // inside the sentence, which is why the split is on ". " and not on
    // ".".
    const stop = text.indexOf('. ');
    const sentence = stop === -1 ? text : text.slice(0, stop + 1);
    if (sentence.length > 0) {
      out.set(key, sentence);
    }
  }
  return out;
}

interface PropertyRow {
  readonly name: string;
  readonly note: string;
  readonly defaultValue: string;
  readonly inherited: boolean;
  readonly affects: string;
}

function propertyRows(): Map<string, PropertyRow[]> {
  const summaries = tsdocSummaries();
  const groups = new Map<string, PropertyRow[]>(PROPERTY_GROUPS.map(group => [group.title, []]));
  const registry = UiProperties as unknown as Record<string, UiPropertyDefinition<unknown>>;

  for (const [key, definition] of Object.entries(registry)) {
    if (definition.name !== key) {
      fail(`property \`${key}\` is registered under the name \`${definition.name}\`.`);
    }
    const curated = PROPERTY_NOTES[key];
    if (curated === undefined) {
      fail(`property \`${key}\` has no entry in property-notes.ts, so there is no group to put it in. ` + 'Add one.');
      continue;
    }
    const rows = groups.get(curated.group);
    if (rows === undefined) {
      fail(`property \`${key}\` names group "${curated.group}", which is not in PROPERTY_GROUPS.`);
      continue;
    }
    // A note in the curated file wins. Falling back to the doc comment
    // keeps a newly added property off the critical path, but only if
    // its first sentence is short and free of the dashes the source
    // comments use and this site does not.
    const summary = summaries.get(key);
    const note =
      curated.note ??
      (summary !== undefined && summary.length <= MAX_TSDOC_SUMMARY && !summary.includes(EM_DASH)
        ? summary
        : undefined);
    if (note === undefined) {
      fail(`property \`${key}\` needs a written note; its doc comment is missing, too long, or carries a dash.`);
      continue;
    }
    rows.push({
      name: key,
      note,
      defaultValue: curated.defaultValue ?? formatDefault(definition.defaultValue),
      inherited: definition.inherited,
      affects: formatFlags(definition.affects)
    });
  }

  for (const key of Object.keys(PROPERTY_NOTES)) {
    if (!(key in registry)) {
      fail(`property-notes.ts documents \`${key}\`, which is not in the registry any more.`);
    }
  }
  return groups;
}

function propertiesPage(): string {
  const groups = propertyRows();
  const total = Object.keys(UiProperties).length;
  const inherited = Object.values(UiProperties as unknown as Record<string, UiPropertyDefinition<unknown>>).filter(
    definition => definition.inherited
  ).length;

  const lines: string[] = [
    '---',
    'description: "Every property in the core registry: what it defaults to, whether it inherits, and what changing it invalidates."',
    '---',
    '',
    '# Properties',
    '',
    'Generated by `pnpm docs:reference` from `packages/core/src/properties/UiProperty.ts`.',
    'Do not edit this page; edit the registry, or the notes in',
    '`apps/docs/src/reference/property-notes.ts`.',
    '',
    `There are ${total} properties. Every element accepts every one of them, because a property is a slot on a node rather than something a particular element declares. A property nothing sets costs nothing: it is not stored, and it resolves to the default below.`,
    '',
    '**Default** is what the property resolves to when no ancestor provides it and nothing sets it. `unset` means exactly that: the property holds no value, and whatever reads it decides what to do, which for a length usually means sizing from content. A default printed as plain words rather than in code is one whose real value is an object, described here because printing it would not help.',
    '',
    `**Inherited** means the value is looked up through the environment rather than stopping at the node. ${inherited} properties inherit, and they are all text style: set \`fontSize\` on a container and every text node below reads it. The properties in [Environment](#environment) are the other side of that, the ones that provide a value for a subtree.`,
    '',
    '**Invalidates** is what changing the value marks dirty, which decides how much work the next frame does. `Paint` repaints the node. `Layout` re-runs layout for the box and whatever depends on it. `Content` remeasures text. `Transform` moves what is already painted. `Semantics` republishes the accessibility record. `Properties` marks the value changed without scheduling any of those, for something the input or paint layer reads on demand. `None` means the runtime does no work at all, and something else reads the value when it needs it.',
    '',
    'The groups are editorial. Within a group the order is the order the registry declares them in.',
    ''
  ];

  for (const group of PROPERTY_GROUPS) {
    const rows = groups.get(group.title) ?? [];
    if (rows.length === 0) {
      fail(`property group "${group.title}" ended up empty.`);
      continue;
    }
    lines.push(`## ${group.title}`, '', group.blurb, '');
    lines.push('| Property | Default | Inherited | Invalidates | What it does |');
    lines.push('| -------- | ------- | --------- | ----------- | ------------ |');
    for (const row of rows) {
      lines.push(
        `| \`${row.name}\` | ${row.defaultValue} | ${row.inherited ? 'yes' : 'no'} | ${row.affects} | ${row.note} |`
      );
    }
    lines.push('');
  }

  lines.push(
    '## Next',
    '',
    'The [API index](/reference/api) is the other generated page: the names an application imports, rather than the properties it sets.',
    ''
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// The API index
// ---------------------------------------------------------------------------

/**
 * The names one API report exports.
 *
 * The report writes an export clause one name per line, so a name is a
 * line; `type Foo,` is the same export as `Foo` as far as an index is
 * concerned, and the `type` prefix is dropped.
 */
function exportedNames(report: string): Set<string> {
  const names = new Set<string>();
  for (const match of report.matchAll(/^export \{\n([\s\S]*?)^\};$/gm)) {
    for (const line of match[1].split('\n')) {
      const name = line
        .trim()
        .replace(/,$/, '')
        .replace(/^type\s+/, '')
        .trim();
      if (name.length > 0) {
        names.add(name.split(/\s+as\s+/).pop() ?? name);
      }
    }
  }
  return names;
}

/** How the report declares a name, as a word a reader recognises. */
function declarationKind(report: string, name: string): string | undefined {
  const forms: readonly (readonly [RegExp, string])[] = [
    [new RegExp(String.raw`^declare function ${name}\b`, 'm'), 'function'],
    [new RegExp(String.raw`^declare const ${name}\b`, 'm'), 'const'],
    [new RegExp(String.raw`^declare (?:abstract )?class ${name}\b`, 'm'), 'class'],
    [new RegExp(String.raw`^declare enum ${name}\b`, 'm'), 'enum'],
    [new RegExp(String.raw`^interface ${name}\b`, 'm'), 'interface'],
    [new RegExp(String.raw`^type ${name}\b`, 'm'), 'type']
  ];
  for (const [pattern, kind] of forms) {
    if (pattern.test(report)) {
      return kind;
    }
  }
  return undefined;
}

function apiPage(): string {
  const reports = new Map<SurfacePackage, string>();
  for (const pkg of PACKAGES) {
    const file = join(root, 'packages', pkg, 'api', `${pkg}.api.d.ts`);
    if (!existsSync(file)) {
      fail(`missing API report ${relative(root, file)}; run \`pnpm api:update\`.`);
      continue;
    }
    reports.set(pkg, readFileSync(file, 'utf8'));
  }
  const exported = new Map<SurfacePackage, Set<string>>();
  for (const [pkg, report] of reports) {
    exported.set(pkg, exportedNames(report));
  }

  const titles = new Set(AUTHOR_SURFACE_GROUPS.map(group => group.title));
  const seen = new Set<string>();
  for (const entry of AUTHOR_SURFACE) {
    const key = `${entry.package}:${entry.name}`;
    if (seen.has(key)) {
      fail(`\`${entry.name}\` is listed twice for @gesso/${entry.package}.`);
    }
    seen.add(key);
    if (!titles.has(entry.group)) {
      fail(`\`${entry.name}\` names group "${entry.group}", which is not in AUTHOR_SURFACE_GROUPS.`);
    }
    if (exported.get(entry.package)?.has(entry.name) !== true) {
      fail(`\`${entry.name}\` is not exported by @gesso/${entry.package}; the API report does not list it.`);
    }
    if (entry.page !== undefined && !existsSync(join(root, 'apps/docs', `${entry.page}.md`))) {
      fail(`\`${entry.name}\` links to ${entry.page}, which is not a page on this site.`);
    }
  }

  const lines: string[] = [
    '---',
    'description: "The names an application imports from Gesso, grouped by what they are for and linked to the page that teaches each one."',
    '---',
    '',
    '# API index',
    '',
    'Generated by `pnpm docs:reference` from the committed API reports in `packages/*/api/`.',
    'Do not edit this page; edit `apps/docs/src/reference/author-surface.ts`.',
    '',
    `This is ${AUTHOR_SURFACE.length} names, which is not the whole public surface. The reports the index is built from describe everything the packages export, several hundred names, most of it machinery an application never types. The list of what belongs here is curated by hand in \`apps/docs/src/reference/author-surface.ts\`, seeded from every name the pages and examples on this site actually import. If something you use is missing, that file is the one to add it to.`,
    '',
    'Two things are checked when the page is generated, so neither the names nor the links can rot: every name has to appear in its package API report, and every link has to resolve to a page here. What each name is for is written by hand, in the same file.',
    '',
    'The kind is how the API report declares it, so `class` and `interface` are the report speaking rather than an editorial choice.',
    ''
  ];

  for (const group of AUTHOR_SURFACE_GROUPS) {
    const entries = AUTHOR_SURFACE.filter(entry => entry.group === group.title);
    if (entries.length === 0) {
      fail(`API group "${group.title}" ended up empty.`);
      continue;
    }
    lines.push(`## ${group.title}`, '', group.blurb, '');
    lines.push('| Name | Kind | Package | What it is |');
    lines.push('| ---- | ---- | ------- | ---------- |');
    for (const entry of entries) {
      const report = reports.get(entry.package);
      const kind = report === undefined ? undefined : declarationKind(report, entry.name);
      if (kind === undefined) {
        fail(`\`${entry.name}\` is exported by @gesso/${entry.package} but its declaration was not found.`);
      }
      const label = `\`${entry.name}\``;
      const name = entry.page === undefined ? label : `[${label}](${entry.page})`;
      lines.push(`| ${name} | ${kind ?? 'unknown'} | \`@gesso/${entry.package}\` | ${entry.what} |`);
    }
    lines.push('');
  }

  lines.push(
    '## Next',
    '',
    'The [properties](/reference/properties) page is the other generated one: every property a node can hold, with its default and what changing it invalidates.',
    ''
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Write, or check
// ---------------------------------------------------------------------------

const generated: Record<keyof typeof PAGES, string> = {
  properties: propertiesPage(),
  api: apiPage()
};

for (const [key, body] of Object.entries(generated)) {
  if (body.includes(EM_DASH)) {
    fail(`${PAGES[key as keyof typeof PAGES]} would contain an em dash.`);
  }
}

if (problems.length > 0) {
  console.error('Cannot generate the reference pages:\n');
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  console.error('');
  process.exit(1);
}

if (!check) {
  for (const [key, file] of Object.entries(PAGES)) {
    const path = join(root, file);
    mkdirSync(join(path, '..'), { recursive: true });
    const existed = existsSync(path);
    writeFileSync(path, generated[key as keyof typeof PAGES]);
    console.log(`${existed ? 'updated' : 'created'} ${file}`);
  }
  process.exit(0);
}

// The check regenerates into a temp directory and diffs, so a failure
// reads as a patch rather than as "these differ". node_modules is the
// temp directory for the same reason `api:check` uses it: it is already
// ignored, and it is on the same filesystem.
const temp = join(root, 'node_modules', '.docs-reference');
mkdirSync(temp, { recursive: true });
let drift = 0;
for (const [key, file] of Object.entries(PAGES)) {
  const path = join(root, file);
  const body = generated[key as keyof typeof PAGES];
  const fresh = join(temp, `${key}.md`);
  writeFileSync(fresh, body);
  if (!existsSync(path)) {
    console.error(`missing ${file}; run \`pnpm docs:reference\`.`);
    drift += 1;
    continue;
  }
  if (readFileSync(path, 'utf8') !== body) {
    console.error(`\n${file} is out of date.\n`);
    try {
      execFileSync('diff', ['-u', path, fresh], { stdio: 'inherit' });
    } catch {
      /* diff exits non-zero when the files differ, which is the point. */
    }
    drift += 1;
  }
}

if (drift > 0) {
  console.error(
    `\n${drift} generated page${drift === 1 ? '' : 's'} out of date. ` +
      'Run `pnpm docs:reference` and commit the result.'
  );
  process.exit(1);
}
console.log(`Generated reference pages match for ${Object.keys(PAGES).length} pages.`);
