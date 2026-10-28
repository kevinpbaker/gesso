import type { ComponentSchemaOut, ContractReader } from './contracts.ts';

/**
 * The project's components, as tools an AI agent designs with.
 *
 * An agent asked for a settings screen will draw one from boxes unless
 * it knows the project already has a `SettingsRow`, a `Toggle` and a
 * `PageHeader`, what each takes, and where the others are used. Those
 * are the project's own: what its designers and its agents made, not a
 * kit the framework ships. So the catalog is read from the project's
 * source, by the checker that already describes its channels, and a
 * library joins it only when the project names one.
 *
 * Three tools, from cheap to complete, so an agent reads only what it
 * needs:
 *
 *   library_overview   every component, one line each
 *   library_search     the ones a few words find
 *   library_get        one, with every input it takes and where it is used
 *
 * They are answered on the dev server rather than in the page, because
 * the checker runs here and a page need not be open for an agent to
 * learn what it can build with.
 */

/** One component in the catalog. */
export interface CatalogEntry {
  readonly name: string;
  /**
   * Where to import it from: the module's path from the project root
   * without its extension (`src/ui/Picker`), or the library's name.
   */
  readonly from: string;
  /** The library it came from, when it is not the project's own. */
  readonly library?: string;
  readonly schema: ComponentSchemaOut;
  /** Project files that write it as a tag, from the root, its own file left out. */
  readonly usedIn: readonly string[];
}

export interface CatalogLibrary {
  /** The name it is imported by, such as `gesso-components`. */
  readonly name: string;
  /** The module that exports its components: its entry, resolved. */
  readonly file: string;
}

export interface ComponentCatalogOptions {
  /** The tsconfig whose files are the project's source. */
  readonly tsconfig: string;
  /**
   * Libraries whose components join the project's own, resolved when the
   * catalog is first read. None by default.
   */
  readonly libraries?: () => Promise<readonly CatalogLibrary[]>;
  /**
   * Folders under the root whose files are not the project's
   * components nor uses of them, from the root: generated code, say,
   * which names the same components in another framework.
   */
  readonly exclude?: readonly string[];
}

/** A tool, in the shape MCP's `tools/list` returns. */
export interface CatalogTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: { readonly readOnlyHint: true; readonly openWorldHint: false };
}

/** A tool's answer, in the shape MCP's `tools/call` returns. */
export interface CatalogResult {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[];
  readonly structuredContent?: Record<string, unknown>;
  readonly isError: boolean;
}

/** What tells an agent, when it connects, that the catalog is here and to use it. */
export const CATALOG_INSTRUCTIONS =
  'This project has its own components. Before building anything, read them: library_overview lists every one, ' +
  'library_search finds the ones that fit, and library_get gives one in full with the inputs it takes. Use them, ' +
  "and write the theme's names from tokens_view rather than raw colours and sizes.";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

export const CATALOG_TOOLS: readonly CatalogTool[] = [
  {
    name: 'library_overview',
    title: "List the project's components",
    description:
      'Every component this project has, one line each: its name, what it is for, where to import it from and how ' +
      'many files use it. Read it before building anything, and use what is here.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ_ONLY
  },
  {
    name: 'library_search',
    title: 'Find components',
    description:
      'The components whose name, purpose or inputs match a few words, such as "date range" or "avatar". ' +
      'Best matches first.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A few words for what the component should be or do.' } },
      required: ['query'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'library_get',
    title: 'Read a component',
    description:
      'One component in full: what it is for, every input it takes with its type, default and meaning, examples, ' +
      'and the files that already use it, which show how this project writes it.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The component, as library_overview names it.' },
        from: {
          type: 'string',
          description: 'Where it is imported from, when two components share the name.'
        }
      },
      required: ['name'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  }
];

export class ComponentCatalog {
  private cached: Promise<readonly CatalogEntry[]> | null = null;
  private readonly reader: () => Promise<ContractReader | null>;
  private readonly root: string;
  private readonly options: ComponentCatalogOptions;

  constructor(reader: () => Promise<ContractReader | null>, root: string, options: ComponentCatalogOptions) {
    this.reader = reader;
    this.root = root.replace(/\/+$/, '');
    this.options = options;
  }

  /**
   * Something in the project changed. The whole catalog is read again
   * on the next call: a project's components read in a tenth of a
   * second, and a save can move a component between files, rename it,
   * or start using it somewhere else.
   */
  invalidate(): void {
    this.cached = null;
  }

  entries(): Promise<readonly CatalogEntry[]> {
    return (this.cached ??= this.read());
  }

