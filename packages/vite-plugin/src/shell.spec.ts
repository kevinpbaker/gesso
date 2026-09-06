import { describe, expect, it } from 'vitest';

import { transformShell, type WorkerEntries } from './shell';

const ENTRIES: WorkerEntries = { renderWorker: './RenderWorker.ts', appLogicWorker: './AppWorker.ts' };

/** The shell a scaffolded application writes, once the plugin is in the config. */
const SHELL = [
  "import { createApp } from '@gesso/framework';",
  '',
  "const host = document.getElementById('app');",
  "const app = createApp({ history: { mode: 'path' } });",
  'app.mount(host);',
  ''
].join('\n');

function build(code: string, overlay = false): string {
  const out = transformShell(code, { entries: ENTRIES, overlay });
  expect(out).not.toBeNull();
  return out!;
}

describe('transformShell', () => {
  it('leaves a module that does not create an app alone', () => {
    const code = "import { renderRoot } from '@gesso/framework';\n";
    expect(transformShell(code, { entries: ENTRIES, overlay: false })).toBeNull();
  });

  it('leaves a createApp that came from somewhere else alone', () => {
    const code = "import { createApp } from './my-own';\ncreateApp({});\n";
    expect(transformShell(code, { entries: ENTRIES, overlay: false })).toBeNull();
  });

  it('writes both worker constructions out literally, which is the whole point', () => {
    const out = build(SHELL);
    expect(out).toContain('new Worker(new URL("./RenderWorker.ts", import.meta.url), { type: \'module\'');
    expect(out).toContain('new Worker(new URL("./AppWorker.ts", import.meta.url), { type: \'module\'');
  });

  it('leaves out the application worker when the app has none', () => {
    const single = transformShell(SHELL, {
      entries: { renderWorker: './worker.ts', appLogicWorker: null },
      overlay: false
    })!;
    expect(single).toContain('./worker.ts');
    expect(single).not.toContain('appLogicWorker');
  });

  it('keeps the options the author wrote, spread over its own', () => {
    const out = build(SHELL);
    expect(out).toContain("createApp(__gessoOptions({ history: { mode: 'path' } }))");
    // The author's spread comes last, so a hand-written renderWorker
    // still wins and the literal construction stays the fallback.
    expect(out.indexOf('...options')).toBeGreaterThan(out.indexOf('renderWorker:'));
  });

  it('supplies an object when the call had no arguments at all', () => {
    const out = build("import { createApp } from '@gesso/framework';\ncreateApp().mount('#app');\n");
    expect(out).toContain('createApp(__gessoOptions({}))');
  });

  it('changes no line above the call, so a stack still points at the right line', () => {
    const out = build(SHELL);
    expect(out.split('\n').slice(0, 3)).toEqual(SHELL.split('\n').slice(0, 3));
  });

  it('wires the overlay only when asked', () => {
    expect(build(SHELL, false)).not.toContain('@gesso/devtools');
    const dev = build(SHELL, true);
    expect(dev).toContain('onError: __gessoReportError');
    expect(dev).toContain("import('@gesso/devtools')");
  });

  it('does not rewrite a module it has already rewritten', () => {
    expect(transformShell(build(SHELL), { entries: ENTRIES, overlay: false })).toBeNull();
  });
});
