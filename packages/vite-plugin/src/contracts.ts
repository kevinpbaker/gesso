import type * as TsApi from 'typescript/unstable/sync';

import { blankLiterals, findCalls, importSources } from './source.ts';

/**
 * Channel contracts, read by the type checker and written back as JSON
 * Schema.
 *
 * A contract module already says everything an agent driving the
 * application would need to know: the view's keys and their types, each
 * command's parameters and their types, and, where the author wrote
 * them, what each one is for. All of it is types and comments, and
 * both are gone by the time the module runs. This puts them back, as a
 * `describeChannel(token, schema)` call appended to the module, so the
 * token carries its own description wherever it is imported.
 *
 * The checker rather than the syntax, because a contract names its
 * types where it likes: `ProductRow` from another file, a status union
 * behind an alias, a view written as an object literal whose type is
 * inferred. Only the checker resolves all of those the way the compiler
 * that checked the application did. TypeScript 7's checker runs in a
 * separate process behind an API its package calls unstable, so all of
 * it is in this file, and the rest of the plugin sees one function.
 *
 * What the comments carry:
 *
 *   - The JSDoc on the exported token is the channel's description, on
 *     a view key is that key's, and on a command is the command's.
 *   - `@param name text` describes a parameter.
 *   - `@destructive`, `@idempotent`, `@confirm` and `@hidden` on a
 *     command are its annotations; `CommandSchema` says what each means.
 *   - `@hidden` on a view key keeps that key from an agent; see
 *     `ChannelSchema.hidden`. On the token, it keeps the whole channel
 *     from one; see `ChannelSchema.internal`.
 *
 * And what it will not describe: a value that is not plain data, which
 * cannot cross a channel anyway. A function, a `Date`, a `Map`, a class
 * instance. Each is reported, by its path in the contract, and
 * described as `{}` so the rest of the schema still stands.
 */

/** The parts of `typescript/unstable/sync` this file uses, values included. */
export type TypeScriptApi = typeof TsApi;

/** A channel's description, in the shape `describeChannel` takes. */
export interface ChannelSchemaOut {
  description?: string;
  internal?: true;
  view: JsonSchema;
  hidden?: string[];
  commands: Record<string, CommandSchemaOut>;
}

interface CommandSchemaOut {
  description?: string;
  parameters: string[];
  rest?: true;
  input: JsonSchema;
  destructive?: true;
  idempotent?: true;
  confirm?: true;
  hidden?: true;
}

type JsonSchema = Record<string, unknown>;

/**
 * A component's description: what it is for, and what each of its
 * inputs takes. The catalog an agent designing with the library reads,
 * so that it uses `Badge` rather than drawing one from boxes.
 */
export interface ComponentSchemaOut {
  /** The first paragraph of its JSDoc: what it is, for a list of many. */
  summary?: string;
  /** The whole JSDoc, for the one component being used. */
  description?: string;
  /**
   * Its inputs, as an object schema. Each input says its TypeScript
   * type as `x-gesso-type`, which an agent writing TSX reads more
   * readily than the schema; an input declared on a shared props type
   * (`ControlLayoutProps`) says which as `x-gesso-from`; a callback is
   * `x-gesso-callback` and a child `x-gesso-child`.
   */
  inputs: JsonSchema;
  /** The `@example` blocks, as written. */
  examples?: string[];
  /** The `@deprecated` text, or true when it gives none. */
  deprecated?: string | true;
}

/** Every component a module exports, and what could not be described. */
export interface ComponentReading {
  /** Export name to schema, in declaration order. */
  readonly components: ReadonlyMap<string, ComponentSchemaOut>;
  readonly warnings: readonly string[];
}

/** Every channel a module exports, and what could not be described. */
export interface ContractReading {
  /** Export name to schema, in declaration order. */
  readonly channels: ReadonlyMap<string, ChannelSchemaOut>;
  /** One sentence per value that could not be described, naming where it is. */
  readonly warnings: readonly string[];
}

/** The functions that declare a channel. */
const DECLARATIONS = ['channel', 'defineChannel'];

/**
 * Whether a module declares a channel, without asking the checker.
 *
 * The checker is a process round trip per question, and every module
 * the application has passes through `transform`, so this is the gate:
 * a call to `channel` or `defineChannel` imported from
 * `gesso-framework`. A module that re-exports a token someone else
 * declared is not a contract, and the module that declared it is the
 * one described.
 */
export function declaresChannel(code: string): boolean {
  if (!code.includes('gesso-framework')) {
    return false;
  }
  const blank = blankLiterals(code);
  const imports = importSources(code, blank);
  // `channel<View, Commands>(...)` has type arguments between the name
  // and the parenthesis, which `findCalls` does not look past, and type
  // arguments are the form `channel` is usually written in.
  return DECLARATIONS.some(
    name =>
      imports.get(name) === 'gesso-framework' &&
      (findCalls(code, name, blank).length > 0 || new RegExp(`(?<![\\w$.])${name}\\s*<`).test(blank))
  );
}

