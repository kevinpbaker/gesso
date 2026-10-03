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
  view: JsonSchema;
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

  /** A file changed on disk since the last read. */
  invalidate(file: string): void {
    this.changed.add(file);
  }

  /** Every channel `file` exports, described. */
  read(file: string): ContractReading {
    const api = (this.api ??= new this.ts.API({ cwd: this.cwd, ...(this.fs === undefined ? {} : { fs: this.fs }) }));
    this.changed.add(file);
    let snapshot = api.updateSnapshot({ fileChanges: { changed: [...this.changed] } });
    this.changed.clear();
    let config = this.configs.get(file);
    if (config === undefined) {
      // A file opened through the API is an editor's buffer: the server
      // stops reading it from disk, and an edit the next save makes is
      // never seen. So the file is opened only long enough to learn
      // which project it belongs to, and the project is what stays open.
      config = api.updateSnapshot({ openFiles: [file] }).getDefaultProjectForFile(file)?.configFileName;
      snapshot = api.updateSnapshot({
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
      return { channels: new Map(), warnings: [`TypeScript has no project that includes ${file}.`] };
    }
    const checker = project.checker;
    const module = checker.getSymbolAtLocation(source);
    const describer = new Describer(this.ts, checker);
    const channels = new Map<string, ChannelSchemaOut>();
    for (const exported of module === undefined ? [] : checker.getExportsOfModule(module)) {
      const type = checker.getTypeOfSymbol(exported);
      if (type === undefined || type.getSymbol()?.name !== 'ChannelToken') {
        continue;
      }
      const [view, commands] = checker.getTypeArguments(type as TsApi.TypeReference);
      channels.set(exported.name, describer.channel(exported, view, commands));
    }
    return { channels, warnings: describer.warnings };
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

/** Turns checker types into JSON Schema for one module's channels. */
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

  private readonly ts: TypeScriptApi;
  private readonly checker: TsApi.Checker;

  constructor(ts: TypeScriptApi, checker: TsApi.Checker) {
    this.ts = ts;
    this.checker = checker;
    this.flags = ts.TypeFlags;
  }

  channel(token: TsApi.Symbol, view: TsApi.Type, commands: TsApi.Type | undefined): ChannelSchemaOut {
    const out: ChannelSchemaOut = { view: this.root(view, `${token.name}.view`), commands: {} };
    const description = this.checker.getDocumentationCommentOfSymbol(token);
    if (description !== '') {
      out.description = description;
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

  private describe(type: TsApi.Type, path: string): JsonSchema {
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
    if (symbolName !== undefined && this.inCommand && BINARY.has(symbolName)) {
      return { type: 'string', contentEncoding: 'base64', 'x-gesso-binary': symbolName };
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
    this.warnings.push(`${path} is ${what}, which is not plain data and cannot cross a channel.`);
    return {};
  }
}
