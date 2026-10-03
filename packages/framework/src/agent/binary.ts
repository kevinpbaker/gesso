import type { JsonSchema } from '../channel/ChannelSchema';

/**
 * Turns the base64 an agent wrote back into the bytes a command takes.
 *
 * A command may carry an `ArrayBuffer` or a typed array, which an agent
 * cannot write: it speaks JSON. `gesso-vite-plugin` describes such a
 * field as a base64 string tagged `x-gesso-binary` with the type the
 * command expects, the agent sends the string, and this walks the
 * arguments beside their schema and puts the bytes back before the
 * command is sent, so the application receives what its own components
 * would have sent it.
 *
 * Only what the schema tags is touched, and a value that is not a
 * string where bytes are expected is left for the command to see: the
 * validator has already said whether it was the right shape.
 */
export function decodeBinary(schema: JsonSchema | undefined, value: unknown, root: JsonSchema): unknown {
  if (schema === undefined) {
    return value;
  }
  const ref = schema.$ref;
  if (typeof ref === 'string') {
    const target = (root.$defs as Record<string, JsonSchema> | undefined)?.[ref.replace(/^#\/\$defs\//, '')];
    return decodeBinary(target, value, root);
  }
  const kind = schema['x-gesso-binary'];
  if (typeof kind === 'string') {
    return typeof value === 'string' ? bytesOf(value, kind) : value;
  }
  if (Array.isArray(schema.anyOf)) {
    // A union holding bytes is nearly always `bytes | null`; the branch
    // that is bytes is the one a string can be.
    const binary = (schema.anyOf as JsonSchema[]).find(option => typeof option['x-gesso-binary'] === 'string');
    return binary !== undefined && typeof value === 'string' ? decodeBinary(binary, value, root) : value;
  }
  if (Array.isArray(value)) {
    const prefix = (schema.prefixItems as JsonSchema[] | undefined) ?? [];
    const items = schema.items as JsonSchema | boolean | undefined;
    return value.map((item, index) =>
      decodeBinary(index < prefix.length ? prefix[index] : typeof items === 'object' ? items : undefined, item, root)
    );
  }
  if (value !== null && typeof value === 'object') {
    const properties = (schema.properties as Record<string, JsonSchema> | undefined) ?? {};
    const out: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
      out[key] = decodeBinary(properties[key], field, root);
    }
    return out;
  }
  return value;
}

const TYPED: Record<string, new (buffer: ArrayBuffer) => ArrayBufferView> = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array
};

function bytesOf(base64: string, kind: string): ArrayBuffer | ArrayBufferView {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) {
    bytes[index] = text.charCodeAt(index);
  }
  if (kind === 'ArrayBuffer') {
    return bytes.buffer;
  }
  const Typed = TYPED[kind];
  return Typed === undefined || Typed === Uint8Array ? bytes : new Typed(bytes.buffer);
}
