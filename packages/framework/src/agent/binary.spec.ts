import { describe, expect, it } from 'vitest';

import { decodeBinary } from './binary';

const bytes = (base64Of: string) => btoa(base64Of);

describe('decodeBinary', () => {
  const schema = {
    type: 'object',
    properties: {
      file: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          bytes: { type: 'string', contentEncoding: 'base64', 'x-gesso-binary': 'Uint8Array' }
        }
      },
      thumbnail: {
        anyOf: [{ type: 'string', contentEncoding: 'base64', 'x-gesso-binary': 'ArrayBuffer' }, { type: 'null' }]
      },
      samples: { type: 'array', items: { $ref: '#/$defs/Samples' } }
    },
    $defs: { Samples: { type: 'string', contentEncoding: 'base64', 'x-gesso-binary': 'Float32Array' } }
  };

  it('turns tagged base64 back into the bytes the command takes, and leaves the rest alone', () => {
    const floats = new Float32Array([1.5, -2]);
    const decoded = decodeBinary(
      schema,
      {
        file: { name: 'a.csv', bytes: bytes('x,y\n1,2\n') },
        thumbnail: null,
        samples: [btoa(String.fromCharCode(...new Uint8Array(floats.buffer)))]
      },
      schema
    ) as { file: { name: string; bytes: Uint8Array }; thumbnail: null; samples: Float32Array[] };
    expect(decoded.file.name).toBe('a.csv');
    expect(decoded.file.bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(decoded.file.bytes)).toBe('x,y\n1,2\n');
    expect(decoded.thumbnail).toBeNull();
    expect(decoded.samples[0]).toBeInstanceOf(Float32Array);
    expect([...decoded.samples[0]]).toEqual([1.5, -2]);
  });

  it('decodes the bytes branch of a union, to an ArrayBuffer when that is what is asked for', () => {
    const decoded = decodeBinary(schema, { thumbnail: bytes('\u0001\u0002') }, schema) as { thumbnail: ArrayBuffer };
    expect(decoded.thumbnail).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(decoded.thumbnail)]).toEqual([1, 2]);
  });
});