/**
 * The code appended to a contract module.
 *
 * An import at the bottom is still hoisted, and appending rather than
 * rewriting leaves every line the author wrote where they wrote it, so
 * the module's source map needs nothing.
 */
export function describeCalls(channels: ReadonlyMap<string, ChannelSchemaOut>): string {
  const lines = ["import { describeChannel as __gessoDescribeChannel } from 'gesso-framework';"];
  for (const [name, schema] of channels) {
    lines.push(`__gessoDescribeChannel(${name}, ${JSON.stringify(schema)});`);
  }
  return `\n${lines.join('\n')}\n`;
}

/**
 * A module that describes channels when it is imported, for a bundle
 * this plugin never sees.
 *
 * The plugin describes a contract by appending to it as Vite bundles
 * it. An Electrobun main process is bundled by Electrobun's own build,
 * which takes no plugins, so there the description is written ahead of
 * time instead: `gesso-channels` reads the contracts with the same
 * checker and writes this module, and the main process imports it once.
 * A token is imported from its contract, so the schema lands on the
 * same object the application serves.
 *
 * `outFile` and every `file` are absolute POSIX paths.
 */
export function describedModule(
  contracts: readonly { readonly file: string; readonly channels: ReadonlyMap<string, ChannelSchemaOut> }[],
  outFile: string
): string {
  const lines = [
    '// Written by gesso-channels from the channel contracts it names below.',
    '// Run it again after changing a contract rather than editing this file.',
    "import { describeChannel } from 'gesso-framework';"
  ];
  const from = outFile.slice(0, outFile.lastIndexOf('/'));
  for (const contract of contracts) {
    if (contract.channels.size > 0) {
      const names = [...contract.channels.keys()].join(', ');
      lines.push(`import { ${names} } from '${importPath(from, contract.file)}';`);
    }
  }
  for (const contract of contracts) {
    for (const [name, schema] of contract.channels) {
      lines.push('', `describeChannel(${name}, ${JSON.stringify(schema, null, 2)});`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** `./Counter` from `/app/src/shared` to `/app/src/shared/Counter.ts`, without the extension. */
function importPath(fromDir: string, file: string): string {
  const from = fromDir.split('/').filter(Boolean);
  const to = file
    .replace(/\.[cm]?[jt]sx?$/, '')
    .split('/')
    .filter(Boolean);
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) {
    shared++;
  }
  const up = from.length - shared;
  const rest = to.slice(shared).join('/');
  return up === 0 ? `./${rest}` : `${'../'.repeat(up)}${rest}`;
}

/**
 * The checker, held open across reads.
 *
 * Spawning it and loading a project costs about a hundred
 * milliseconds; a question after that costs well under one. So one
 * reader lives as long as the dev server or the build, is told which
 * files changed between reads, and is closed at the end, because the
 * process it holds would otherwise keep the build from exiting.
 */
export class ContractReader {
  private api: TsApi.API | null = null;
  private readonly changed = new Set<string>();
  private readonly created = new Set<string>();
  private readonly deleted = new Set<string>();
  /** Each contract's tsconfig, found once. */
  private readonly configs = new Map<string, string>();

  /**
   * @param fs Callbacks the checker reads through before the disk, for
   *   a spec that keeps its project in memory.
   */
  private readonly ts: TypeScriptApi;
  private readonly cwd: string;
  private readonly fs: TsApi.APIOptions['fs'];

  // Fields assigned by hand rather than parameter properties: the
  // plugin is loaded by Node's type stripping, which rejects those.
  constructor(ts: TypeScriptApi, cwd: string, fs?: TsApi.APIOptions['fs']) {
    this.ts = ts;
    this.cwd = cwd;
    this.fs = fs;
  }

  /**
   * A file changed on disk since the last read. A new or deleted one is
   * said so, because a program's list of files only changes for those:
   * a component in a new file is otherwise not in the catalog.
   */
  invalidate(file: string, event: 'update' | 'create' | 'delete' = 'update'): void {
    (event === 'create' ? this.created : event === 'delete' ? this.deleted : this.changed).add(file);
  }

  /**
   * A snapshot of the projects, with what changed since the last one.
   *
   * The checker keeps every project it has opened, and asked to update
   * one whose tsconfig has since been deleted it refuses the whole
   * update ("project not found for update"). That was a dev server gone
   * with it: a project's tsconfig removed while the server ran threw out
   * of the catalog's read and took the process down. A refused update is
   * a checker started afresh, which reads the disk as it now is and
   * opens only what is asked of it again.
   */
  private snapshot(request: NonNullable<Parameters<TsApi.API['updateSnapshot']>[0]>): TsApi.Snapshot {
    const api = (this.api ??= new this.ts.API({ cwd: this.cwd, ...(this.fs === undefined ? {} : { fs: this.fs }) }));
    try {
      return api.updateSnapshot({ ...request, fileChanges: this.takeChanges() });
    } catch {
      this.close();
      this.configs.clear();
      const fresh = (this.api = new this.ts.API({ cwd: this.cwd, ...(this.fs === undefined ? {} : { fs: this.fs }) }));
      const { fileChanges: _changes, ...rest } = request;
      return fresh.updateSnapshot(rest);
    }
  }

  /** What changed since the last snapshot, emptied for the next. */
  private takeChanges(): { changed: string[]; created: string[]; deleted: string[] } {
    const changes = { changed: [...this.changed], created: [...this.created], deleted: [...this.deleted] };
    this.changed.clear();
    this.created.clear();
    this.deleted.clear();
    return changes;
  }

  /** Every channel `file` exports, described. */
  read(file: string): ContractReading {
    const opened = this.open(file);
    if (typeof opened === 'string') {
      return { channels: new Map(), warnings: [opened] };
    }
    const { checker, exports } = opened;
    const describer = new Describer(this.ts, checker);
    const channels = new Map<string, ChannelSchemaOut>();
    for (const exported of exports) {
      const type = checker.getTypeOfSymbol(exported);
      if (type === undefined || type.getSymbol()?.name !== 'ChannelToken') {
        continue;
      }
      const [view, commands] = checker.getTypeArguments(type as TsApi.TypeReference);
      channels.set(exported.name, describer.channel(exported, view, commands));
    }
    return { channels, warnings: describer.warnings };
  }

  /**
   * Every component `file` exports, described: a function whose first
   * parameter is `Inputs<P>`, or a class extending `Component`, whose
   * inputs are its `InputCell` fields. A library's index re-exports its
   * components, and reading it reads all of them.
   */
  readComponents(file: string, config?: string): ComponentReading {
    const opened = this.open(file, config);
    if (typeof opened === 'string') {
      return { components: new Map(), warnings: [opened] };
    }
    const { checker, exports } = opened;
    const describer = new Describer(this.ts, checker, 'component');
    const components = new Map<string, ComponentSchemaOut>();
    for (const exported of exports) {
      const symbol = exported.flags & this.ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const type = checker.getTypeOfSymbol(symbol);
      const inputs = type === undefined ? undefined : this.inputsOf(checker, type);
      if (inputs !== undefined) {
        components.set(exported.name, describer.component(symbol, inputs));
      }
    }
    return { components, warnings: describer.warnings };
  }

  /**
   * The source files of the project `config` describes, with their
   * text: what the project itself wrote, so neither its dependencies
   * nor declaration files. The project's own tsconfig decides what that
   * is, which is the answer the person already gave their editor.
   */
  sources(config: string): { readonly file: string; readonly text: string }[] {
    const snapshot = this.snapshot({ openProjects: [config] });
    const program = snapshot.getProject(config)?.program;
    if (program === undefined) {
      return [];
    }
    const out: { file: string; text: string }[] = [];
    for (const file of program.getSourceFileNames()) {
      if (file.includes('/node_modules/') || /\.d\.[cm]?ts$/.test(file)) {
        continue;
      }
      const text = program.getSourceFile(file)?.text;
      if (text !== undefined) {
        out.push({ file, text });
      }
    }
    return out;
  }

  /** The inputs a component's type declares, or undefined when it is not a component. */
  private inputsOf(checker: TsApi.Checker, type: TsApi.Type): ComponentInputs | undefined {
    const { Call, Construct } = this.ts.SignatureKind;
    const [call] = checker.getSignaturesOfType(type, Call);
    const first = call?.getParameters()[0];
    if (first !== undefined) {
      const parameter = checker.getTypeOfSymbol(first);
      // A helper may take a component's inputs too (`layoutOf(inputs)`);
      // what makes a component is that it gives back something to draw.
      const returns = checker.getReturnTypeOfSignature(call!);
      if (parameter?.getAliasSymbol()?.name === 'Inputs' && returns !== undefined && this.drawable(returns)) {
        const [props] = parameter.getAliasTypeArguments();
        return props === undefined ? undefined : { kind: 'props', type: props };
      }
      return undefined;
    }
    const [construct] = checker.getSignaturesOfType(type, Construct);
    const instance = construct === undefined ? undefined : checker.getReturnTypeOfSignature(construct);
    if (instance === undefined || !this.extendsComponent(instance)) {
      return undefined;
    }
    const cells: { symbol: TsApi.Symbol; type: TsApi.Type }[] = [];
    for (const property of checker.getPropertiesOfType(instance)) {
      const propertyType = checker.getTypeOfSymbol(property);
      if (propertyType?.getSymbol()?.name === 'InputCell') {
        const [value] = checker.getTypeArguments(propertyType as TsApi.TypeReference);
        if (value !== undefined) {
          cells.push({ symbol: property, type: value });
        }
      }
    }
    return { kind: 'cells', cells };
  }

  /** Whether a function returning `type` returns a child: `UiChild`, an element, or a union of them. */
  private drawable(type: TsApi.Type): boolean {
    if (type.getAliasSymbol()?.name === 'UiChild') {
      return true;
    }
    const members = type.isUnionType() ? (type.getTypes() ?? []) : [type];
    return members.some(member => CHILD.has(member.getSymbol()?.name ?? ''));
  }

  private extendsComponent(type: TsApi.Type): boolean {
    for (let depth = 0, current: TsApi.Type | undefined = type; current !== undefined && depth < 16; depth++) {
      if (current.getSymbol()?.name === 'Component') {
        return true;
      }
      current = current.isClassOrInterface() ? current.getBaseTypes()?.[0] : undefined;
    }
    return false;
  }

  /**
   * The checker and the module's exports, or why there are none: read
   * in the project `preferred` names when it includes the file (the
   * catalog's own tsconfig, which may resolve its imports differently
   * from any beside it), else the project TypeScript finds for it.
   */
  private open(
    file: string,
    preferred?: string
  ): { checker: TsApi.Checker; exports: readonly TsApi.Symbol[] } | string {
    this.changed.add(file);
    let snapshot = this.snapshot(preferred === undefined ? {} : { openProjects: [preferred] });
    let config =
      preferred !== undefined && snapshot.getProject(preferred)?.program.getSourceFile(file) !== undefined
        ? preferred
        : this.configs.get(file);
    if (config === undefined) {
      // A file opened through the API is an editor's buffer: the server
      // stops reading it from disk, and an edit the next save makes is
      // never seen. So the file is opened only long enough to learn
      // which project it belongs to, and the project is what stays open.
      config = this.snapshot({ openFiles: [file] }).getDefaultProjectForFile(file)?.configFileName;
      snapshot = this.snapshot({
        ...(config === undefined ? {} : { openProjects: [config] }),
        closeFiles: [file]
      });
      if (config !== undefined) {
        this.configs.set(file, config);
      }
    }
    const project = config === undefined ? undefined : snapshot.getProject(config);
    const source = project?.program.getSourceFile(file);
    if (project === undefined || source === undefined) {
      return `TypeScript has no project that includes ${file}.`;
    }
    const checker = project.checker;
    const module = checker.getSymbolAtLocation(source);
    return { checker, exports: module === undefined ? [] : checker.getExportsOfModule(module) };
  }

  close(): void {
    this.api?.close();
    this.api = null;
  }
}

/**
 * Library types that are objects to the checker and not plain data to
 * a channel. They compare by reference, so `provide` rejects them on
 * their first value; describing their methods as properties would be
 * describing something that never arrives.
 */
const NOT_PLAIN = new Set([
  'Date',
  'Map',
  'ReadonlyMap',
  'Set',
  'ReadonlySet',
  'WeakMap',
  'WeakSet',
  'Promise',
  'RegExp',
  'Error',
  'ArrayBuffer',
  'SharedArrayBuffer',
  'DataView',
  'Blob',
  'File',
  'URL',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array'
]);

/**
 * Bytes, which a command may carry and a view key may not.
 *
 * A command's argument is structured-cloned onto the owning thread, and
 * a typed array or an `ArrayBuffer` clones as itself: a file a person
 * dropped crosses as its bytes, with no encoding pass on the render
 * thread. A view key is diffed, and a differ that compares bytes by
 * reference reports a change on every emission, so there they stay
 * unplain. In a command's schema they are a base64 string, which is
 * what an agent can write, tagged with the type the command expects so
 * the agent surface can turn the string back into it.
 */
export const BINARY = new Set([
  'ArrayBuffer',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array'
]);

/**
 * What a component takes: a function's `P` in `Inputs<P>`, or a class's
 * `InputCell` fields with the type each holds.
 */
type ComponentInputs =
  | { readonly kind: 'props'; readonly type: TsApi.Type }
  | { readonly kind: 'cells'; readonly cells: readonly { symbol: TsApi.Symbol; type: TsApi.Type }[] };

/**
 * The types a component takes as a child. `UiChild` is a union of
 * these and an Observable of them, and describing its members would
 * describe the element records a tag compiles to, which nobody writes.
 */
const CHILD = new Set(['UiElement', 'ComponentLikeElement', 'ComponentElement']);

/**
 * Turns checker types into JSON Schema for one module's channels or
 * components.
 *
 * The two differ in what is allowed. A channel's values cross a thread
 * as plain data, so a function or a class instance in one is a mistake,
 * and is reported. A component's inputs stay on the render thread, where
 * a callback is how a component talks back and a child is how it is
 * composed, so there they are described for what they are and nothing
 * is reported.
 */
class Describer {
  readonly warnings: string[] = [];
  private readonly flags: TypeScriptApi['TypeFlags'];
  /** Describing a command's parameters, where bytes are allowed; see `BINARY`. */
  private inCommand = false;
  /** Types being described right now, to notice a type that contains itself. */
  private readonly inProgress = new Set<number>();
  /** Types found to contain themselves, which are described once in `$defs`. */
  private readonly recursive = new Set<number>();
  /** `$defs` for the schema being built. Reset per root, so each schema stands alone. */
  private defs = new Map<string, JsonSchema>();
  private readonly defNames = new Map<number, string>();
  /** In a component, each named type's `$defs` entry, or null when it is small enough to repeat. */
  private shared = new Map<number, string | null>();

  private readonly ts: TypeScriptApi;
  private readonly checker: TsApi.Checker;

  private readonly mode: 'channel' | 'component';

  constructor(ts: TypeScriptApi, checker: TsApi.Checker, mode: 'channel' | 'component' = 'channel') {
    this.ts = ts;
    this.checker = checker;
    this.flags = ts.TypeFlags;
    this.mode = mode;
  }

  component(symbol: TsApi.Symbol, inputs: ComponentInputs): ComponentSchemaOut {
    this.defs = new Map();
    this.shared = new Map();
    const checker = this.checker;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    const entries =
      inputs.kind === 'cells'
        ? inputs.cells
        : checker.getPropertiesOfType(inputs.type).map(property => ({
            symbol: property,
            type: checker.getTypeOfSymbol(property)
          }));
    const own = inputs.kind === 'props' ? (inputs.type.getAliasSymbol() ?? inputs.type.getSymbol())?.name : undefined;
    for (const { symbol: property, type: given } of entries) {
      const path = `${symbol.name}.${property.name}`;
      // `width?: UiLength` reads as `UiLength | undefined`, a union with
      // no name, and the name is what lets `UiLength` be described once.
      // Optionality is said by `required`, so the `undefined` can go.
      const type =
        given !== undefined && this.includesUndefined(given) && !this.includesNull(given)
          ? (checker.getNonNullableType(given) ?? given)
          : given;
      let schema: JsonSchema = type === undefined ? {} : this.describe(type, path);
      if (type !== undefined) {
        schema = { ...schema, 'x-gesso-type': this.typeText(type) };
      }
      const description = checker.getDocumentationCommentOfSymbol(property);
      if (description !== '') {
        schema.description = description;
      }
      const fallback = checker.getJsDocTagsOfSymbol(property).find(tag => tag.name === 'default');
      if (fallback?.text !== undefined) {
        schema.default = parseDefault(fallback.text);
      }
      const from = property.getParent()?.name;
      if (own !== undefined && from !== undefined && from !== own && !from.startsWith('__')) {
        schema['x-gesso-from'] = from;
      }
      properties[property.name] = schema;
      // A class's cells are all optional to the parent, as
      // `ComponentProps` makes them.
      const optional =
        inputs.kind === 'cells' ||
        (property.flags & this.ts.SymbolFlags.Optional) !== 0 ||
        (given !== undefined && this.includesUndefined(given));
      if (!optional) {
        required.push(property.name);
      }
    }
    const schema: JsonSchema = { type: 'object', properties, additionalProperties: false };
    if (required.length > 0) {
      schema.required = required;
    }
    if (this.defs.size > 0) {
      schema.$defs = Object.fromEntries(this.defs);
    }

    const out: ComponentSchemaOut = { inputs: schema };
    const description = this.componentDocumentation(symbol, inputs);
    if (description !== '') {
      out.summary = description
        .split(/\n\s*\n/)[0]!
        .replace(/\s+/g, ' ')
        .trim();
      out.description = description;
    }
    const tags = checker.getJsDocTagsOfSymbol(symbol);
    const examples = tags.filter(tag => tag.name === 'example' && tag.text !== undefined).map(tag => tag.text!);
    if (examples.length > 0) {
      out.examples = examples;
    }
    const deprecated = tags.find(tag => tag.name === 'deprecated');
    if (deprecated !== undefined) {
      out.deprecated = deprecated.text === undefined || deprecated.text.trim() === '' ? true : deprecated.text.trim();
    }
    return out;
  }

  /**
   * What a component is for: its own JSDoc, else its props type's. A
   * comment elsewhere in its file is not read: no rule about which one
   * describes the component holds across files, and a summary that is
   * sometimes about something else is worse to an agent than none.
   */
  private componentDocumentation(symbol: TsApi.Symbol, inputs: ComponentInputs): string {
    const own = this.checker.getDocumentationCommentOfSymbol(symbol);
    if (own !== '') {
      return own;
    }
    const props = inputs.kind === 'props' ? (inputs.type.getAliasSymbol() ?? inputs.type.getSymbol()) : undefined;
    return props === undefined ? '' : this.checker.getDocumentationCommentOfSymbol(props);
  }

  /** The type as TypeScript writes it, without the `undefined` an optional input carries. */
  private typeText(type: TsApi.Type): string {
    const defined = this.includesUndefined(type) ? this.checker.getNonNullableType(type) : type;
    const text = this.checker.typeToString(defined ?? type);
    // `getNonNullableType` takes `null` too, which an input may mean.
    return this.includesNull(type) && !/\bnull\b/.test(text) ? `${text} | null` : text;
  }

  private includesNull(type: TsApi.Type): boolean {
    const isNull = (member: TsApi.Type) => (member.flags & this.flags.Null) !== 0;
    return type.isUnionType() ? (type.getTypes() ?? []).some(isNull) : isNull(type);
  }

  channel(token: TsApi.Symbol, view: TsApi.Type, commands: TsApi.Type | undefined): ChannelSchemaOut {
    const out: ChannelSchemaOut = { view: this.root(view, `${token.name}.view`), commands: {} };
    const description = this.checker.getDocumentationCommentOfSymbol(token);
    if (description !== '') {
      out.description = description;
    }
    if (this.checker.getJsDocTagsOfSymbol(token).some(tag => tag.name === 'hidden')) {
      out.internal = true;
    }
    const hidden = this.checker
      .getPropertiesOfType(view)
      .filter(key => this.checker.getJsDocTagsOfSymbol(key).some(tag => tag.name === 'hidden'))
      .map(key => key.name);
    if (hidden.length > 0) {
      out.hidden = hidden;
    }
    if (commands !== undefined) {
      for (const command of this.checker.getPropertiesOfType(commands)) {
        const described = this.command(command, `${token.name}.commands.${command.name}`);
        if (described !== null) {
          out.commands[command.name] = described;
        }
      }
    }
    return out;
  }

  /** A schema that stands alone: its own `$defs`, if anything in it recurs. */
  private root(type: TsApi.Type, path: string): JsonSchema {
    this.defs = new Map();
    const schema = this.describe(type, path);
    if (this.defs.size > 0) {
      return { ...schema, $defs: Object.fromEntries(this.defs) };
    }
    return schema;
  }

  private command(symbol: TsApi.Symbol, path: string): CommandSchemaOut | null {
    const type = this.checker.getTypeOfSymbol(symbol);
    const signatures = type === undefined ? [] : this.checker.getSignaturesOfType(type, this.ts.SignatureKind.Call);
    if (signatures.length === 0) {
      this.warnings.push(`${path} is not a function, so it is not a command an agent can send.`);
      return null;
    }
    if (signatures.length > 1) {
      this.warnings.push(`${path} is overloaded; only its first signature is described.`);
    }
    const signature = signatures[0];
    const tags = this.checker.getJsDocTagsOfSymbol(symbol);
    const parameters = signature.getParameters();

    this.defs = new Map();
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    this.inCommand = true;
    parameters.forEach((parameter, index) => {
      const parameterType = this.checker.getTypeOfSymbol(parameter);
      const optional = parameterType !== undefined && this.includesUndefined(parameterType);
      const schema = parameterType === undefined ? {} : this.describe(parameterType, `${path}(${parameter.name})`);
      const description = this.parameterDescription(parameter, tags);
      properties[parameter.name] = description === '' ? schema : { ...schema, description };
      const rest = signature.hasRestParameter && index === parameters.length - 1;
      if (!optional && !rest) {
        required.push(parameter.name);
      }
    });
    this.inCommand = false;
    const input: JsonSchema = { type: 'object', properties, additionalProperties: false };
    if (required.length > 0) {
      input.required = required;
    }
    if (this.defs.size > 0) {
      input.$defs = Object.fromEntries(this.defs);
    }

    const out: CommandSchemaOut = { parameters: parameters.map(parameter => parameter.name), input };
    const description = this.checker.getDocumentationCommentOfSymbol(symbol);
    if (description !== '') {
      out.description = description;
    }
    if (signature.hasRestParameter) {
      out.rest = true;
    }
    for (const annotation of ['destructive', 'idempotent', 'confirm', 'hidden'] as const) {
      if (tags.some(tag => tag.name === annotation)) {
        out[annotation] = true;
      }
    }
    return out;
  }

  /**
   * A parameter's own comment, or failing that its `@param` line.
   *
   * The checker attaches `@param` text to the parameter of a method
   * signature. A command written as a property, `move: (from: number)
   * => void`, keeps its comment on the property, so the tag is read
   * from there instead.
   */
  private parameterDescription(parameter: TsApi.Symbol, tags: readonly TsApi.JSDocTagInfo[]): string {
    const own = this.checker.getDocumentationCommentOfSymbol(parameter);
    if (own !== '') {
      return own;
    }
    for (const tag of tags) {
      const match = tag.name === 'param' ? /^\s*(\S+)\s*(?:-\s*)?([\s\S]*)$/.exec(tag.text ?? '') : null;
      if (match !== null && match[1] === parameter.name) {
        return match[2].trim();
      }
    }
    return '';
  }

  private includesUndefined(type: TsApi.Type): boolean {
    const { Undefined, Void } = this.flags;
    if (type.isUnionType()) {
      return (type.getTypes() ?? []).some(member => (member.flags & (Undefined | Void)) !== 0);
    }
    return (type.flags & (Undefined | Void)) !== 0;
  }

  /**
   * In a component, a named type an input uses (`UiLength`, a props
   * interface) is described once, in `$defs`, and referred to after.
   * Every control takes the same layout inputs, and spelled out at each
   * use they were most of each component's description: an agent reads
   * these, and pays for every repetition.
   */
  private describe(type: TsApi.Type, path: string): JsonSchema {
    if (this.mode !== 'component') {
      return this.describeType(type, path);
    }
    const known = this.shared.get(type.id);
    if (known !== undefined) {
      return known === null ? this.describeType(type, path) : { $ref: `#/$defs/${known}` };
    }
    const name = (type.getAliasSymbol() ?? type.getSymbol())?.name;
    if (name === undefined || name.startsWith('__') || name === 'Array' || name === 'ReadonlyArray') {
      return this.describeType(type, path);
    }
    const schema = this.describeType(type, path);
    if (schema.$ref !== undefined || isSmall(schema)) {
      this.shared.set(type.id, null);
      return schema;
    }
    const defName = this.defName(type);
    this.defs.set(defName, schema);
    this.shared.set(type.id, defName);
    return { $ref: `#/$defs/${defName}` };
  }

  private describeType(type: TsApi.Type, path: string): JsonSchema {
    const f = this.flags;
    const flags = type.flags;

    if (flags & (f.Any | f.Unknown)) {
      return {};
    }
    if (flags & f.Never) {
      this.warnings.push(
        `${path} is never, which describes no value. An empty array literal is never[] unless it says what it holds: write \`[] as Row[]\`.`
      );
      return { not: {} };
    }
    if (flags & (f.String | f.TemplateLiteral | f.StringMapping)) {
      return { type: 'string' };
    }
    if (flags & f.Number) {
      return { type: 'number' };
    }
    if (flags & f.Boolean) {
      return { type: 'boolean' };
    }
    if (flags & f.Null) {
      return { type: 'null' };
    }
    if (flags & (f.Undefined | f.Void)) {
      return {};
    }
    if (flags & f.BooleanLiteral) {
      return { const: (type as TsApi.IntrinsicType).intrinsicName === 'true' };
    }
    if (flags & (f.StringLiteral | f.NumberLiteral)) {
      return { const: (type as TsApi.LiteralType).value };
    }
    if (flags & (f.BigInt | f.BigIntLiteral | f.ESSymbol | f.UniqueESSymbol)) {
      return this.unplain(path, flags & f.BigIntLike ? 'a bigint' : 'a symbol');
    }
    if (type.isUnionType()) {
      return this.union(type, path);
    }
    if (flags & f.TypeParameter) {
      return {};
    }
    if (flags & (f.Object | f.Intersection)) {
      // An array is a container rather than a type that can contain
      // itself: `readonly Row[]` in a view and in `Row.children` is one
      // type, and treating it as named would put the array in `$defs`
      // instead of the row.
      if (this.checker.isArrayType(type)) {
        const [element] = this.checker.getTypeArguments(type as TsApi.TypeReference);
        return { type: 'array', items: element === undefined ? {} : this.describe(element, `${path}[]`) };
      }
      if (this.checker.isTupleType(type)) {
        return this.tuple(type as TsApi.TypeReference, path);
      }
      return this.named(type, path);
    }
    this.warnings.push(`${path} has a type this reader does not describe, so it is left open.`);
    return {};
  }

  /**
   * A union, with `undefined` taken out (optionality is said by
   * `required`), `true | false` folded back into `boolean`, and a union
   * of nothing but literals written as an `enum`.
   */
  private union(type: TsApi.UnionType, path: string): JsonSchema {
    const f = this.flags;
    let members = (type.getTypes() ?? []).filter(member => (member.flags & (f.Undefined | f.Void)) === 0);
    if (this.mode === 'component' && members.some(member => CHILD.has(member.getSymbol()?.name ?? ''))) {
      return { 'x-gesso-child': true };
    }
    const booleans = members.filter(member => member.flags & f.BooleanLiteral);
    const schemas: JsonSchema[] = [];
    if (booleans.length === 2) {
      members = members.filter(member => !(member.flags & f.BooleanLiteral));
      schemas.push({ type: 'boolean' });
    }
    if (
      members.length > 0 &&
      schemas.length === 0 &&
      members.every(member => member.flags & (f.StringLiteral | f.NumberLiteral))
    ) {
      return { enum: members.map(member => (member as TsApi.LiteralType).value) };
    }
    // `null` last, so `string | null` reads as a string that may be absent.
    members.sort((a, b) => Number((a.flags & f.Null) !== 0) - Number((b.flags & f.Null) !== 0));
    schemas.push(...members.map(member => this.describe(member, path)));
    return schemas.length === 1 ? schemas[0] : { anyOf: schemas };
  }

  /**
   * An object type, described once however often it appears, and by
   * reference when it contains itself.
   */
  private named(type: TsApi.Type, path: string): JsonSchema {
    const id = type.id;
    if (this.inProgress.has(id)) {
      this.recursive.add(id);
      return { $ref: `#/$defs/${this.defName(type)}` };
    }
    this.inProgress.add(id);
    const schema = this.object(type, path);
    this.inProgress.delete(id);
    if (this.recursive.has(id)) {
      const name = this.defName(type);
      this.defs.set(name, schema);
      return { $ref: `#/$defs/${name}` };
    }
    return schema;
  }

  private defName(type: TsApi.Type): string {
    let name = this.defNames.get(type.id);
    if (name === undefined) {
      const base = (type.getAliasSymbol() ?? type.getSymbol())?.name ?? 'Type';
      const taken = new Set(this.defNames.values());
      name = taken.has(base) ? `${base}${type.id}` : base;
      this.defNames.set(type.id, name);
    }
    return name;
  }

  private object(type: TsApi.Type, path: string): JsonSchema {
    const checker = this.checker;
    const symbolName = type.getSymbol()?.name;
    if (this.mode === 'component') {
      if (symbolName !== undefined && CHILD.has(symbolName)) {
        return { 'x-gesso-child': true };
      }
      if (checker.getSignaturesOfType(type, this.ts.SignatureKind.Call).length > 0) {
        return { 'x-gesso-callback': true };
      }
      // A generic class's instance, `Observable<string>`, is a reference
      // to the class rather than the class, so it is the symbol that
      // says what it is.
      if (
        (symbolName !== undefined && NOT_PLAIN.has(symbolName)) ||
        ((type.getSymbol()?.flags ?? 0) & this.ts.SymbolFlags.Class) !== 0
      ) {
        // Something only code can make, such as a `UiColor`: an agent
        // has the type's name to go on and nothing to fill in.
        return { 'x-gesso-type': checker.typeToString(type) };
      }
    }
    if (symbolName !== undefined && this.inCommand && BINARY.has(symbolName)) {
      return { type: 'string', contentEncoding: 'base64', 'x-gesso-binary': symbolName };
    }
    // Shared memory may sit in a view: it compares by identity, which is
    // right for a handle on memory, and an agent is shown its size (see
    // `describeSharedMemory`). A command cannot take it from an agent,
    // which has no memory to share, so there it stays unplain.
    if (symbolName === 'SharedArrayBuffer' && !this.inCommand) {
      return { type: 'string', description: 'Shared memory, shown as its size.', 'x-gesso-shared': true };
    }
    if (symbolName !== undefined && NOT_PLAIN.has(symbolName)) {
      return this.unplain(path, `a ${symbolName}`);
    }
    if ((type as TsApi.ObjectType).objectFlags & this.ts.ObjectFlags.Class) {
      return this.unplain(path, `an instance of ${symbolName ?? 'a class'}`);
    }
    if (checker.getSignaturesOfType(type, this.ts.SignatureKind.Call).length > 0) {
      return this.unplain(path, 'a function');
    }

    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const property of checker.getPropertiesOfType(type)) {
      const propertyType = checker.getTypeOfSymbol(property);
      const at = `${path}.${property.name}`;
      if (propertyType === undefined) {
        properties[property.name] = {};
        continue;
      }
      const schema = this.describe(propertyType, at);
      const description = checker.getDocumentationCommentOfSymbol(property);
      properties[property.name] = description === '' ? schema : { ...schema, description };
      const optional = (property.flags & this.ts.SymbolFlags.Optional) !== 0 || this.includesUndefined(propertyType);
      if (!optional) {
        required.push(property.name);
      }
    }
    const schema: JsonSchema = { type: 'object', properties };
    if (required.length > 0) {
      schema.required = required;
    }
    const index = checker.getIndexInfosOfType(type).find(info => info.keyType.flags & this.flags.String);
    if (index !== undefined) {
      schema.additionalProperties = this.describe(index.valueType, `${path}[key]`);
    }
    return schema;
  }

  private tuple(type: TsApi.TypeReference, path: string): JsonSchema {
    const elements = this.checker.getTypeArguments(type);
    const elementFlags = (type.getTarget() as TsApi.TupleType).elementFlags ?? [];
    const { Required, Rest } = this.ts.ElementFlags;
    const prefixItems: JsonSchema[] = [];
    let items: JsonSchema | false = false;
    let minItems = 0;
    elements.forEach((element, index) => {
      const schema = this.describe(element, `${path}[${index}]`);
      if (elementFlags[index] & Rest) {
        items = schema;
      } else {
        prefixItems.push(schema);
        if (elementFlags[index] & Required) {
          minItems = index + 1;
        }
      }
    });
    return { type: 'array', prefixItems, items, minItems };
  }

  private unplain(path: string, what: string): JsonSchema {
    if (this.mode === 'component') {
      // Plain data is a channel's rule; see the class's comment.
      return {};
    }
    this.warnings.push(`${path} is ${what}, which is not plain data and cannot cross a channel.`);
    return {};
  }
}

/**
 * A `@default` tag's value: JSON when it is JSON (`99`, `'neutral'`
 * written with double quotes, `true`), a single-quoted string unquoted,
 * and otherwise the text as written.
 */
function parseDefault(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const quoted = /^'(.*)'$/.exec(trimmed) ?? /^`(.*)`$/.exec(trimmed);
    return quoted === null ? trimmed : quoted[1];
  }
}

/** Whether a schema is as short as a reference to it would be. */
function isSmall(schema: JsonSchema): boolean {
  if (schema.enum !== undefined || schema.const !== undefined) {
    return true;
  }
  const keys = Object.keys(schema);
  return (
    keys.length === 0 || (keys.length === 1 && (typeof schema.type === 'string' || keys[0]!.startsWith('x-gesso-')))
  );
}
