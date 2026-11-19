import type { JsonSchema } from '../channel/ChannelSchema';

/**
 * Checks a value against the JSON Schema a channel description uses.
 *
 * Not a general validator. It understands the keywords
 * `gesso-vite-plugin` writes (`type`, `enum`, `const`, `anyOf`,
 * `items`, `prefixItems`, `minItems`, `properties`, `required`,
 * `additionalProperties`, `not` and `$ref` into `$defs`), and passes
 * anything else. That is enough to stop the case that matters: an
 * agent sending `"3"` where a command takes a number, which the
 * command would accept, store, and fail on much later and somewhere
 * else.
 *
 * Returns the first problem as a sentence naming where it is, written
 * for the agent that sent the value so it can correct itself, or null.
 */
export function validate(schema: JsonSchema, value: unknown, root: JsonSchema = schema, at = 'input'): string | null {
  const ref = schema.$ref;
  if (typeof ref === 'string') {
    const name = ref.replace(/^#\/\$defs\//, '');
    const target = (root.$defs as Record<string, JsonSchema> | undefined)?.[name];
    return target === undefined ? null : validate(target, value, root, at);
  }
  if (schema.not !== undefined && validate(schema.not as JsonSchema, value, root, at) === null) {
    return `${at} must not be given.`;
  }
  if ('const' in schema && value !== schema.const) {
    return `${at} must be ${JSON.stringify(schema.const)}.`;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return `${at} must be one of ${schema.enum.map(option => JSON.stringify(option)).join(', ')}.`;
  }
  if (Array.isArray(schema.anyOf)) {
    const options = schema.anyOf as JsonSchema[];
    if (options.some(option => validate(option, value, root, at) === null)) {
      return null;
    }
    // Say what is wrong with the option the value was meant as, not that it is none of them.
    const meant = meantOption(options, value, root);
    if (meant.option !== undefined) {
      return validate(meant.option, value, root, at);
    }
    if (meant.key !== undefined) {
      return `${at}.${meant.key} must be one of ${meant.words.map(word => JSON.stringify(word)).join(', ')}.`;
    }
    return `${at} does not match any of the ${options.length} shapes it may take.`;
  }
  const type = schema.type;
  if (typeof type === 'string' && !hasType(value, type)) {
    // Text where an object or array belongs is JSON that would not parse (repairedArguments parses what does): say so.
    const asText = typeof value === 'string' && (type === 'object' || type === 'array') && /^\s*[[{]/.test(value);
    return `${at} must be ${article(type)}, not ${describe(value)}.${asText ? ` Send the ${type} itself, not text, and as JSON: double quotes round every key and string, no stray brackets.` : ''}`;
  }
  if (Array.isArray(value)) {
    return validateArray(schema, value, root, at);
  }
  if (type === 'object' && value !== null && typeof value === 'object') {
    return validateObject(schema, value as Record<string, unknown>, root, at);
  }
  return null;
}

function validateArray(schema: JsonSchema, value: readonly unknown[], root: JsonSchema, at: string): string | null {
  const prefix = (schema.prefixItems as JsonSchema[] | undefined) ?? [];
  if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
    return `${at} must have at least ${schema.minItems} items.`;
  }
  for (let index = 0; index < value.length; index++) {
    const item = index < prefix.length ? prefix[index] : schema.items;
    if (item === false) {
      return `${at} must have at most ${prefix.length} items.`;
    }
    if (item !== undefined && item !== true) {
      const problem = validate(item as JsonSchema, value[index], root, `${at}[${index}]`);
      if (problem !== null) {
        return problem;
      }
    }
  }
  return null;
}

function validateObject(
  schema: JsonSchema,
  value: Record<string, unknown>,
  root: JsonSchema,
  at: string
): string | null {
  const properties = (schema.properties as Record<string, JsonSchema> | undefined) ?? {};
  const known = Object.keys(properties);
  // Keys the schema does not take, when it takes no others: one may be the required key misnamed (region for regions).
  const strangers =
    schema.additionalProperties === false ? Object.keys(value).filter(key => properties[key] === undefined) : [];
  for (const key of (schema.required as string[] | undefined) ?? []) {
    if (value[key] === undefined) {
      const misnamed = strangers.find(stranger => nearName(stranger, [key]) !== undefined);
      return misnamed === undefined
        ? `${at}.${key} is required.`
        : `${at}.${key} is required. Send it as ${key}, not ${misnamed}.`;
    }
  }
  for (const [key, property] of Object.entries(value)) {
    const declared = properties[key];
    if (declared !== undefined) {
      const problem = property === undefined ? null : validate(declared, property, root, `${at}.${key}`);
      if (problem !== null) {
        return problem;
      }
      continue;
    }
    const extra = schema.additionalProperties;
    if (extra === false) {
      return `${at}.${key} is not expected${known.length > 0 ? `; the fields are ${known.join(', ')}` : ''}.${unexpectedHint(key, properties, root)}`;
    }
    if (extra !== undefined && extra !== true) {
      const problem = validate(extra as JsonSchema, property, root, `${at}.${key}`);
      if (problem !== null) {
        return problem;
      }
    }
  }
  return null;
}

/**
 * What a key the schema does not take was likely meant as, said so the
 * agent can resend at once: a field of the same object it nearly names
 * (expr for expression, colour for color, Units for units), or the
 * object inside this one it belongs in (a beam's length sent beside the
 * beam: "length belongs inside beam: {beam: {length: …}}"). Empty when
 * neither is found.
 */
function unexpectedHint(key: string, properties: Readonly<Record<string, JsonSchema>>, root: JsonSchema): string {
  const near = nearName(key, Object.keys(properties));
  if (near !== undefined) return ` Did you mean ${near}?`;
  const path = belongsIn(properties, key, root, 0);
  if (path === null) return '';
  const where = path.map(step => (step.list ? `${step.name}[…]` : step.name)).join('.');
  const example = path.reduceRight(
    (inner, step) => `{${step.name}: ${step.list ? `[${inner}]` : inner}}`,
    `{${key}: …}`
  );
  return ` ${key} belongs inside ${where}: ${example}.`;
}

/** The objects inside these properties (and the items of their lists), down to the one that takes this key: the names to it, each marked when it is a list; null when none does. */
function belongsIn(
  properties: Readonly<Record<string, JsonSchema>>,
  key: string,
  root: JsonSchema,
  depth: number
): { readonly name: string; readonly list: boolean }[] | null {
  if (depth > 2) return null;
  for (const [name, declared] of Object.entries(properties)) {
    const inner = resolve(declared, root);
    const list = inner.type === 'array';
    const item = list ? (inner.items as JsonSchema | undefined) : inner;
    if (item === undefined || typeof item !== 'object') continue;
    const shape = resolve(item, root);
    const own = shape.properties as Record<string, JsonSchema> | undefined;
    if (own === undefined) continue;
    if (own[key] !== undefined) return [{ name, list }];
    const deeper = belongsIn(own, key, root, depth + 1);
    if (deeper !== null) return [{ name, list }, ...deeper];
  }
  return null;
}

/**
 * The one of these names a key nearly is, as a model misnames a field:
 * the same but for case, a plural or singular (region, regions), the
 * start of it (expr, expression; units, unitSystem), or a letter or two
 * off in a longer name (colour, color). Short names are only matched
 * whole, so x is never taken for y.
 */
function nearName(key: string, names: readonly string[]): string | undefined {
  const a = key.toLowerCase();
  const near = (name: string): boolean => {
    const b = name.toLowerCase();
    if (a === b) return true;
    if (a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`) return true;
    if (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
    return Math.min(a.length, b.length) >= 5 && editDistance(a, b) <= 2;
  };
  const found = names.filter(near);
  return found.length === 1 ? found[0] : undefined;
}

/** How many letters to add, remove or change to turn one word into the other. */
function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length]!;
}

function hasType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    case 'array':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    default:
      return true;
  }
}

function article(type: string): string {
  return /^[aeiou]/.test(type) ? `an ${type}` : `a ${type}`;
}

function describe(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'an array';
  }
  return typeof value === 'object' ? 'an object' : `${typeof value} ${JSON.stringify(value)}`;
}

/**
 * A tool's input with the values a smaller model writes in the wrong
 * JSON type put back in the type its schema asks for.
 *
 * Smaller models often write a nested argument as text
 * (`{"profile": "{\"id\": \"sendcutsend\"}"}`), and numbers and
 * booleans as strings (`"quantity": "8"`, `"picture": "false"`). The
 * schema says what the value is, so the intent is not in doubt, and
 * refusing it costs the model a turn it may not recover from. Repairing
 * it here also stores a real number, which is why `validate` refuses
 * `"3"` in the first place: a string kept where a number belongs fails
 * much later and somewhere else.
 *
 * A string is changed only where the schema does not take that string
 * as it is (no free `string` type, and not one of an enum's words):
 *
 * - JSON text that parses to an object or array the schema allows;
 * - a number written out, where it allows a number or an integer;
 * - `"true"` or `"false"`, where it allows a boolean.
 *
 * Objects and arrays are followed down, so a value deep in an argument
 * is repaired too. Anything else is left exactly as it came, for
 * `validate` to judge.
 */
export function repairedArguments(schema: JsonSchema, value: unknown, root: JsonSchema = schema): unknown {
  const ref = schema.$ref;
  if (typeof ref === 'string') {
    const target = (root.$defs as Record<string, JsonSchema> | undefined)?.[ref.replace(/^#\/\$defs\//, '')];
    return target === undefined ? value : repairedArguments(target, value, root);
  }
  if (typeof value === 'string') {
    const kinds = kindsOf(schema, root);
    if (kinds.has('string') || wordsOf(schema, root).has(value)) return value;
    const text = value.trim();
    if ((kinds.has('object') || kinds.has('array')) && /^[[{]/.test(text)) {
      try {
        const parsed: unknown = parseLeniently(text);
        if (
          (Array.isArray(parsed) && kinds.has('array')) ||
          (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && kinds.has('object'))
        ) {
          return repairedArguments(schema, parsed, root);
        }
      } catch {
        // Not JSON after all: left for validate to describe.
      }
    }
    if ((kinds.has('number') || kinds.has('integer')) && /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) {
      const n = Number(text);
      if (Number.isFinite(n) && (kinds.has('number') || Number.isInteger(n))) return n;
    }
    if (kinds.has('boolean') && (text === 'true' || text === 'false')) return text === 'true';
    return value;
  }
  if (Array.isArray(value)) {
    const item = optionWith(schema, root, 'array')?.items;
    if (item === undefined || typeof item === 'boolean') return value;
    const next = value.map(each => repairedArguments(item as JsonSchema, each, root));
    return next.some((each, i) => each !== value[i]) ? next : value;
  }
  if (value !== null && typeof value === 'object') {
    const shape = optionWith(schema, root, 'object', value);
    const properties = (shape?.properties as Record<string, JsonSchema> | undefined) ?? {};
    const required = new Set(Array.isArray(shape?.required) ? (shape.required as string[]) : []);
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, each] of Object.entries(value as Record<string, unknown>)) {
      const declared = properties[key];
      // An optional value sent as null (or "null" where text is not taken), as small models fill in every field: left out.
      if (declared !== undefined && !required.has(key) && isNullish(each, declared, root)) {
        changed = true;
        continue;
      }
      const next = declared === undefined ? each : repairedArguments(declared, each, root);
      changed ||= next !== each;
      out[key] = next;
    }
    return changed ? out : value;
  }
  return value;
}

/**
 * Whether a value stands for no value where the schema does not take null:
 * null, the word null where text is not taken, or "" where the text must
 * be one of an enum's words or match a pattern "" does not (an id, as
 * `after: ""`): an empty id names nothing, so it can only mean not given.
 */
function isNullish(value: unknown, schema: JsonSchema, root: JsonSchema): boolean {
  const kinds = kindsOf(schema, root);
  if (kinds.has('null')) return false;
  if (value === '') {
    const text = resolve(schema, root);
    if (Array.isArray(text.enum)) return !text.enum.includes('');
    return typeof text.pattern === 'string' && !new RegExp(text.pattern, 'u').test('');
  }
  return value === null || (value === 'null' && !kinds.has('string'));
}

/**
 * JSON text as a model writes it: JSON, or JSON with a line break or tab
 * left raw inside a string (a file's contents, written out), which
 * JSON.parse refuses. Anything else throws, as JSON.parse does.
 */
function parseLeniently(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    let out = '';
    let inString = false;
    let escaped = false;
    for (const char of text) {
      if (inString && !escaped && (char === '\n' || char === '\r' || char === '\t')) {
        out += char === '\n' ? '\\n' : char === '\r' ? '\\r' : '\\t';
        continue;
      }
      if (escaped) escaped = false;
      else if (char === '\\') escaped = inString;
      else if (char === '"') inString = !inString;
      out += char;
    }
    if (out === text) throw error;
    return JSON.parse(out);
  }
}

/** The JSON types a schema allows, through its anyOf; every type when it does not say. A string allowed only as an enum's words is not a free string. */
function kindsOf(schema: JsonSchema, root: JsonSchema): Set<string> {
  const ref = schema.$ref;
  if (typeof ref === 'string') {
    const target = (root.$defs as Record<string, JsonSchema> | undefined)?.[ref.replace(/^#\/\$defs\//, '')];
    return target === undefined ? new Set(['string', 'object', 'array']) : kindsOf(target, root);
  }
  if (Array.isArray(schema.anyOf))
    return new Set((schema.anyOf as JsonSchema[]).flatMap(option => [...kindsOf(option, root)]));
  const words = Array.isArray(schema.enum) || 'const' in schema;
  const named =
    typeof schema.type === 'string' ? [schema.type] : Array.isArray(schema.type) ? (schema.type as string[]) : null;
  if (named !== null) return new Set(words ? named.filter(kind => kind !== 'string') : named);
  if (words) return new Set();
  if (schema.properties !== undefined) return new Set(['object']);
  if (schema.items !== undefined) return new Set(['array']);
  return new Set(['string', 'number', 'integer', 'boolean', 'null', 'object', 'array']);
}

/** The words a schema takes as strings: its enums and consts, through its anyOf. */
function wordsOf(schema: JsonSchema, root: JsonSchema): Set<unknown> {
  const ref = schema.$ref;
  if (typeof ref === 'string') {
    const target = (root.$defs as Record<string, JsonSchema> | undefined)?.[ref.replace(/^#\/\$defs\//, '')];
    return target === undefined ? new Set() : wordsOf(target, root);
  }
  if (Array.isArray(schema.anyOf))
    return new Set((schema.anyOf as JsonSchema[]).flatMap(option => [...wordsOf(option, root)]));
  return new Set([...(Array.isArray(schema.enum) ? schema.enum : []), ...('const' in schema ? [schema.const] : [])]);
}

/**
 * Which option of an anyOf a value was meant as, when that can be told.
 *
 * Object options told apart by a property each fixes to one word (a
 * shape's `kind: "circle"`, `kind: "rect"`) are a tagged union: the
 * value's own word picks its option, and a word that is none of them is
 * reported with the words there are (`key` and `words`). Otherwise the
 * one option that takes the value's JSON type, if only one does.
 */
function meantOption(
  options: readonly JsonSchema[],
  value: unknown,
  root: JsonSchema
): { option?: JsonSchema; key?: string; words: unknown[] } {
  const resolved = options.map(option => resolve(option, root));
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const objects = resolved.filter(option => kindsOf(option, root).has('object') && option.properties !== undefined);
    const wordOf = (option: JsonSchema, key: string): unknown[] | undefined => {
      const property = (option.properties as Record<string, JsonSchema>)[key];
      if (property === undefined) return undefined;
      const fixed = resolve(property, root);
      if ('const' in fixed) return [fixed.const];
      return Array.isArray(fixed.enum) ? (fixed.enum as unknown[]) : undefined;
    };
    const keys = objects.length < 2 ? [] : Object.keys(objects[0]!.properties as object);
    const key = keys.find(k => objects.every(option => wordOf(option, k) !== undefined));
    if (key !== undefined) {
      const given = (value as Record<string, unknown>)[key];
      // Left out, the word is the one option that does not require it (a cutout is the default of an add).
      const optional = objects.filter(o => !((o.required as string[] | undefined) ?? []).includes(key));
      const option =
        given === undefined && optional.length === 1 ? optional[0] : objects.find(o => wordOf(o, key)!.includes(given));
      return option !== undefined ? { option, words: [] } : { key, words: objects.flatMap(o => wordOf(o, key)!) };
    }
  }
  const kind =
    value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'number' ? 'number' : typeof value;
  const fits = resolved.filter(option => kindsOf(option, root).has(kind));
  return fits.length === 1 ? { option: fits[0], words: [] } : { words: [] };
}

/** A schema with its $ref followed. */
function resolve(schema: JsonSchema, root: JsonSchema): JsonSchema {
  const ref = schema.$ref;
  if (typeof ref !== 'string') return schema;
  const target = (root.$defs as Record<string, JsonSchema> | undefined)?.[ref.replace(/^#\/\$defs\//, '')];
  return target === undefined ? schema : resolve(target, root);
}

/** The schema, or the option of its anyOf, that describes a value of this kind (for an object, the option it was meant as). */
function optionWith(
  schema: JsonSchema,
  root: JsonSchema,
  kind: 'object' | 'array',
  value?: unknown
): JsonSchema | undefined {
  const ref = schema.$ref;
  if (typeof ref === 'string') {
    const target = (root.$defs as Record<string, JsonSchema> | undefined)?.[ref.replace(/^#\/\$defs\//, '')];
    return target === undefined ? undefined : optionWith(target, root, kind, value);
  }
  if (Array.isArray(schema.anyOf)) {
    const meant = value === undefined ? undefined : meantOption(schema.anyOf as JsonSchema[], value, root).option;
    if (meant !== undefined && kindsOf(meant, root).has(kind)) return optionWith(meant, root, kind, value);
    for (const option of schema.anyOf as JsonSchema[]) {
      const found = optionWith(option, root, kind);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  return kindsOf(schema, root).has(kind) ? schema : undefined;
}
