import type { EnvironmentModuleNode, Plugin } from 'vite';

import { transformRenderWorker } from './render.ts';
import { findShellCall, transformShell, type WorkerEntries } from './shell.ts';

export { transformRenderWorker, type RenderWiring } from './render.ts';
export {
  findShellCall,
  transformShell,
  type ShellCall,
  type ShellTransformOptions,
  type WorkerEntries
} from './shell.ts';
export { blankLiterals, findCall, findCalls, firstArgumentName, importSources, type CallSite } from './source.ts';

/**
 * `@gesso/vite-plugin` — the plumbing between saving a file and seeing
 * the result.
 *
 * A Gesso application is three files either side of a thread barrier
 * (`decisions/0030`), and until now the barrier cost the author four
 * incantations: `new Worker(new URL('./RenderWorker.ts',
 * import.meta.url), { type: 'module' })` twice, because only a literal
 * gets a chunk; `import.meta.hot.accept` with the root module named by
 * hand; and `mountErrorOverlay` wired to `onError`, without which a
 * worker exception reaches a console nobody has selected. None of them
 * is a decision. All of them are written the same way in every
 * application, and getting one wrong fails silently.
 *
 * The three-file shape stays. What this removes is the incantations,
 * and what it adds is the one diagnostic that cannot be read off the
 * screen: a save that reloads the page rather than replacing a module,
 * which `decisions/0049` traced to the root module having a
 * main-thread importer and which otherwise looks like HMR simply not
 * working.
 *
 *   // vite.config.ts
 *   import { gesso } from '@gesso/vite-plugin';
 *   export default defineConfig({ plugins: [gesso()] });
 *
 *   // main.ts
 *   createApp({ history: { mode: 'path' } }).mount('#app');
 *
 * The literal construction stays supported and stays documented: the
 * plugin merges its factories *under* the options the author wrote, so
 * a hand-written `renderWorker` wins and an application that would
 * rather say it out loud can. See `decisions/0082`.
 */
export interface GessoPluginOptions {
  /**
   * The render worker entry, as a specifier the shell module could
   * import. By default the plugin tries the names below, in order, and
   * uses the first that resolves beside the shell.
   */
  readonly renderWorker?: string;
  /**
   * The application worker entry, or false for an application that has
   * none. By default the plugin looks for it and leaves it out when
   * there is nothing to find, which is the single-worker shape the
   * scaffold produces.
   */
  readonly appLogicWorker?: string | false;
  /**
   * Wire `@gesso/devtools`'s error overlay into `onError` (default
   * true). Only ever in a dev server: a build carries no reference to
   * the package.
   */
  readonly overlay?: boolean;
  /** Emit the `import.meta.hot.accept` wiring (default true). */
  readonly hmr?: boolean;
  /**
   * Report a save that will reload the page instead of replacing a
   * module (default true).
   */
  readonly diagnostics?: boolean;
}

/**
 * Where a render worker entry is looked for, beside the shell.
 *
 * Ordered so that a name that says what the file is beats the generic
 * one: an application with both `RenderWorker.ts` and `worker.ts` means
 * the first, and the scaffold, which has only `worker.ts`, still
 * resolves.
 */
const RENDER_WORKER_NAMES = [
  './RenderWorker.ts',
  './RenderWorker.tsx',
  './render.worker.ts',
  './app.render.worker.ts',
  './worker.ts'
];

/** Where an application worker entry is looked for, beside the shell. */
const APP_WORKER_NAMES = ['./AppWorker.ts', './AppWorker.tsx', './app.worker.ts', './app.logic.worker.ts'];

/** Modules the plugin will read: the application's own source, not its dependencies. */
const SOURCE = /\.(?:[cm]?[jt]sx?)(?:$|\?)/;

