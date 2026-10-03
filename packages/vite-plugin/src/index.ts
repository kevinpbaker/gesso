import { defaultClientConditions, type EnvironmentModuleNode, type Plugin, type UserConfig } from 'vite';

import { AGENT_PATH, createAgentBridge, type BridgeRequest, type BridgeResponse, type BridgeSocket } from './agent.ts';
import { ContractReader, declaresChannel, describeCalls, type TypeScriptApi } from './contracts.ts';
import { transformRenderWorker } from './render.ts';
import { findShellCall, transformShell, transformSyncShell, type WorkerEntries } from './shell.ts';

export { transformRenderWorker, type RenderWiring } from './render.ts';
export {
  findShellCall,
  transformShell,
  transformSyncShell,
  type ShellCall,
  type ShellTransformOptions,
  type WorkerEntries
} from './shell.ts';
export { blankLiterals, findCall, findCalls, firstArgumentName, importSources, type CallSite } from './source.ts';

/**
 * `gesso-vite-plugin` — the plumbing between saving a file and seeing
 * the result.
 *
 * A Gesso application is three files either side of a thread barrier
 *, and until now the barrier cost the author four
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
 * which traces to the root module having a
 * main-thread importer and which otherwise looks like HMR simply not
 * working.
 *
 *   // vite.config.ts
 *   import { gesso } from 'gesso-vite-plugin';
 *   export default defineConfig({ plugins: [gesso()] });
 *
 *   // main.ts
 *   createApp({ history: { mode: 'path' } }).mount('#app');
 *
 * The literal construction stays supported and stays documented: the
 * plugin merges its factories *under* the options the author wrote, so
 * a hand-written `renderWorker` wins and an application that would
 * rather say it out loud can.
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
   * Wire `gesso-devtools`'s error overlay into `onError` (default
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
  /**
   * Resolve a dependency's `worker` export ahead of its `browser` one
   * (default true). See {@link workerConditions}.
   */
  readonly workerConditions?: boolean;
  /**
   * Describe every channel the application declares as JSON Schema,
   * read from the contract's types and JSDoc, and attach it to the
   * token with `describeChannel` (default true). It is what lets an AI
   * agent, or anything else that meets the application only at run
   * time, ask a channel what it holds and what its commands take.
   *
   * Needs TypeScript 7, whose checker does the reading. Without it the
   * plugin says so once and carries on undescribed.
   */
  readonly channelSchemas?: boolean;
  /**
   * Serve MCP at `/__gesso/mcp` while the dev server runs, so an AI
   * agent can read the open page's channels and send their commands
   * (default true). Development only: a build carries none of it.
   */
  readonly agent?: boolean;
}

/**
 * The export conditions a Gesso application resolves its dependencies
 * with: `worker` ahead of Vite's defaults.
 *
 * A Gesso application's code runs in workers, and Vite resolves every
 * dependency with the `browser` condition, which is the right call for
 * a page and the wrong one for a worker: a package's browser build may
 * reach for `document`. `decode-named-character-reference`, which every
 * markdown parser built on micromark imports, does exactly that, and a
 * render worker that imported one died on start with "document is not
 * defined". The same package publishes a `worker` build, as packages
 * with a DOM-only browser build tend to. A package's own export order
 * decides between the two, and those list `worker` first.
 *
 * The main thread resolves the same way. A worker build runs in a page
 * as well, and the shell imports little beyond Gesso itself.
 */
