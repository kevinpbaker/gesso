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
    if (options.every(option => validate(option, value, root, at) !== null)) {
      return `${at} does not match any of the ${options.length} shapes it may take.`;
    }
    return null;
  }
  const type = schema.type;
  if (typeof type === 'string' && !hasType(value, type)) {
    return `${at} must be ${article(type)}, not ${describe(value)}.`;
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
  for (const key of (schema.required as string[] | undefined) ?? []) {
    if (value[key] === undefined) {
      return `${at}.${key} is required.`;
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
      const known = Object.keys(properties);
      return `${at}.${key} is not expected${known.length > 0 ? `; the fields are ${known.join(', ')}` : ''}.`;
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