export function gesso(options: GessoPluginOptions = {}): Plugin {
  let serving = false;
  /** The shell module, once one has been transformed. */
  let shellId: string | null = null;
  /** The render worker entry, once the shell has named it. */
  let renderWorkerId: string | null = null;
  /** Files already reported as reloading, so a save is not a stream of warnings. */
  const reported = new Set<string>();

  return {
    name: 'gesso',
    // Before Vite's own worker and asset plugins, which are what turn
    // the emitted `new Worker(new URL(...))` into a chunk, and before
    // the TypeScript transform, so the module still reads as it was
    // written.
    enforce: 'pre',

    configResolved(config) {
      serving = config.command === 'serve';
    },

    async transform(code, id) {
      if (!SOURCE.test(id) || id.includes('/node_modules/')) {
        return null;
      }

      if (serving && options.hmr !== false) {
        const wiring = transformRenderWorker(code);
        if (wiring.skipped !== null) {
          this.warn(`${wiring.skipped} Saving it will reload the page rather than replace the tree.`);
        }
        if (wiring.code !== null) {
          renderWorkerId = id;
          return { code: wiring.code, map: null };
        }
      }

      const call = findShellCall(code);
      if (call === null) {
        return null;
      }
      shellId = id;
      const entries = call.needsWorkers ? await resolveEntries(this, id, options) : null;
      const shell = transformShell(code, { entries, overlay: serving && options.overlay !== false });
      return shell === null ? null : { code: shell, map: null };
    },

    /**
     * The failure that looks like a bug in the framework.
     *
     * `decisions/0049`: a module reached from the main thread as well
     * as from the render worker cannot be hot-replaced, because Vite
     * propagates the invalidation to a main-thread importer that does
     * not accept and reloads the page. The screen blinks, the app
     * restarts, and nothing anywhere says why. Both ends of the module
     * graph are known here, so the answer is one walk of the importers.
     */
    hotUpdate({ modules, server }) {
      if (options.diagnostics === false || shellId === null || renderWorkerId === null) {
        return;
      }
      for (const module of modules) {
        if (module.id === null || reported.has(module.id)) {
          continue;
        }
        const importers = importerClosure(module);
        if (!importers.has(shellId) || !importers.has(renderWorkerId)) {
          continue;
        }
        reported.add(module.id);
        server.config.logger.warn(
          `[gesso] ${short(module.id, server.config.root)} is imported by the main thread as well as by the render ` +
            'worker, so saving it reloads the page instead of replacing the tree. Reach it only from the render ' +
            "worker's own graph to get hot replacement back; see decisions/0049."
        );
      }
    }
  };
}

export default gesso;

/** Every module that transitively imports this one, plus this one. */
function importerClosure(module: EnvironmentModuleNode): Set<string> {
  const seen = new Set<string>();
  const queue = [module];
  while (queue.length > 0) {
    const next = queue.pop()!;
    if (next.id === null || seen.has(next.id)) {
      continue;
    }
    seen.add(next.id);
    queue.push(...next.importers);
  }
  return seen;
}

/** A path relative to the project, for a message a person reads. */
function short(id: string, root: string): string {
  return id.startsWith(root) ? id.slice(root.length + 1) : id;
}

/** What the plugin resolves against, so a spec can hand it a fake. */
interface Resolver {
  resolve(source: string, importer: string): Promise<{ id: string } | null>;
}

/**
 * Finds the worker entries beside a shell module.
 *
 * The names are tried against the bundler's own resolver rather than
 * read off the disk: it already has the answer cached, it applies the
 * project's aliases and extensions, and it is the only thing that can
 * say whether the specifier the plugin is about to write would have
 * resolved. Nothing here touches the filesystem, which is also why the
 * package needs no node types.
 */
async function resolveEntries(context: Resolver, id: string, options: GessoPluginOptions): Promise<WorkerEntries> {
  const renderWorker = await firstResolved(
    context,
    id,
    options.renderWorker === undefined ? RENDER_WORKER_NAMES : [options.renderWorker]
  );
  if (renderWorker === null) {
    throw new Error(
      `@gesso/vite-plugin found no render worker beside ${id}. It looked for ${RENDER_WORKER_NAMES.join(', ')}. ` +
        "Name it with the plugin's `renderWorker` option, or write `renderWorker` in createApp() yourself."
    );
  }
  const appLogicWorker =
    options.appLogicWorker === false
      ? null
      : await firstResolved(
          context,
          id,
          options.appLogicWorker === undefined ? APP_WORKER_NAMES : [options.appLogicWorker]
        );
  return { renderWorker, appLogicWorker };
}

/** The first specifier that resolves beside `importer`, as written. */
async function firstResolved(context: Resolver, importer: string, names: readonly string[]): Promise<string | null> {
  for (const name of names) {
    if ((await context.resolve(name, importer)) !== null) {
      return name;
    }
  }
  return null;
}
