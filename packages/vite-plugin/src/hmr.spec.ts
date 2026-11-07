import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

import { gesso } from './index.ts';

const ROOT = '/gesso-hmr-spec';

/** The modules of a small application, served from memory, so the spec writes no files. */
const files = new Map<string, string>();
const memory: Plugin = {
  name: 'memory',
  enforce: 'pre',
  resolveId(source, importer) {
    const id =
      source.startsWith('./') && importer !== undefined
        ? `${ROOT}/${source.slice(2)}`
        : source.startsWith(ROOT)
          ? source
          : `${ROOT}${source}`;
    return files.has(id) ? id : source === 'gesso-framework' ? `${ROOT}/framework.ts` : null;
  },
  load(id) {
    return files.get(id) ?? null;
  }
};

let server: ViteDevServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
  files.clear();
});

/** The `?t=` a module's served code imports `./service.ts` with, or null for none. */
async function serviceStamp(url: string): Promise<string | null> {
  const result = await server!.transformRequest(url);
  const match = /service\.ts(\?t=\d+)?["']/.exec(result?.code ?? '');
  expect(match).not.toBeNull();
  return match![1] ?? null;
}

describe('hot replacement of a service', () => {
  it('leaves every importer of it on the same module after a reload', async () => {
    // The render worker accepts its services' modules, so Vite left its
    // cached code importing the service at the timestamp from before the
    // save while the screens importing it moved on. A page reloaded
    // after that ran two copies of the service's module, and injecting
    // the service failed: "a different class of that name is
    // registered". It took restarting the dev server to get out of.
    files.set(
      `${ROOT}/framework.ts`,
      'export function renderRoot(root) { return { useService: () => ({ reload() {} }) }; }\n'
    );
    files.set(`${ROOT}/service.ts`, 'export class Feed {}\n');
    files.set(`${ROOT}/App.ts`, "import { Feed } from './service.ts';\nexport function App() { return Feed; }\n");
    files.set(
      `${ROOT}/worker.ts`,
      "import { renderRoot } from 'gesso-framework';\nimport { App } from './App.ts';\nimport { Feed } from './service.ts';\nrenderRoot(App).useService(Feed);\n"
    );
    server = await createServer({
      root: ROOT,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false, watch: null },
      plugins: [memory, gesso({ agent: false, channelSchemas: false, overlay: false })]
    });
    expect(await serviceStamp('/worker.ts')).toBe(await serviceStamp('/App.ts'));

    // Saved, as the watcher reports it, and then the page reloaded.
    files.set(`${ROOT}/service.ts`, 'export class Feed { changed = true; }\n');
    (server.watcher as unknown as { emit(event: string, file: string): boolean }).emit('change', `${ROOT}/service.ts`);
    // The update is handled asynchronously; the screen's import moving on
    // to the save's timestamp is the sign it has been.
    let app: string | null = null;
    for (let tries = 0; app === null && tries < 100; tries++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      app = await serviceStamp('/App.ts');
    }
    expect(app).not.toBeNull();
    expect(await serviceStamp('/worker.ts')).toBe(app);
  });
});

describe('a worker entry added while the dev server runs', () => {
  it('is written into the shell without a restart', async () => {
    // The shell's transform names the workers it found beside it, and
    // Vite caches that transform. An `AppWorker.ts` written after the
    // page first loaded was never constructed, so every channel it
    // served failed with "registered with neither a worker nor a
    // source" until the server was restarted.
    files.set(`${ROOT}/framework.ts`, 'export function createApp() { return { mount() {} }; }\n');
    files.set(`${ROOT}/worker.ts`, 'export {};\n');
    files.set(`${ROOT}/main.ts`, "import { createApp } from 'gesso-framework';\ncreateApp().mount('#app');\n");
    server = await createServer({
      root: ROOT,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false, watch: null },
      plugins: [memory, gesso({ agent: false, channelSchemas: false, overlay: false })]
    });
    const watcher = server.watcher as unknown as { emit(event: string, file: string): boolean };
    expect((await server.transformRequest('/main.ts'))?.code).not.toContain('appLogicWorker');

    files.set(`${ROOT}/AppWorker.ts`, 'export {};\n');
    watcher.emit('add', `${ROOT}/AppWorker.ts`);
    expect((await server.transformRequest('/main.ts'))?.code).toContain('AppWorker.ts');

    // And taken out again when the file goes.
    files.delete(`${ROOT}/AppWorker.ts`);
    watcher.emit('unlink', `${ROOT}/AppWorker.ts`);
    expect((await server.transformRequest('/main.ts'))?.code).not.toContain('appLogicWorker');
  });

  it('leaves the shell alone when an unrelated file is added', async () => {
    files.set(`${ROOT}/framework.ts`, 'export function createApp() { return { mount() {} }; }\n');
    files.set(`${ROOT}/worker.ts`, 'export {};\n');
    files.set(`${ROOT}/main.ts`, "import { createApp } from 'gesso-framework';\ncreateApp().mount('#app');\n");
    server = await createServer({
      root: ROOT,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false, watch: null },
      plugins: [memory, gesso({ agent: false, channelSchemas: false, overlay: false })]
    });
    const first = await server.transformRequest('/main.ts');
    files.set(`${ROOT}/Notes.ts`, 'export {};\n');
    (server.watcher as unknown as { emit(event: string, file: string): boolean }).emit('add', `${ROOT}/Notes.ts`);
    expect(await server.transformRequest('/main.ts')).toBe(first);
  });
});