  async call(name: string, args: Readonly<Record<string, unknown>> = {}): Promise<CatalogResult> {
    const reader = await this.reader();
    if (reader === null) {
      return failure('The catalog needs TypeScript 7, which reads the components. Add `typescript` (7 or later).');
    }
    const entries = await this.entries();
    switch (name) {
      case 'library_overview':
        return success(formatOverview(entries), { components: entries.map(summaryOf) });
      case 'library_search': {
        if (typeof args.query !== 'string' || args.query.trim() === '') {
          return failure('library_search needs query: a few words for what the component should be or do.');
        }
        const found = search(entries, args.query);
        if (found.length === 0) {
          return success(`Nothing matches "${args.query}". library_overview lists every component.`, {
            components: []
          });
        }
        return success(formatLines(found), { components: found.map(summaryOf) });
      }
      case 'library_get': {
        if (typeof args.name !== 'string') {
          return failure('library_get needs name: the component, as library_overview names it.');
        }
        const named = entries.filter(entry => entry.name === args.name);
        const matches = typeof args.from === 'string' ? named.filter(entry => entry.from === args.from) : named;
        if (matches.length === 0) {
          const near = search(entries, args.name).slice(0, 3);
          return failure(
            `There is no component called ${args.name}` +
              (near.length === 0 ? '.' : `. Did you mean ${near.map(entry => entry.name).join(', ')}?`)
          );
        }
        if (matches.length > 1) {
          return failure(
            `${matches.length} components are called ${args.name}; say which with from: ` +
              matches.map(entry => JSON.stringify(entry.from)).join(', ')
          );
        }
        const entry = matches[0]!;
        return success(formatEntry(entry), { ...entry, schema: entry.schema } as unknown as Record<string, unknown>);
      }
      default:
        return failure(`There is no tool called ${name}.`);
    }
  }

  private async read(): Promise<readonly CatalogEntry[]> {
    const reader = await this.reader();
    if (reader === null) {
      return [];
    }
    const excluded = (this.options.exclude ?? []).map(folder => `${this.root}/${folder.replace(/^\.?\/+|\/+$/g, '')}/`);
    const sources = reader
      .sources(this.options.tsconfig)
      .filter(
        source =>
          source.file.startsWith(`${this.root}/`) &&
          !/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(source.file) &&
          !excluded.some(folder => source.file.startsWith(folder))
      );
    const found: { name: string; from: string; library?: string; file?: string; schema: ComponentSchemaOut }[] = [];
    for (const source of sources) {
      if (!mayDeclareComponent(source.text)) {
        continue;
      }
      const from = source.file.slice(this.root.length + 1).replace(/\.[cm]?[jt]sx?$/, '');
      for (const [name, schema] of reader.readComponents(source.file).components) {
        found.push({ name, from, file: source.file, schema });
      }
    }
    for (const library of (await this.options.libraries?.()) ?? []) {
      for (const [name, schema] of reader.readComponents(library.file).components) {
        found.push({ name, from: library.name, library: library.name, schema });
      }
    }
    return found.map(component => {
      const tag = new RegExp(`<${component.name}[\\s/>]`);
      const usedIn = sources
        .filter(source => source.file !== component.file && tag.test(source.text))
        .map(source => source.file.slice(this.root.length + 1));
      return {
        name: component.name,
        from: component.from,
        ...(component.library === undefined ? {} : { library: component.library }),
        schema: component.schema,
        usedIn
      };
    });
  }
}

/**
 * Whether a module could declare a component, without asking the
 * checker: it imports from `gesso-framework` and names `Inputs` or
 * `Component`. Most of a project's files are neither, and each one the
 * checker is spared is a round trip to its process.
 */
export function mayDeclareComponent(text: string): boolean {
  return text.includes('gesso-framework') && /\b(?:Inputs|Component)\b/.test(text);
}

function summaryOf(entry: CatalogEntry): Record<string, unknown> {
  return {
    name: entry.name,
    from: entry.from,
    ...(entry.library === undefined ? {} : { library: entry.library }),
    ...(entry.schema.summary === undefined ? {} : { summary: entry.schema.summary }),
    ...(entry.schema.deprecated === undefined ? {} : { deprecated: entry.schema.deprecated }),
    usedIn: entry.usedIn.length
  };
}

function formatOverview(entries: readonly CatalogEntry[]): string {
  if (entries.length === 0) {
    return (
      'This project has no components yet: no module exports a function taking Inputs<P>, or a class extending ' +
      'Component. Build the first ones, and they will be listed here.'
    );
  }
  const own = entries.filter(entry => entry.library === undefined);
  const lines = [
    `${own.length} component${own.length === 1 ? '' : 's'} in this project` +
      (own.length === entries.length ? '' : `, and ${entries.length - own.length} from libraries it names`) +
      '. library_get gives one in full.',
    ''
  ];
  return [...lines, formatLines(entries)].join('\n');
}

/** One line per component, grouped under where each is imported from. */
function formatLines(entries: readonly CatalogEntry[]): string {
  const groups = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.from) ?? [];
    group.push(entry);
    groups.set(entry.from, group);
  }
  const lines: string[] = [];
  for (const [from, group] of groups) {
    lines.push(group[0]!.library === undefined ? from : `${from} (library)`);
    for (const entry of group) {
      const summary = firstSentence(entry.schema.summary);
      const deprecated = entry.schema.deprecated === undefined ? '' : ' [deprecated]';
      const used = entry.usedIn.length === 0 ? '' : ` (used in ${entry.usedIn.length})`;
      lines.push(`  ${entry.name}${deprecated}${summary === '' ? '' : `: ${summary}`}${used}`);
    }
  }
  return lines.join('\n');
}

