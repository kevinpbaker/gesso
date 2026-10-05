import { createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

import { gesso, type GessoPluginOptions } from './index.ts';

/**
 * Vite's dependency scan, run for real over an application on disk.
 *
 * The scan is the one part of a dev server the plugin's transforms do
 * not reach, and what it misses is found only when the page asks for
 * it: a re-optimisation, "504 (Outdated Optimize Dep)" for the modules
 * already served, and a reload, on the first start of every application
 * that installs Gesso from the registry. The packages here are stand-ins
 * with the real names, so the spec needs nothing installed.
 */

/**
 * The few file system calls the spec makes. This package has no Node
 * types, and the plugin itself touches no files, so the spec loads the
 * built-ins at run time behind the shapes it uses rather than adding
 * them for one spec.
 */
interface Files {
  mkdtempSync(prefix: string): string;
  mkdirSync(path: string, options: { recursive: true }): unknown;
  writeFileSync(path: string, contents: string): void;
  rmSync(path: string, options: { recursive: true; force: true }): void;
}
const NODE_FS: string = 'node:fs';
const NODE_OS: string = 'node:os';
const fs = (await import(/* @vite-ignore */ NODE_FS)) as Files;
const { tmpdir } = (await import(/* @vite-ignore */ NODE_OS)) as { tmpdir(): string };

let root: string | null = null;
let server: ViteDevServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
  if (root !== null) fs.rmSync(root, { recursive: true, force: true });
  root = null;
});

function write(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(`${tmpdir()}/gesso-scan-`);
  for (const [path, contents] of Object.entries(files)) {
    fs.mkdirSync(`${dir}/${path.slice(0, path.lastIndexOf('/') + 1)}`, { recursive: true });
    fs.writeFileSync(`${dir}/${path}`, contents);
  }
  return dir;
}

function standIn(name: string, exports: Record<string, string> = { '.': './index.js' }): Record<string, string> {
  const files: Record<string, string> = {
    [`node_modules/${name}/package.json`]: JSON.stringify({ name, type: 'module', exports })
  };
  for (const target of Object.values(exports))
    files[`node_modules/${name}/${target.slice(2)}`] = 'export const x = 1;\n';
  return files;
}

/** What the scan found, before anything was requested. */
async function scanned(files: Record<string, string>, options: GessoPluginOptions = {}): Promise<string[]> {
  root = write(files);
  server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true, ws: false, watch: null },
    optimizeDeps: { force: true },
    plugins: [gesso({ channelSchemas: false, ...options })]
  });
  const optimizer = server.environments.client.depsOptimizer as unknown as {
    scanProcessing?: Promise<void>;
    metadata: { discovered: Record<string, unknown>; optimized: Record<string, unknown> };
  };
  await optimizer.scanProcessing;
  return Object.keys({ ...optimizer.metadata.discovered, ...optimizer.metadata.optimized }).sort();
}

const PACKAGES = {
  ...standIn('gesso-framework', { '.': './index.js', './agent': './agent.js', './worker': './worker.js' }),
  ...standIn('gesso-devtools'),
  ...standIn('render-only'),
  ...standIn('screen-only'),
  ...standIn('app-only')
};

describe("the dev server's dependency scan", () => {
  it('walks into both workers, the screens behind them, and what the shell loads lazily', async () => {
    const found = await scanned({
      ...PACKAGES,
      'index.html': '<div id="app"></div><script type="module" src="/main.ts"></script>',
      'main.ts': "import { createApp } from 'gesso-framework';\ncreateApp().mount(document.body);\n",
      // The scaffold's name, which is the last the plugin tries: every name
      // before it is missing here, and the scan must not take one of those.
      'worker.ts': "import 'render-only';\nimport { App } from './App';\nconsole.log(App);\n",
      'App.ts': "import { x } from 'screen-only';\nexport const App = x;\n",
      'AppWorker.ts': "import 'app-only';\nimport 'gesso-framework/worker';\n"
    });
    expect(found).toEqual([
      'app-only',
      'gesso-devtools',
      'gesso-framework',
      'gesso-framework/agent',
      'gesso-framework/worker',
      'render-only',
      'screen-only'
    ]);
  });

  it('leaves out the overlay and the agent when they are turned off', async () => {
    const found = await scanned(
      {
        ...PACKAGES,
        'index.html': '<script type="module" src="/main.ts"></script>',
        'main.ts': "import { createApp } from 'gesso-framework';\ncreateApp();\n",
        'worker.ts': "import 'render-only';\n"
      },
      { overlay: false, agent: false }
    );
    expect(found).toEqual(['gesso-framework', 'render-only']);
  });
});
