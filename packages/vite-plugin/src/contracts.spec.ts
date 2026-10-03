import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as ts from 'typescript/unstable/sync';

import { ContractReader, declaresChannel, describeCalls, type ContractReading } from './contracts.ts';

/**
 * The real checker against a project held in memory: a directory that
 * exists only in `files`, with a tsconfig that maps `gesso-framework`
 * onto this workspace's source, so the token types are the ones an
 * application gets. Everything outside the directory falls through to
 * the disk.
 */
const framework = new URL('../../framework/src/index.ts', import.meta.url).pathname;
const dir = new URL('./__contracts__', import.meta.url).pathname;
const files = new Map<string, string>();

const memory: ts.APIOptions['fs'] = {
  directoryExists: path => (path === dir ? true : undefined),
  fileExists: path => (path.startsWith(`${dir}/`) ? files.has(path) : undefined),
  getAccessibleEntries: path =>
    path === dir ? { files: [...files.keys()].map(file => file.slice(dir.length + 1)), directories: [] } : undefined,
  readFile: path => (path.startsWith(`${dir}/`) ? (files.get(path) ?? null) : undefined),
  realpath: path => (path.startsWith(dir) ? path : undefined)
};

const CATALOG = `
import { defineChannel } from 'gesso-framework';
import type { ProductRow } from './rows';

type Status = 'loading' | 'ready' | 'error';

/** The shop's catalogue. */
export const Catalog = defineChannel('catalog', {
  view: {
    /** Every product, in shelf order. */
    products: [] as readonly ProductRow[],
    status: 'loading' as Status,
    open: null as string | null,
    filters: {} as Record<string, boolean>,
    forgotten: [],
    when: null as Date | null
  },
  commands: {} as {
    /**
     * Puts a product in the basket.
     * @param id The product's id.
     * @param quantity How many; one if left out.
     * @destructive
     * @confirm
     */
    addToCart(id: string, quantity?: number): void;
    /** @idempotent */
    select(...ids: string[]): void;
    /** @hidden */
    debugReset(): void;
    /** A picture of the product, as the file it came from. */
    attach(file: { name: string; bytes: Uint8Array }, thumbnail: ArrayBuffer | null): void;
  }
});

export const NOT_A_CHANNEL = 3;
`;

const ROWS = `
export interface ProductRow {
  /** The SKU. */
  readonly id: string;
  readonly name: string;
  readonly price?: number;
  readonly pair: readonly [number, string];
  readonly children: readonly ProductRow[];
}
`;

const LEGACY = `
import { channel } from 'gesso-framework';

export interface CounterView {
  /** The application's whole state. */
  count: number;
  dark: boolean;
}

export interface CounterCommands {
  /** @param by How far to count. */
  increment: (by: number) => void;
}

export const Counter = channel<CounterView, CounterCommands>('counter', { count: 0, dark: true });
`;

let reader: ContractReader;
let catalog: ContractReading;
let legacy: ContractReading;

beforeAll(() => {
  files.set(
    `${dir}/tsconfig.json`,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'es2022',
        module: 'esnext',
        moduleResolution: 'bundler',
        noEmit: true,
        skipLibCheck: true,
        paths: { 'gesso-framework': [framework] }
      },
      include: ['*.ts']
    })
  );
  files.set(`${dir}/catalog.ts`, CATALOG);
  files.set(`${dir}/rows.ts`, ROWS);
  files.set(`${dir}/counter.ts`, LEGACY);
  reader = new ContractReader(ts, dir, memory);
  catalog = reader.read(`${dir}/catalog.ts`);
  legacy = reader.read(`${dir}/counter.ts`);
});

afterAll(() => {
  reader.close();
});

describe('declaresChannel', () => {
  it('finds a channel declared with either function from gesso-framework', () => {
    expect(declaresChannel(CATALOG)).toBe(true);
    expect(declaresChannel(LEGACY)).toBe(true);
  });

  it('ignores a module that only imports a token, or a channel() from elsewhere', () => {
    expect(declaresChannel("import { Catalog } from './catalog';\nctx.channel(Catalog);")).toBe(false);
    expect(declaresChannel("import { channel } from './mine';\nchannel('x', {});")).toBe(false);
    expect(declaresChannel("// gesso-framework\nconst x = 'defineChannel(';")).toBe(false);
  });
});

