import { blankLiterals, findCall, importSources, type CallSite } from './source.ts';

/** Where the plugin found the two worker entries, as the shell imports them. */
export interface WorkerEntries {
  /** A specifier relative to the shell module, e.g. `./RenderWorker.ts`. */
  readonly renderWorker: string;
  /** The same for the application worker, or null when there is none. */
  readonly appLogicWorker: string | null;
}

/** A `createApp` call the plugin could write for, and what it still needs. */
export interface ShellCall {
  readonly call: CallSite;
  /**
   * False when the author wrote `renderWorker` themselves, which is the
   * documented fallback and the case where the plugin has no worker to
   * find. It still wires the overlay in.
   */
  readonly needsWorkers: boolean;
}

export interface ShellTransformOptions {
  /** The entries to construct, or null when the author named them. */
  readonly entries: WorkerEntries | null;
  /**
   * Whether to wire the error overlay in as well. True while the dev
   * server is running and never in a build, so a production bundle
   * carries no reference to `@gesso/devtools`.
   */
  readonly overlay: boolean;
}

/** Marks a module the plugin has already rewritten, so it is not done twice. */
const MARKER = '/* @gesso/vite-plugin */';

/**
 * The `createApp` call in a module, when the module has one that came
 * from the framework.
 *
 * Separate from the transform because finding the worker entries is an
 * asynchronous resolution against the bundler and worth doing only for
 * a module that turns out to be a shell, which is one module in an
 * application.
 */
export function findShellCall(code: string, blank = blankLiterals(code)): ShellCall | null {
  if (code.includes(MARKER)) {
    return null;
  }
  if (importSources(code, blank).get('createApp') !== '@gesso/framework') {
    return null;
  }
  const call = findCall(code, 'createApp', blank);
  if (call === null) {
    return null;
  }
  return { call, needsWorkers: !blank.slice(call.argsStart, call.argsEnd).includes('renderWorker') };
}

/**
 * Rewrites the shell module so that it names no worker.
 *
 * The one edit inside the author's own code is the call itself:
 * `createApp(...)` becomes `createApp(__gessoOptions(...))`, on the
 * same line, so every line number in the module is the one it was.
 * Everything else is appended below, as function declarations, which
 * hoist and are therefore usable from the line above them.
 *
 * The merge order is what keeps the promise that the
 * literal construction stays the documented fallback: the plugin's
 * factories go in first and the author's options spread over them, so
 * a `renderWorker` written by hand still wins.
 *
 * Returns null when there is nothing to do, which is the common case:
 * most modules do not call `createApp`.
 */
export function transformShell(code: string, options: ShellTransformOptions): string | null {
  const blank = blankLiterals(code);
  const shell = findShellCall(code, blank);
  if (shell === null) {
    return null;
  }
  if (options.entries === null && !options.overlay) {
    return null;
  }
  const { call } = shell;
  const args = code.slice(call.argsStart, call.argsEnd).trim();
  const rewritten = `${code.slice(0, call.argsStart)}__gessoOptions(${args === '' ? '{}' : args})${code.slice(call.argsEnd)}`;
  return `${rewritten}\n${prelude(options)}`;
}

/**
 * The appended half: the worker construction, and in development the
 * error overlay.
 *
 * `new Worker(new URL(...), { type: 'module', ... })` is written out
 * literally because that is the only shape a bundler splits a worker
 * out of, which is the whole reason this text has to be emitted into
 * the author's module rather than living inside the framework. `name`
 * is passed as a member whose value may be undefined, which a
 * dictionary conversion treats as absent, so one construction serves
 * both the named and the unnamed case.
 */
function prelude(options: ShellTransformOptions): string {
  const entries = options.entries;
  const lines = [
    MARKER,
    'function __gessoOptions(options = {}) {',
    '  return {',
    ...(entries === null
      ? []
      : [
          `    renderWorker: () => new Worker(new URL(${JSON.stringify(entries.renderWorker)}, import.meta.url), { type: 'module', name: options.workerName }),`
        ]),
    ...(entries?.appLogicWorker == null
      ? []
      : [
          `    appLogicWorker: () => new Worker(new URL(${JSON.stringify(entries.appLogicWorker)}, import.meta.url), { type: 'module', name: options.workerName }),`
        ]),
    ...(options.overlay ? ['    onError: __gessoReportError,'] : []),
    '    ...options',
    '  };',
    '}'
  ];
  return options.overlay ? `${lines.join('\n')}\n${OVERLAY}` : `${lines.join('\n')}\n`;
}

/**
 * The development error overlay, loaded the first time something
 * throws and not before.
 *
 * Lazy because it costs nothing until it is needed: a page that never
 * throws never fetches `@gesso/devtools`, and a page that does gets
 * the overlay within a network round trip of the error rather than
 * paying for the package on every start.
 *
 * The host is the canvas's parent, which is the element the
 * application was mounted into: the overlay covers the application it
 * is reporting on rather than the viewport, and a Gesso app is not
 * necessarily the whole page. `document.body` is the fallback for an
 * error thrown before there is a canvas at all.
 *
 * State is kept on the function object rather than in module-level
 * `let` bindings, because this block is appended below the code that
 * calls it and a `let` read from above it would be in its temporal
 * dead zone.
 */
const OVERLAY = `function __gessoReportError(message, stack, source) {
  const state = (__gessoReportError.state ??= { pending: [], overlay: null, loading: false });
  state.pending.push([message, stack, source]);
  if (state.overlay !== null) {
    __gessoFlushErrors();
    return;
  }
  if (state.loading) {
    return;
  }
  state.loading = true;
  void import('@gesso/devtools').then(({ mountErrorOverlay }) => {
    const canvas = document.querySelector('canvas');
    state.overlay = mountErrorOverlay(canvas?.parentElement ?? document.body);
    __gessoFlushErrors();
  });
}
function __gessoFlushErrors() {
  const state = __gessoReportError.state;
  for (const [message, stack, source] of state.pending.splice(0)) {
    state.overlay.report(message, stack, source);
  }
}
addEventListener('error', event => {
  const error = event.error;
  __gessoReportError(error?.message ?? event.message, error?.stack, 'window');
});
addEventListener('unhandledrejection', event => {
  const reason = event.reason;
  __gessoReportError(reason?.message ?? String(reason), reason?.stack, 'window');
});
`;