export const workerConditions: readonly string[] = ['worker', ...defaultClientConditions];

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
  /** The checker, started by the first contract, or null once it is known to be unavailable. */
  let contracts: Promise<ContractReader | null> | undefined;
  let root = '';
  const readerFor = (warn: (message: string) => void): Promise<ContractReader | null> =>
    (contracts ??= import('typescript/unstable/sync').then(
      ts => new ContractReader(ts as TypeScriptApi, root),
      () => {
        warn(
          'Channels are not described, because TypeScript 7 is not installed. Add `typescript` (7 or later) to ' +
            'devDependencies, or pass `channelSchemas: false` to stop this message.'
        );
        return null;
      }
    ));
  const closeContracts = async () => {
    const reader = await contracts;
    reader?.close();
    contracts = undefined;
  };
  /** The module with its channels described, or null when it declares none. */
  const describeContract = async (code: string, id: string, warn: (message: string) => void) => {
    if (
      options.channelSchemas === false ||
      !SOURCE.test(id) ||
      id.includes('/node_modules/') ||
      !declaresChannel(code)
    ) {
      return null;
    }
    const reader = await readerFor(warn);
    if (reader === null) {
      return null;
    }
    const reading = reader.read(id.replace(/\?.*$/, ''));
    reading.warnings.forEach(warn);
    return reading.channels.size > 0 ? code + describeCalls(reading.channels) : null;
  };
  /**
   * The same description, for a worker's bundle.
   *
   * A build bundles each worker with `worker.plugins` rather than with
   * the plugins of the page, and a contract is imported by workers far
   * more often than by the page, so without this a build would describe
   * almost nothing. A dev server runs every module through the main
   * plugins and does not need it. Each worker bundle closes the checker
   * when it is done, because nothing guarantees another bundle follows
   * to close it; the next contract starts it again.
   */
  const workerContracts: Plugin = {
    name: 'gesso:channel-schemas',
    enforce: 'pre',
    async transform(code, id) {
      const described = await describeContract(code, id, message => this.warn(message));
      return described === null ? null : { code: described, map: null };
    },
    async closeBundle() {
      await closeContracts();
    }
  };

  return {
    name: 'gesso',
    // Before Vite's own worker and asset plugins, which are what turn
    // the emitted `new Worker(new URL(...))` into a chunk, and before
    // the TypeScript transform, so the module still reads as it was
    // written.
    enforce: 'pre',

    config(config): UserConfig {
      return {
        ...(options.workerConditions === false ? {} : { resolve: { conditions: [...workerConditions] } }),
        // Module workers, which is what the plugin constructs, so a worker
        // can load a chunk on demand. Vite builds workers as IIFE unless
        // told otherwise, and an IIFE cannot split: a dynamic import in
        // the render worker was inlined, and a markdown editor's HTML
        // parser, loaded only on a paste, went into every page load.
        worker: {
          ...(config.worker?.format === undefined ? { format: 'es' as const } : {}),
          // Vite concatenates this with the application's own.
          ...(options.channelSchemas === false ? {} : { plugins: () => [workerContracts] })
        }
      };
    },

    configResolved(config) {
      serving = config.command === 'serve';
      root = config.root;
    },

    /**
     * The agent endpoint, and a line saying where it is once the server
     * is listening, because an endpoint nobody knows the address of is
     * one nobody connects to.
     */
    configureServer(server) {
      if (options.agent === false) {
        return;
      }
      const bridge = createAgentBridge(server.ws as unknown as BridgeSocket);
      server.middlewares.use((request, response, next) =>
        bridge.middleware(request as unknown as BridgeRequest, response as unknown as BridgeResponse, next)
      );
      server.httpServer?.once('listening', () => {
        const base = server.resolvedUrls?.local[0];
        if (base !== undefined) {
          const url = new URL(AGENT_PATH, base).href;
          server.config.logger.info(
            `  ➜  Agents:  ${url}\n             claude mcp add --transport http ${agentName(server.config.root)} ${url}`
          );
        }
      });
    },

    watchChange(id) {
      void contracts?.then(reader => reader?.invalidate(id));
    },

    /**
     * The checker is a child process, and a build that left it running
     * would never exit. A dev server calls this when it closes, so the
     * one hook covers both.
     */
    async closeBundle() {
      await closeContracts();
    },

    async transform(source, id) {
      if (!SOURCE.test(id) || id.includes('/node_modules/')) {
        return null;
      }

      const described = await describeContract(source, id, message => this.warn(message));
      const code = described ?? source;

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
        const sync = serving && options.agent !== false ? transformSyncShell(code) : null;
        if (sync !== null) {
          return { code: sync, map: null };
        }
        return described === null ? null : { code, map: null };
      }
      shellId = id;
      const entries = call.needsWorkers ? await resolveEntries(this, id, options) : null;
      const shell = transformShell(code, {
        entries,
        overlay: serving && options.overlay !== false,
        agent: serving && options.agent !== false
      });
      return shell === null ? (described === null ? null : { code, map: null }) : { code: shell, map: null };
    },

    /**
     * The failure that looks like a bug in the framework.
     *
     * A module reached from the main thread as well
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
            "worker's own graph to get hot replacement back."
        );
      }
    }
  };
}

export default gesso;

/** A name for the MCP server: the project's directory, which is what a person calls the app. */
function agentName(root: string): string {
  return (root.split('/').filter(Boolean).pop() ?? 'gesso').replace(/[^A-Za-z0-9_-]/g, '-');
}

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
      `gesso-vite-plugin found no render worker beside ${id}. It looked for ${RENDER_WORKER_NAMES.join(', ')}. ` +
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