describe('a contract, read by the checker', () => {
  it('describes exported tokens and nothing else', () => {
    expect([...catalog.channels.keys()]).toEqual(['Catalog']);
    expect(catalog.channels.get('Catalog')!.description).toBe("The shop's catalogue.");
  });

  it('describes the view from types it had to resolve across files and aliases', () => {
    const view = catalog.channels.get('Catalog')!.view as {
      properties: Record<string, Record<string, unknown>>;
      required: string[];
      $defs: Record<string, { properties: Record<string, unknown>; required: string[] }>;
    };
    expect(view.properties.status).toEqual({ enum: ['error', 'loading', 'ready'] });
    expect(view.properties.open).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    expect(view.properties.filters).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: { type: 'boolean' }
    });
    expect(view.properties.products).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ProductRow' },
      description: 'Every product, in shelf order.'
    });
    // ProductRow contains itself, so it is described once and referred to.
    const row = view.$defs.ProductRow;
    expect(row.required).toEqual(['id', 'name', 'pair', 'children']);
    expect(row.properties.id).toEqual({ type: 'string', description: 'The SKU.' });
    expect(row.properties.pair).toEqual({
      type: 'array',
      prefixItems: [{ type: 'number' }, { type: 'string' }],
      items: false,
      minItems: 2
    });
    expect(row.properties.children).toEqual({ type: 'array', items: { $ref: '#/$defs/ProductRow' } });
  });

  it('describes each command by parameter name, with its annotations', () => {
    const { addToCart, select, debugReset } = catalog.channels.get('Catalog')!.commands;
    expect(addToCart).toEqual({
      description: 'Puts a product in the basket.',
      parameters: ['id', 'quantity'],
      input: {
        type: 'object',
        properties: {
          id: { type: 'string', description: "The product's id." },
          quantity: { type: 'number', description: 'How many; one if left out.' }
        },
        additionalProperties: false,
        required: ['id']
      },
      destructive: true,
      confirm: true
    });
    expect(select.rest).toBe(true);
    expect(select.idempotent).toBe(true);
    expect(select.input.properties).toEqual({ ids: { type: 'array', items: { type: 'string' } } });
    expect(debugReset).toMatchObject({ parameters: [], hidden: true });
  });

  it('lets a command carry bytes, described as base64 tagged with what they become', () => {
    const { attach } = catalog.channels.get('Catalog')!.commands;
    expect(attach.input.properties).toEqual({
      file: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          bytes: { type: 'string', contentEncoding: 'base64', 'x-gesso-binary': 'Uint8Array' }
        },
        required: ['name', 'bytes']
      },
      thumbnail: {
        anyOf: [{ type: 'string', contentEncoding: 'base64', 'x-gesso-binary': 'ArrayBuffer' }, { type: 'null' }]
      }
    });
    // Bytes in a command are not a warning; bytes in a view still are.
    expect(catalog.warnings.some(warning => warning.includes('attach'))).toBe(false);
  });

  it('names what it could not describe, and where', () => {
    expect(catalog.warnings).toEqual([
      expect.stringContaining('Catalog.view.forgotten[] is never'),
      'Catalog.view.when is a Date, which is not plain data and cannot cross a channel.'
    ]);
  });

  it('reads the older two-interface form, and @param on a command written as a property', () => {
    const counter = legacy.channels.get('Counter')!;
    expect(counter.view).toEqual({
      type: 'object',
      properties: {
        count: { type: 'number', description: "The application's whole state." },
        dark: { type: 'boolean' }
      },
      required: ['count', 'dark']
    });
    expect(counter.commands.increment.input.properties).toEqual({
      by: { type: 'number', description: 'How far to count.' }
    });
    expect(legacy.warnings).toEqual([]);
  });

  it('sees an edit once it is told the file changed', () => {
    const file = `${dir}/counter.ts`;
    files.set(file, LEGACY.replace('dark: boolean;', 'dark: boolean;\n  label: string;'));
    reader.invalidate(file);
    const view = reader.read(file).channels.get('Counter')!.view as { properties: Record<string, unknown> };
    expect(Object.keys(view.properties)).toEqual(['count', 'dark', 'label']);
  });
});

describe('describeCalls', () => {
  it('appends one call per channel, importing describeChannel under a name nobody uses', () => {
    const code = describeCalls(new Map([['Catalog', { view: {}, commands: {} }]]));
    expect(code).toContain("import { describeChannel as __gessoDescribeChannel } from 'gesso-framework';");
    expect(code).toContain('__gessoDescribeChannel(Catalog, {"view":{},"commands":{}});');
  });
});