interface InputSchema {
  readonly properties?: Record<string, Record<string, unknown>>;
  readonly required?: readonly string[];
}

/**
 * One component as an agent writing TSX wants it: the import, each
 * input as `name type = default` with its meaning under it, the shared
 * inputs folded into a line, and the files to copy its use from. The schema itself
 * goes with it as structured content, for a client that validates.
 */
function formatEntry(entry: CatalogEntry): string {
  const schema = entry.schema;
  const lines = [`${entry.name}, from ${entry.from}${entry.library === undefined ? '' : ' (library)'}`];
  if (schema.deprecated !== undefined) {
    lines.push(`Deprecated${schema.deprecated === true ? '.' : `: ${schema.deprecated}`}`);
  }
  if (schema.summary !== undefined) {
    lines.push(schema.summary);
  }
  const inputs = schema.inputs as InputSchema;
  const required = new Set(inputs.required ?? []);
  const own: string[] = [];
  const shared = new Map<string, string[]>();
  for (const [name, input] of Object.entries(inputs.properties ?? {})) {
    const from = input['x-gesso-from'];
    if (typeof from === 'string') {
      shared.set(from, [...(shared.get(from) ?? []), name]);
      continue;
    }
    own.push(`  ${name}${required.has(name) ? '*' : ''} ${describeInput(input)}`);
  }
  lines.push('', own.length === 0 ? 'Inputs: none of its own.' : 'Inputs (* required):', ...own);
  for (const [from, names] of shared) {
    lines.push(`Also takes the inputs of ${from}: ${names.join(', ')}.`);
  }
  if (entry.usedIn.length > 0) {
    lines.push('', `Used in: ${entry.usedIn.join(', ')}`);
  }
  if (schema.examples !== undefined) {
    lines.push('', 'Examples:', ...schema.examples.map(example => indent(example)));
  }
  // The summary is the description's first paragraph with its lines
  // joined, so a one-paragraph description would only say it again.
  if (schema.description !== undefined && schema.description.replace(/\s+/g, ' ').trim() !== schema.summary) {
    lines.push('', 'About it:', indent(schema.description));
  }
  return lines.join('\n');
}

function describeInput(input: Record<string, unknown>): string {
  const type =
    Array.isArray(input.enum) && input.enum.length > 0
      ? input.enum.map(value => JSON.stringify(value)).join(' | ')
      : String(input['x-gesso-type'] ?? 'unknown');
  const kind = input['x-gesso-callback'] === true ? ' (callback)' : input['x-gesso-child'] === true ? ' (child)' : '';
  const fallback = input.default === undefined ? '' : ` = ${JSON.stringify(input.default)}`;
  const meaning = firstParagraph(typeof input.description === 'string' ? input.description : undefined);
  return `${type}${kind}${fallback}${meaning === '' ? '' : `\n      ${meaning}`}`;
}

/**
 * The components a few words find, best first: a word in the name
 * counts most, then in the summary, then in the rest of the description
 * and the input names. A component every word misses is left out.
 */
function search(entries: readonly CatalogEntry[], query: string): CatalogEntry[] {
  // Split as names are, so a near miss for a name (`StatusBadge`) still
  // finds the one it was near (`StatusPill`).
  const words = query
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const scored = entries.map(entry => {
    const name = spaced(entry.name);
    const summary = (entry.schema.summary ?? '').toLowerCase();
    const rest = `${entry.schema.description ?? ''} ${Object.keys(
      (entry.schema.inputs as InputSchema).properties ?? {}
    ).join(' ')}`.toLowerCase();
    let score = 0;
    for (const word of words) {
      score += name.includes(word) ? 6 : summary.includes(word) ? 3 : rest.includes(word) ? 1 : 0;
    }
    return { entry, score };
  });
  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
}

/** `DateRangePicker` as `date range picker datarangepicker`, so both spellings find it. */
function spaced(name: string): string {
  return `${name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')} ${name}`.toLowerCase();
}

function firstSentence(text: string | undefined): string {
  if (text === undefined) {
    return '';
  }
  const flat = text.replace(/\s+/g, ' ').trim();
  const end = flat.search(/[.!?](\s|$)/);
  const sentence = end === -1 ? flat : flat.slice(0, end + 1);
  return sentence.length > 140 ? `${sentence.slice(0, 139)}…` : sentence;
}

function firstParagraph(text: string | undefined): string {
  if (text === undefined) {
    return '';
  }
  const paragraph = text
    .split(/\n\s*\n/)[0]!
    .replace(/\s+/g, ' ')
    .trim();
  return paragraph.length > 240 ? `${paragraph.slice(0, 239)}…` : paragraph;
}

function indent(text: string): string {
  return text
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n');
}

function success(text: string, structured: Record<string, unknown>): CatalogResult {
  return { content: [{ type: 'text', text }], structuredContent: structured, isError: false };
}

function failure(text: string): CatalogResult {
  return { content: [{ type: 'text', text }], isError: true };
}
