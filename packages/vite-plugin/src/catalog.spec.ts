import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as ts from 'typescript/unstable/sync';

import { ComponentCatalog, mayDeclareComponent } from './catalog.ts';
import { ContractReader } from './contracts.ts';

/**
 * The catalog against a project held in memory, as `contracts.spec.ts`
 * holds one: a designer's own components, a screen that uses one, a
 * helper that only looks like a component and a spec, with a tsconfig
 * that maps the framework onto this workspace's source.
 */
const framework = new URL('../../framework/src/index.ts', import.meta.url).pathname;
const core = new URL('../../core/src/index.ts', import.meta.url).pathname;
const dir = new URL('./__catalog__', import.meta.url).pathname;
const files = new Map<string, string>();

const memory: ts.APIOptions['fs'] = {
  directoryExists: path => (path === dir ? true : undefined),
  fileExists: path => (path.startsWith(`${dir}/`) ? files.has(path) : undefined),
  getAccessibleEntries: path =>
    path === dir ? { files: [...files.keys()].map(file => file.slice(dir.length + 1)), directories: [] } : undefined,
  readFile: path => (path.startsWith(`${dir}/`) ? (files.get(path) ?? null) : undefined),
  realpath: path => (path.startsWith(dir) ? path : undefined)
};

const PILL = `
import type { ComponentContext, Inputs } from 'gesso-framework';
import type { UiChild } from 'gesso-core';

export interface LayoutProps {
  width?: number;
  height?: number;
}

export interface StatusPillProps extends LayoutProps {
  /** The word on it. */
  label: string;
  /** @default 'quiet' */
  tone?: 'quiet' | 'loud';
}

/** A status pill: one word on a coloured ground, for the state of a record. */
export function StatusPill(inputs: Inputs<StatusPillProps>, _ctx: ComponentContext): UiChild {
  return inputs as unknown as UiChild;
}

/** Not a component: it takes a component's inputs and gives back a number. */
export function widthOf(inputs: Inputs<LayoutProps>): number {
  return inputs.width.value ?? 0;
}
`;

const HEADER = `
import type { Inputs } from 'gesso-framework';
import type { UiChild } from 'gesso-core';

/** The bar across the top of every screen, with its title. */
export function PageHeader(inputs: Inputs<{ title: string }>): UiChild {
  return inputs as unknown as UiChild;
}
`;

const SCREEN = `
import { StatusPill } from './StatusPill';

export const screen = <column><StatusPill label="Open" /></column>;
`;

const SPEC = `
import { StatusPill } from './StatusPill';
import type { Inputs } from 'gesso-framework';
export const used = <StatusPill label="In a spec" />;
`;

let reader: ContractReader;
let catalog: ComponentCatalog;

const text = async (name: string, args: Record<string, unknown> = {}) => {
  const result = await catalog.call(name, args);
  return { error: result.isError, text: result.content[0]!.text, data: result.structuredContent };
};

beforeAll(() => {
  files.set(
    `${dir}/tsconfig.json`,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'es2022',
        module: 'esnext',
        moduleResolution: 'bundler',
        jsx: 'preserve',
        noEmit: true,
        skipLibCheck: true,
        paths: { 'gesso-framework': [framework], 'gesso-core': [core] }
      },
      include: ['*.ts', '*.tsx']
    })
  );
  files.set(`${dir}/StatusPill.ts`, PILL);
  files.set(`${dir}/PageHeader.ts`, HEADER);
  files.set(`${dir}/Settings.tsx`, SCREEN);
  files.set(`${dir}/StatusPill.spec.tsx`, SPEC);
  reader = new ContractReader(ts, dir, memory);
  catalog = new ComponentCatalog(async () => reader, dir, { tsconfig: `${dir}/tsconfig.json` });
});

afterAll(() => {
  reader.close();
});

describe("the project's components, as tools", () => {
  it("lists the project's own components, one line each, and nothing that only looks like one", async () => {
    const { error, text: overview } = await text('library_overview');

    expect(error).toBe(false);
    expect(overview).toContain('2 components in this project.');
    expect(overview).toContain(
      '  StatusPill: A status pill: one word on a coloured ground, for the state of a record. (used in 1)'
    );
    expect(overview).toContain('  PageHeader: The bar across the top of every screen, with its title.');
    expect(overview).not.toContain('widthOf');
  });

  it('gives one in full: its inputs, the shared ones folded, and the files that use it, specs left out', async () => {
    const { text: entry, data } = await text('library_get', { name: 'StatusPill' });

    expect(entry.split('\n')[0]).toBe('StatusPill, from StatusPill');
    expect(entry).toContain('  label* string\n      The word on it.');
    expect(entry).toContain('  tone "loud" | "quiet" = "quiet"');
    expect(entry).toContain('Also takes the inputs of LayoutProps: width, height.');
    expect(entry).toContain('Used in: Settings.tsx');
    expect(entry).not.toContain('StatusPill.spec');
    expect((data as { usedIn: string[] }).usedIn).toEqual(['Settings.tsx']);
  });

  it('leaves out the folders it is told to: generated code naming the same components is not a use', async () => {
    files.set(
      `${dir}/tsconfig.all.json`,
      files.get(`${dir}/tsconfig.json`)!.replace('["*.ts","*.tsx"]', '["**/*.ts","**/*.tsx"]')
    );
    files.set(`${dir}/handoff/Settings.tsx`, SCREEN.replace("'./StatusPill'", "'../StatusPill'"));
    const everything = new ComponentCatalog(async () => reader, dir, { tsconfig: `${dir}/tsconfig.all.json` });
    const excluding = new ComponentCatalog(async () => reader, dir, {
      tsconfig: `${dir}/tsconfig.all.json`,
      exclude: ['handoff']
    });
    const usedIn = async (from: ComponentCatalog) =>
      ((await from.call('library_get', { name: 'StatusPill' })).structuredContent as { usedIn: string[] }).usedIn;

    expect(await usedIn(everything)).toEqual(['Settings.tsx', 'handoff/Settings.tsx']);
    expect(await usedIn(excluding)).toEqual(['Settings.tsx']);
  });

  it('finds components by what they are for, and suggests the near ones for a wrong name', async () => {
    const found = await text('library_search', { query: 'top bar' });
    const wrong = await text('library_get', { name: 'StatusBadge' });

    expect(found.text.split('\n')[1]).toContain('PageHeader');
    expect(wrong.error).toBe(true);
    expect(wrong.text).toBe('There is no component called StatusBadge. Did you mean StatusPill?');
  });

  it('takes in a component made in a new file once it is told the file was created', async () => {
    files.set(
      `${dir}/EmptyState.ts`,
      `
import type { Inputs } from 'gesso-framework';
import type { UiChild } from 'gesso-core';

/** What a list says when there is nothing in it. */
export function EmptyState(inputs: Inputs<{ message: string }>): UiChild {
  return inputs as unknown as UiChild;
}
`
    );
    reader.invalidate(`${dir}/EmptyState.ts`, 'create');
    catalog.invalidate();

    const { text: overview } = await text('library_overview');

    expect(overview).toContain('3 components in this project.');
    expect(overview).toContain('  EmptyState: What a list says when there is nothing in it.');
  });
});

describe('mayDeclareComponent', () => {
  it('passes a module that imports from the framework and names Inputs or Component, and nothing else', () => {
    expect(mayDeclareComponent(HEADER)).toBe(true);
    expect(mayDeclareComponent(SCREEN)).toBe(false);
    expect(mayDeclareComponent("import { Inputs } from './mine';")).toBe(false);
  });
});
