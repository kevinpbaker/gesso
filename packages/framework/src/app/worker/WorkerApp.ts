import type { UiNodeReport } from '../NodeReport';
import type { DevtoolsEvent, DevtoolsRequest } from '../DevtoolsProtocol';
import { isConsoleEntryMessage, type ConsoleForwardingMessage } from '../../worker/captureConsole';
import type { FrameMetrics, RendererChoice } from '../GessoRuntime';
import {
  epochFromEvent,
  epochNow,
  isInputMessage,
  modifiersFrom,
  type RuntimeErrorSource,
  type RuntimeToShellMessage,
  type ShellToRuntimeMessage
} from './RenderWorkerProtocol';
import {
  capturePointer,
  observeViewportInsets,
  pointerDeviceOf,
  prepareInputSurface,
  touchActionFor,
  wheelDeltaYOf,
  type UiScrollability
} from 'gesso-core';
import { AudioSink } from '../AudioSink';
import { portHandle, type WorkerHandle } from '../../worker/WorkerPorts';
import { EditingProxy, writeClipboard } from '../EditingProxy';
import { SemanticsMirror } from '../SemanticsMirror';
import { performShellStorage } from '../shellStorage';
import { observeColorScheme, type ColorSchemePreference } from '../colorScheme';
import { observeReducedMotion } from '../reducedMotion';
import { createShellHistory, type ShellHistory, type ShellHistoryOptions } from '../shellHistory';
import { afterLayout, isDocumentFullscreen, observeFullscreen, setElementFullscreen, surfaceBox } from '../fullscreen';

/**
 * What the shell needs to spawn and drive a render worker.
 *
 * There is deliberately nothing here about media. A resolver is a
 * function and no function crosses a `postMessage`, so an option on
 * this side could only ever be a promise the shell could not keep;
 * the worker entry builds its own and declares it with
 * `renderRoot(AppRoot).useMedia(...)`.
 */
/**
 * Somewhere to send the application handshake that is not a `Worker`.
 *
 * A `MessagePort` satisfies it, and so does anything else that can
 * carry a message and a transferred port. It exists because the
 * application layer does not always live in a worker in this page: in
 * a desktop window it lives in another process, and what the shell
 * holds is one end of a bridge to it (`gesso-electrobun`).
 *
 * The shell treats an endpoint exactly as it treats a worker it was
 * handed rather than one it spawned: it wires it up, and it never
 * closes it.
 */
export interface AppLogicEndpoint {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  /** A `MessagePort` delivers nothing until this is called; a `Worker` has no such method. */
  start?: () => void;
}

export interface WorkerAppOptions {
  /**
   * Spawns the render worker: the one that calls renderRoot(), and so
   * owns components, layout and drawing.
   *
   * Prefer the factory form. Bundlers only code-split a worker when
   * they can see `new Worker(new URL('./x.ts', import.meta.url))`
   * written out literally, and that cannot happen inside this file —
   * it has to appear in the calling module:
   *
   *   renderWorker: () => new Worker(new URL('./app.render.worker.ts', import.meta.url), { type: 'module' })
   *
   * A URL is accepted for environments that resolve modules at
   * runtime, but a bundled build will not emit a chunk for it.
   */
  renderWorker: (() => Worker) | URL | string;
  /**
   * The rendering backend the worker draws with. Defaults to `auto`,
   * which is WebGPU where the worker has it and Canvas2D elsewhere;
   * `webgpu` and `auto` both fall back to Canvas2D when the browser
   * has no WebGPU in workers, and the frame metrics say which one is
   * drawing.
   */
  renderer?: RendererChoice;
  /**
   * Receives frame timings reported by the render worker.
   *
   * `FrameMetrics` itself rather than a structural copy of it: the
   * copy had already fallen a field behind the real thing once.
   */
  onFrame?: (metrics: FrameMetrics) => void;
  /**
   * Spawns the application-logic worker: api, persistence, domain and
   * view models, published as channels.
   *
   * The shell creates it, hands the render worker a port to it, and
   * then has nothing more to do with it — no patch ever crosses this
   * thread. Owning the spawn is bootstrap wiring, not a running
   * responsibility, and it buys two things: the application survives
   * the render worker being replaced, and nothing depends on a worker
   * being able to spawn a worker.
   *
   * A factory rather than a URL, for the same reason `renderWorker` is
   * one.
   *
   * Pass an already-running `Worker` to keep it across a remount. The
   * app is disposed and rebuilt whenever the *rendering* changes — the
   * playground's Canvas2D/WebGPU switch does exactly that — and an
   * application worker spawned here would go with it, discarding
   * application state for a reason that had nothing to do with the
   * application. What this class spawned, it terminates; what it was
   * handed, it leaves alone.
   */
  appLogicWorker?: Worker | AppLogicEndpoint | (() => Worker) | URL | string;
  /**
   * Opens a url the application asked for, in place of a new tab.
   *
   * A page wants `window.open`, which is the default. A desktop window
   * does not: `window.open` in a webview opens another webview or
   * nothing at all, and a link in a desktop application belongs in the
   * person's browser, which only the process outside the window can
   * reach. `gesso-electrobun`'s bridge is what goes here.
   */
  onOpenUrl?: (url: string) => void;
  /**
   * Receives errors thrown inside the render worker: while handling a
   * message, uncaught during a frame, from the renderer, or from a
   * channel — `source` says which, and `RuntimeErrorSource` says what
   * each one costs the running application.
   *
   * Defaults to `console.error`, which is a developer reading the
   * right thread in devtools at the right moment. `gesso-devtools`'s
   * error overlay is the same callback, drawn where the app is.
   */
  onError?: (message: string, stack: string | undefined, source: RuntimeErrorSource) => void;
  /**
   * Receives a report on the hovered node while the inspector is on
   * (see `setInspector`), and null when nothing is hovered.
   *
   * The report is built in the worker, where the tree is, and crosses
   * as plain data; `report.explanation` is the layout explanation this
   * used to carry on its own.
   */
  onInspect?: (report: UiNodeReport | null) => void;
  /**
   * Cancel the browser's Ctrl/Cmd+F on the canvas, so the app's own
   * find bar takes it. Off by default: the browser's find bar cannot
   * see a canvas, but taking the shortcut from an app that has no find
   * of its own would leave the user with neither.
   *
   * A flag rather than something the runtime decides, because the
   * worker's answer cannot come back in time to cancel a default —
   * unlike `GessoApp`, where the platform adapter cancels whatever the
   * app's own KeyDown listener claimed.
   */
  interceptFind?: boolean;
  /**
   * The appearance the application is told about: `auto` (the default)
   * follows `prefers-color-scheme`, `light` and `dark` override it.
   *
   * An option as well as a setter because a host with its own control
   * — a documentation site whose reader has already chosen dark —
   * otherwise starts on the platform's answer and corrects it a frame
   * later, which is a visible flash of the wrong appearance.
   */
  colorScheme?: ColorSchemePreference;
  /**
   * Set false to drop the off-screen DOM an assistive technology reads
   * (`SemanticsMirror`).
   *
   * On by default: an application that is accessible only when its
   * author remembered a flag is an application that is not accessible.
   * Turning it off also stops the render worker computing the geometry
   * the mirror needs, which is what makes the opt-out worth having for
   * a measurement.
   */
  accessibility?: boolean;
  /**
   * How the app's url is kept, for an app with routes: `path`
   * (pushState, the default), `hash`, or `memory`. See `shellHistory`.
   *
   * The shell's half of routing is this and nothing else. It holds no
   * routes, resolves nothing, and could not — a route names a
   * component class, which never leaves the worker. It reports the url
   * the window is at and performs the pushes the worker asks for.
   */
  history?: ShellHistoryOptions;
}

/**
 * Main-thread half of a worker-hosted Gesso application.
 *
 * Owns nothing but the canvas element and the event plumbing. It
 * creates the canvas, hands its drawing surface to the worker as an
 * OffscreenCanvas, and forwards pointer, wheel, keyboard and resize
 * into the worker. No component, node, layout record or render call
 * exists on this thread, so main-thread work cannot delay a frame.
 */
/**
 * Which application layer the shell was given, and whether it is the
 * shell's to close.
 *
 * A factory, a URL or a path names a worker this class creates, and
 * what it creates it terminates. Anything else was handed over
 * already running: a `Worker` kept across a remount, or an endpoint
 * that is not a worker at all, which is how a desktop window reaches
 * an application layer living in another process
 * (`gesso-electrobun`). Neither is closed here, because a handle
 * that could kill something it did not start is the wrong handle.
 *
 * Exported for its spec: the ownership half is the part that goes
 * quietly wrong, by discarding an application the shell had merely
 * borrowed.
 */
/**
 * Opens a url through the host's handler, or in a new tab.
 *
 * Exported for its spec: the default carries `noopener,noreferrer`,
 * which is the difference between opening a link and handing the
 * opener to whatever is on the other end of it.
 */
export function openUrlWith(handler: ((url: string) => void) | undefined, url: string): void {
  if (handler !== undefined) {
    handler(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function resolveAppLogic(spec: NonNullable<WorkerAppOptions['appLogicWorker']>): {
  endpoint: AppLogicEndpoint;
  owned: boolean;
} {
  if (typeof spec === 'function') {
    return { endpoint: spec(), owned: true };
  }
  if (typeof spec === 'string' || spec instanceof URL) {
    return { endpoint: new Worker(spec, { type: 'module' }), owned: true };
  }
  return { endpoint: spec, owned: false };
}

/**
 * The one message this shell ever holds on to rather than posting the
 * moment it has it. See `flushPendingMove`.
 */
type PointerMoveMessage = Extract<ShellToRuntimeMessage, { type: 'pointerMove' }>;

export class WorkerApp {
  private readonly options: WorkerAppOptions;

  private renderWorker: Worker | undefined;
  private appLogicWorker: AppLogicEndpoint | undefined;
  private devtoolsListener: ((event: DevtoolsEvent) => void) | null = null;
  /** Whether a panel has asked for the workers' consoles, remembered across a remount. */
  private consoleForwarding = false;
  /** True only when this class spawned the application-logic worker. */
  private ownsAppLogicWorker = false;
  private canvas: HTMLCanvasElement | undefined;
  private host: HTMLElement | undefined;
  private resizeObserver: ResizeObserver | null = null;
  private detachInput: (() => void) | null = null;
  private proxy: EditingProxy | null = null;
  private mirror: SemanticsMirror | null = null;
  /** The one audio element, behind `AudioService`; see `AudioSink`. */
  private audio: AudioSink | null = null;
  /**
   * Which way the runtime could scroll under the pointer, as of the
   * last frame the worker reported.
   *
   * Starts out all false, which is the safe unknown: before the
   * worker has said anything the shell lets wheels through to the
   * page rather than swallowing them, so a canvas that fails to start
   * degrades to an inert picture instead of a hole that eats
   * scrolling.
   */
  private scrollability: UiScrollability = { up: false, down: false, left: false, right: false };
  private history: ShellHistory | null = null;
  /** True once the render worker has answered `ready` at least once. */
  private ready = false;
  /** The running `requestAnimationFrame` handle, when ticks are wanted. */
  private frameHandle: number | null = null;
  /** Stops watching `prefers-color-scheme`; null while overridden. */
  private detachColorScheme: (() => void) | null = null;
  /** Stops watching `visualViewport` for the safe area and the keyboard. */
  private detachViewportInsets: (() => void) | null = null;
  /** The appearance this shell reports, remembered across a remount. */
  private colorSchemePreference: ColorSchemePreference = 'auto';
  /**
   * Whether the render worker still owes an answer to a `resize`, and
   * the newest size that has gone unsent because it does.
   *
   * A resize is the one shell message whose handling costs the worker
   * a full layout and a paint, and `ResizeObserver` delivers one per
   * refresh while a window edge is dragged. A worker slower than the
   * display therefore accumulated a queue of sizes, every one of them
   * already wrong by the time it was laid out, and the lag grew for
   * the length of the drag instead of settling. So the shell keeps one
   * resize in flight and remembers only the latest size it has not
   * sent. Nothing anyone can see is dropped: the size held back is the
   * newest one, and it goes out as soon as the worker says it has
   * drained the last.
   *
   * The initial size travels in `init` rather than as a resize, so
   * nothing is in flight until the first notification arrives.
   */
  private resizeInFlight = false;
  private heldResize: { width: number; height: number; dpr: number } | null = null;
  /**
   * Where the canvas sits on the page, or null when that has to be
   * read from the DOM again. `attachInput` says why it is cached and
   * what the cache costs.
   */
  private canvasOrigin: { left: number; top: number } | null = null;
  /** Whether the canvas is filling the screen; see the resize observer. */
  private fullscreen = false;
  /**
   * The hover move being held for this frame, and the frame holding
   * it. See `flushPendingMove`.
   */
  private pendingMove: PointerMoveMessage | null = null;
  private moveFrame: number | null = null;

  constructor(options: WorkerAppOptions) {
    this.options = options;
    this.colorSchemePreference = options.colorScheme ?? 'auto';
  }

  /**
   * Creates the canvas, starts the worker, and wires event forwarding.
   *
   * Returns a dispose function.
   */
  /**
   * A handle on the application-logic worker, for something on this
   * thread that wants its channels too: `createChannelRegistry` takes
   * it as a registration's `worker`. Undefined before `mount`, and
   * when no application-logic worker was given. The shell itself never
   * uses this; its own view of the application is nothing at all.
   */
  get appLogic(): WorkerHandle | undefined {
    return this.appLogicWorker === undefined ? undefined : portHandle(this.appLogicWorker);
  }

  mount(host: HTMLElement | string): () => void {
    const element = resolveHost(host);
    this.host = element;

    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    prepareInputSurface(canvas);
    canvas.tabIndex = 0;
    element.appendChild(canvas);
    this.canvas = canvas;

    if (typeof canvas.transferControlToOffscreen !== 'function') {
      throw new Error(
        'OffscreenCanvas is unavailable, so the render worker cannot draw. ' +
          'Use createApp(Root).mountSync(host) for the single-thread configuration.'
      );
    }

    const offscreen = canvas.transferControlToOffscreen();
    const spec = this.options.renderWorker;
    const worker = typeof spec === 'function' ? spec() : new Worker(spec, { type: 'module' });
    this.renderWorker = worker;
    worker.addEventListener('message', this.handleWorkerMessage);
    worker.addEventListener('error', this.handleWorkerFailure);

    // The canvas's own box, not the host's. `clientWidth`/`clientHeight`
    // include the host's padding, while the canvas is sized to its
    // content box — so a padded host (the playground's preview pane has
    // 16px) started the runtime with a viewport wider and taller than
    // the surface it draws on. Everything came out scaled, and pointer
    // coordinates, which `attachInput` takes from this same rect,
    // landed off by the same ratio. The ResizeObserver below reports
    // `contentRect` and so already agreed with this measurement; the
    // first frame was the only one that did not.
    const { width, height } = measure(canvas, element);
    const transfer: Transferable[] = [offscreen];
    let appPort: MessagePort | undefined;
    if (this.options.appLogicWorker !== undefined) {
      const resolved = resolveAppLogic(this.options.appLogicWorker);
      const application = resolved.endpoint;
      this.appLogicWorker = application;
      this.ownsAppLogicWorker = resolved.owned;
      application.addEventListener('message', this.handleAppWorkerMessage);
      // A port delivers nothing until it is started, and a worker has
      // no such method. Calling it here rather than asking the caller
      // to is what makes a port a drop-in for a worker.
      application.start?.();
      if (this.consoleForwarding) {
        // A panel asked before the worker existed (a remount), and the
        // new worker has not been told.
        application.postMessage({ type: 'gesso:console', enabled: true } as ConsoleForwardingMessage);
      }
      // One channel between the two workers. The shell holds neither
      // end afterwards, so it cannot be in the way of a patch even by
      // accident.
      const hub = new MessageChannel();
      application.postMessage({ type: 'gesso:hub' }, [hub.port2]);
      appPort = hub.port1;
      transfer.push(hub.port1);
    }
    worker.postMessage(
      {
        type: 'init',
        canvas: offscreen,
        width,
        height,
        dpr: window.devicePixelRatio || 1,
        renderer: this.options.renderer,
        // Text comes through the editing proxy below, IME and all.
        textInput: 'proxy',
        accessibility: this.options.accessibility !== false,
        appPort
      } as ShellToRuntimeMessage,
      transfer
    );

    this.observeResize(element);
    this.attachHistory();
    this.detachInput = this.attachInput(canvas);
    // Sound. The element has to live here, and only here; the worker
    // tells it what to do and hears what it did.
    this.audio = new AudioSink({
      sample: sample => this.post({ type: 'audioSample', sample }),
      action: action => this.post({ type: 'audioAction', action })
    });
    this.setColorScheme(this.colorSchemePreference);
    // The safe area and the soft keyboard, as four numbers. Read here
    // because `visualViewport` is the window's; what to do about them
    // is layout, and layout is in the worker. Reported once immediately
    // as well as on change, so a phone whose notch has been there all
    // along starts with the right numbers.
    this.detachViewportInsets = observeViewportInsets(insets => this.post({ type: 'viewportInsets', insets }));
    // The hidden textarea that turns keystrokes into text for the
    // worker. It has DOM focus while the worker reports a focused
    // editable, so its key events are forwarded like the canvas's.
    this.proxy = new EditingProxy(canvas, {
      beforeInput: (inputType, data) => this.post({ type: 'beforeInput', inputType, data }),
      compositionStart: () => this.post({ type: 'compositionStart' }),
      compositionUpdate: (text, caret) => this.post({ type: 'compositionUpdate', text, caret }),
      compositionEnd: text => this.post({ type: 'compositionEnd', text }),
      paste: text => this.post({ type: 'paste', text }),
      blur: () => this.post({ type: 'blur' }),
      keyDown: event => this.forwardKeyDown(event),
      keyUp: event => this.forwardKeyUp(event)
    });
    if (this.options.accessibility !== false) {
      // The off-screen DOM an assistive technology reads. Keys are
      // forwarded from it for the same reason they are forwarded from
      // the proxy: while the app has focus, the element holding it is
      // one of these and not the canvas.
      this.mirror = new SemanticsMirror(
        canvas,
        {
          action: action => this.post({ type: 'semanticsAction', action }),
          keyDown: event => this.forwardKeyDown(event),
          keyUp: event => this.forwardKeyUp(event)
        },
        this.proxy
      );
    }

    return () => this.dispose();
  }

  /**
   * An error the browser raised *at the worker object*, which is not
   * the same thing as the worker reporting one.
   *
   * The worker reports its own exceptions over the protocol, with a
   * stack and a source; this event carries neither. Left uncancelled,
   * the browser reports it a second time at this window — the same
   * failure with less information, which is what the error overlay
   * showed as a duplicate — so it is cancelled here.
   *
   * It is passed on in exactly one case: the worker never got as far
   * as saying `ready`, so its own handlers were never installed and
   * nothing else will ever report this. A module that fails to load,
   * or fails to parse, arrives this way and no other.
   */
  private handleWorkerFailure = (event: ErrorEvent): void => {
    event.preventDefault();
    if (this.ready) {
      return;
    }
    const where = event.filename === undefined || event.filename === '' ? '' : ` (${event.filename})`;
    this.report(`the render worker failed to start: ${event.message}${where}`, undefined, 'uncaught');
  };

  /** Reports an error, to `onError` or to the console it defaults to. */
  private report(message: string, stack: string | undefined, source: RuntimeErrorSource): void {
    // A panel hears every error the shell does, whatever the shell
    // does with it; the overlay and the panel are two readers, not
    // two sources.
    this.devtoolsListener?.({ kind: 'error', message, ...(stack === undefined ? {} : { stack }), source });
    const report =
      this.options.onError ?? ((text, trace, from) => console.error(`[gesso render worker: ${from}] ${text}`, trace));
    report(message, stack, source);
  }

  private forwardKeyDown(event: KeyboardEvent): void {
    // Whatever hover the shell is holding happened before this key
    // and has to be posted before it; see `flushPendingMove`. Keys
    // reach here from the canvas, the editing proxy and the semantics
    // mirror, so the flush belongs here rather than in one listener.
    this.flushPendingMove();
    if (this.options.interceptFind === true && isFind(event)) {
      event.preventDefault();
    }
    if (event.key === 'Tab' || isSelectAll(event)) {
      // The worker's answer cannot come back in time to cancel a
      // default, so the shell cancels the two that would be wrong
      // whatever it is: Tab moving focus out of the canvas, and
      // Ctrl/Cmd+A selecting the page around it while the app selects
      // its own text.
      event.preventDefault();
    }
    this.post({ type: 'keyDown', key: event.key, modifiers: modifiersFrom(event), at: epochFromEvent(event) });
  }

  private forwardKeyUp(event: KeyboardEvent): void {
    this.flushPendingMove();
    this.post({ type: 'keyUp', key: event.key, modifiers: modifiersFrom(event), at: epochFromEvent(event) });
  }

  /**
   * Turns the layout inspector on or off in the worker: hover boxes and
   * a measure heatmap over the scene, and explanations via `onInspect`.
   */
  setInspector(enabled: boolean): void {
    this.post({ type: 'inspector', enabled });
  }

  /**
   * Receives what a devtools panel asked for through `devtools`, and
   * updates to whatever it is watching. A method rather than an option
   * because a panel attaches to an application that is already
   * running, and detaches from one that keeps running.
   */
  onDevtools(listener: ((event: DevtoolsEvent) => void) | null): void {
    this.devtoolsListener = listener;
  }

  /**
   * Passes a devtools panel's request to the render worker, and a
   * console request to the application worker as well: each worker
   * forwards its own console, and the shell names the thread.
   */
  devtools(request: DevtoolsRequest): void {
    this.post({ type: 'devtools', request });
    if (request.kind === 'console') {
      this.consoleForwarding = request.enabled;
      this.appLogicWorker?.postMessage({ type: 'gesso:console', enabled: request.enabled } as ConsoleForwardingMessage);
    }
  }

  /**
   * Chooses what the application is told about the appearance.
   *
   * `auto` watches `prefers-color-scheme` and reports what it says;
   * `light` and `dark` stop watching and report themselves, for a host
   * with its own control — the reader of a documentation site who has
   * picked dark against a light system, or a desktop window with an
   * appearance setting of its own.
   *
   * Safe to call before `mount`: the preference is remembered and sent
   * when the worker starts.
   */
  setColorScheme(preference: ColorSchemePreference): void {
    this.detachColorScheme?.();
    this.detachColorScheme = null;
    this.colorSchemePreference = preference;
    if (this.renderWorker === undefined) {
      return;
    }
    if (preference === 'auto') {
      // Reports once immediately as well as on change, for the reason
      // reduced motion does: nobody fires a `change` event at an app
      // that started in the appearance it is already in.
      this.detachColorScheme = observeColorScheme(scheme => this.post({ type: 'colorScheme', scheme }));
      return;
    }
    this.post({ type: 'colorScheme', scheme: preference });
  }

  /**
   * Runs the display's refresh loop on the runtime's behalf.
   *
   * The one piece of per-frame work the shell genuinely has to do:
   * `requestAnimationFrame` is tied to the compositor and does not
   * exist in a worker, so without this the render worker can only
   * guess at a cadence with a timer — a fixed sixty on a 165Hz
   * display, aligned to none of its refreshes.
   *
   * The loop is free-running while the worker wants frames rather than
   * armed per frame, because a request-per-frame costs a round trip
   * inside every frame and halves the rate whenever the request misses
   * that vsync's callback. Each tick is a bare timestamp, and the loop
   * stops the moment the worker says it is idle — so an app doing
   * nothing costs nothing here.
   */
  private setFrameLoop(running: boolean): void {
    if (!running) {
      if (this.frameHandle !== null) {
        cancelAnimationFrame(this.frameHandle);
        this.frameHandle = null;
      }
      return;
    }
    if (this.frameHandle !== null) {
      return;
    }
    const step = (time: number): void => {
      // Re-armed before posting, so a worker that keeps wanting frames
      // never waits a refresh for the shell to come back round.
      this.frameHandle = requestAnimationFrame(step);
      this.post({ type: 'tick', time });
    };
    this.frameHandle = requestAnimationFrame(step);
  }

  dispose(): void {
    this.ready = false;
    this.setFrameLoop(false);
    this.detachColorScheme?.();
    this.detachColorScheme = null;
    this.detachViewportInsets?.();
    this.detachViewportInsets = null;
    this.proxy?.dispose();
    this.proxy = null;
    this.mirror?.dispose();
    this.mirror = null;
    this.history?.dispose();
    this.history = null;
    this.detachInput?.();
    this.detachInput = null;
    this.audio?.dispose();
    this.audio = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    // A remount starts from nothing in flight. The new worker is told
    // its size in `init`, and an acknowledgement from the old one
    // would be about a canvas that no longer exists.
    this.resizeInFlight = false;
    this.heldResize = null;
    this.canvasOrigin = null;
    this.dropPendingMove();
    if (this.renderWorker !== undefined) {
      this.renderWorker.postMessage({ type: 'dispose' } as ShellToRuntimeMessage);
      this.renderWorker.removeEventListener('message', this.handleWorkerMessage);
      this.renderWorker.removeEventListener('error', this.handleWorkerFailure);
      this.renderWorker.terminate();
      this.renderWorker = undefined;
    }
    this.appLogicWorker?.removeEventListener('message', this.handleAppWorkerMessage);
    if (this.ownsAppLogicWorker) {
      (this.appLogicWorker as Worker | undefined)?.terminate();
    }
    this.appLogicWorker = undefined;
    this.ownsAppLogicWorker = false;
    if (this.canvas !== undefined && this.canvas.parentElement === this.host) {
      this.host?.removeChild(this.canvas);
    }
    this.canvas = undefined;
    this.host = undefined;
  }

  /**
   * The application worker talks to the render worker over the hub,
   * never to the shell; the one thing it says to the shell is a
   * forwarded console entry, which is the one thing the render worker
   * cannot say for it.
   */
  private readonly handleAppWorkerMessage = (event: MessageEvent<unknown>): void => {
    if (isConsoleEntryMessage(event.data)) {
      this.devtoolsListener?.({ kind: 'console', entry: { ...event.data.entry, thread: 'app' } });
    }
  };

  private readonly handleWorkerMessage = (event: MessageEvent<RuntimeToShellMessage>): void => {
    const message = event.data;
    if (message.type === 'frame') {
      this.options.onFrame?.({
        frame: message.frame,
        durationMs: message.durationMs,
        nodes: message.nodes,
        measured: message.measured,
        relayoutRoots: message.relayoutRoots,
        at: message.at,
        inputLatencyMs: message.inputLatencyMs,
        phases: message.phases,
        renderer: message.renderer,
        gpu: message.gpu
      });
      return;
    }
    if (message.type === 'error') {
      this.report(message.message, message.stack, message.source);
      return;
    }
    if (message.type === 'ready') {
      this.ready = true;
      return;
    }
    if (message.type === 'frameLoop') {
      this.setFrameLoop(message.running);
      return;
    }
    if (message.type === 'inspect') {
      this.options.onInspect?.(message.report);
      return;
    }
    if (message.type === 'devtools') {
      this.devtoolsListener?.(message.event);
      return;
    }
    if (message.type === 'cursor') {
      // The worker decided what the pointer is over; only the DOM can
      // show it. An empty string restores the stylesheet's cursor.
      if (this.canvas !== undefined) {
        this.canvas.style.cursor = message.cursor ?? '';
      }
      return;
    }
    if (message.type === 'scrollability') {
      // Cached, not acted on: the wheel handler reads it synchronously
      // when an event arrives, which is the whole reason the worker
      // pushes it ahead of time.
      this.scrollability = message.scrollability;
      if (this.canvas !== undefined) {
        this.canvas.style.touchAction = touchActionFor(message.scrollsAnything);
      }
      return;
    }
    if (message.type === 'resized') {
      this.handleResized(message);
      return;
    }
    if (message.type === 'editing') {
      this.proxy?.update(message.state);
      return;
    }
    if (message.type === 'clipboard') {
      writeClipboard(message.text);
      return;
    }
    if (message.type === 'openUrl') {
      openUrlWith(this.options.onOpenUrl, message.url);
      return;
    }
    if (message.type === 'fullscreen') {
      // The canvas rather than the document body: what the application
      // draws on is what should fill the screen.
      if (this.canvas !== undefined) {
        setElementFullscreen(this.canvas, message.enter);
      }
      return;
    }
    if (message.type === 'popup') {
      this.openPopup(message);
      return;
    }
    if (message.type === 'storage') {
      // The one call in this file that reaches a browser API the
      // render worker cannot: `localStorage` is on the window. What
      // comes back is plain data, and the shell judges none of it.
      this.post({
        type: 'storageResult',
        id: message.id,
        result: performShellStorage(message, () => globalThis.localStorage)
      });
      return;
    }
    if (message.type === 'audio') {
      this.audio?.handle(message.request);
      return;
    }
    if (message.type === 'semantics') {
      this.mirror?.apply(message.update);
      return;
    }
    if (message.type === 'history') {
      this.applyHistory(message.action, message.url);
    }
  };

  /**
   * Reports the window's address to the worker, and keeps reporting it.
   *
   * Sent once at start-up as well as on change, for the same reason
   * `reducedMotion` is: an app opened directly at a url must start on
   * the screen that url names, not on its root.
   */
  private attachHistory(): void {
    const history = createShellHistory(this.options.history);
    this.history = history;
    history.onChange(url => this.post({ type: 'url', url }));
    this.post({ type: 'url', url: history.url });
  }

  /**
   * Opens a popup for the render worker and tells it what happened.
   *
   * `noopener` is deliberately absent, though the sibling `openUrl`
   * above sets it. `window.open` answers `null` whenever `noopener` is
   * given, whether the window appeared or was refused, so a popup
   * opened that way could not be reported on, and reporting is the
   * whole reason this request exists rather than another `openUrl`.
   * The page opened is a different origin, so the opener reference it
   * gains is the ordinary one every OAuth popup has.
   *
   * A reply is posted on every path, including the throwing one, so the
   * promise on the other side always settles.
   */
  private openPopup(request: { id: number; url: string; name: string; width: number; height: number }): void {
    let opened = false;
    try {
      const features = `popup,width=${request.width},height=${request.height}`;
      opened = window.open(request.url, request.name, features) !== null;
    } catch {
      // A sandboxed frame throws rather than returning null.
      opened = false;
    }
    this.post({ type: 'popupResult', id: request.id, opened });
  }

  private applyHistory(action: 'push' | 'replace' | 'back' | 'forward', url?: string): void {
    const history = this.history;
    if (history === null) {
      return;
    }
    if (action === 'back') {
      history.back();
    } else if (action === 'forward') {
      history.forward();
    } else if (url !== undefined) {
      if (action === 'push') {
        history.push(url);
      } else {
        history.replace(url);
      }
    }
  }

  private post(message: ShellToRuntimeMessage): void {
    // A backstop only. An input forwarded from a DOM event carries the
    // event's own timestamp (see `epochFromEvent`); this covers the
    // few that have no event behind them, and costs a listener that
    // forgot to stamp a reading that is late by however long the shell
    // took to get here.
    if (isInputMessage(message) && message.at === undefined) {
      (message as { at?: number }).at = epochNow();
    }
    this.renderWorker?.postMessage(message);
  }

  private observeResize(element: HTMLElement): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry === undefined) {
        return;
      }
      // The host has changed shape, so the canvas inside it has very
      // likely moved on the page as well as grown; whatever
      // `attachInput` cached about where it is cannot be trusted.
      this.canvasOrigin = null;
      if (this.fullscreen) {
        // The canvas has been lifted out of the host and is filling
        // the screen, so the host's shape says nothing about how big
        // the surface should be. It reflows *because* the canvas
        // left, and taking that size would shrink the surface behind
        // a screen-sized canvas and have the browser stretch it back
        // up, which is what put every coordinate out.
        return;
      }
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        this.requestResize({ width, height, dpr: window.devicePixelRatio || 1 });
      }
    });
    this.resizeObserver.observe(element);
  }

  /**
   * Sends a size to the worker, or holds it back until the worker has
   * caught up with the last one.
   *
   * At most one resize is in flight, for the reason `resizeInFlight`
   * gives: the alternative is a queue of sizes that are all wrong,
   * each bought with a layout and a paint. Overwriting the held size
   * rather than queueing it is the whole trick — a drag of any length
   * costs the worker one layout per acknowledgement rather than one
   * per refresh, and the size that eventually arrives is the size the
   * window ended at.
   */
  private requestResize(size: { width: number; height: number; dpr: number }): void {
    if (this.resizeInFlight) {
      this.heldResize = size;
      return;
    }
    this.resizeInFlight = true;
    this.post({ type: 'resize', ...size });
  }

  /**
   * The worker has applied a resize, so the one being held can go.
   *
   * The dimensions are compared against what is held because the
   * drag usually ends on the size that was already in flight: the
   * worker has it, and posting it again would buy a layout that
   * changes nothing. A held size that differs is the last one the
   * observer reported, and it becomes the resize in flight.
   *
   * There is no timer behind this. The worker acknowledges every
   * `resize` it is sent, including one it decides to drop, so an
   * acknowledgement is owed for as long as the worker lives — and a
   * worker that has stopped answering has stopped painting too, which
   * is not a wrong canvas size but a dead renderer, and is reported
   * as one. A genuinely lost acknowledgement would leave the canvas at
   * the last size the worker applied until the shell is remounted;
   * that is a trade this takes knowingly, in exchange for not having
   * a heuristic timeout re-sending sizes at a worker that is merely
   * slow.
   */
  private handleResized(applied: { width: number; height: number; dpr: number }): void {
    this.resizeInFlight = false;
    const held = this.heldResize;
    this.heldResize = null;
    if (held === null) {
      return;
    }
    if (held.width === applied.width && held.height === applied.height && held.dpr === applied.dpr) {
      return;
    }
    this.resizeInFlight = true;
    this.post({ type: 'resize', ...held });
  }

  /**
   * Forwards DOM input into the worker.
   *
   * UiPlatformAdapter is deliberately not reused here. It decides
   * whether to call preventDefault() from the returned event's
   * flags, and that answer lives in the worker and cannot come back
   * synchronously. The shell instead prevents the defaults that
   * matter — focus stealing on Tab, and the page's own select-all —
   * and lets the worker route everything else.
   *
   * The wheel is the one place where "prevent it and be done" is
   * wrong in both directions, so it reads a cached answer the worker
   * pushed ahead of the event. See `wouldConsumeWheel`.
   */
  /**
   * Whether the runtime will take this wheel, decided from the cached
   * scrollability rather than by asking.
   *
   * `preventDefault()` has to be called synchronously, inside the DOM
   * handler, and the runtime is a `postMessage` away — so the honest
   * answer arrives a frame late or not at all. The shell therefore
   * answers from what the worker last reported about the pointer's
   * scroll chain, which is the same bet a browser makes when it
   * scrolls on the compositor thread.
   *
   * Both mistakes it can make are bounded and recoverable. One frame
   * after a container reaches its edge, one wheel notch may still be
   * swallowed; one frame after it leaves its edge, one may leak to
   * the page. Neither is the failure this replaced, which was every
   * wheel over the canvas dying whether or not there was anything to
   * scroll.
   *
   * See `wheelConsumedBy` for the rule itself.
   */
  private wouldConsumeWheel(event: WheelEvent): boolean {
    return wheelConsumedBy(this.scrollability, event.deltaX, event.deltaY);
  }

  /**
   * Reads where the canvas is and remembers it.
   *
   * Only left and top are kept. The size is the ResizeObserver's
   * business and is already reported as a resize; what an input needs
   * from this rect is the origin to subtract.
   */
  private readCanvasOrigin(canvas: HTMLCanvasElement): { left: number; top: number } {
    const box = canvas.getBoundingClientRect();
    const origin = { left: box.left, top: box.top };
    this.canvasOrigin = origin;
    return origin;
  }

  /**
   * Posts the hover move being held for this frame, if there is one.
   *
   * Every other input this shell sends calls this first, and the
   * ordering is the whole reason it is one function rather than a flag
   * each listener consults. A held move that went out *after* the
   * press, release or wheel that superseded it would leave the worker
   * hovering a position the pointer had already left, and the hover
   * state of a widget is exactly what decides how the next event is
   * drawn.
   *
   * Only hover moves are ever held; see `onPointerMove`.
   */
  private flushPendingMove(): void {
    const move = this.pendingMove;
    this.dropPendingMove();
    if (move !== null) {
      this.post(move);
    }
  }

  /**
   * Forgets a held hover move and the frame that was to send it,
   * posting nothing. For a detach or a dispose, where the surface the
   * move was measured against is going away.
   */
  private dropPendingMove(): void {
    if (this.moveFrame !== null) {
      cancelAnimationFrame(this.moveFrame);
      this.moveFrame = null;
    }
    this.pendingMove = null;
  }

  private attachInput(canvas: HTMLCanvasElement): () => void {
    /**
     * Where a pointer is, in the canvas's own coordinates.
     *
     * The origin is cached rather than measured per event.
     * `getBoundingClientRect` is a synchronous style and layout flush
     * whenever the document is dirty, and this ran one on every
     * pointermove, pointerdown, pointerup and wheel — on the one
     * thread this whole architecture exists to keep free. The cache is
     * dropped whenever something the shell can hear says the canvas
     * may have moved: the ResizeObserver fires, an ancestor scrolls,
     * or the window resizes.
     *
     * What that trades away is exactness under movement nothing
     * announces — a CSS transition on an ancestor, an element
     * animated by a library that touches no scroll position — where
     * coordinates come out shifted by however far the canvas went.
     * `pointerdown` therefore takes a fresh reading, so every gesture
     * starts from the truth and a single press re-syncs a stale
     * cache. A hover in the meantime can land in the wrong place; a
     * press, and the drag and click that follow it, cannot.
     */
    const toLocal = (clientX: number, clientY: number) => {
      const origin = this.canvasOrigin ?? this.readCanvasOrigin(canvas);
      return { x: clientX - origin.left, y: clientY - origin.top };
    };

    // Whether an editable already had focus when the press began. A
    // press that *starts* editing is the one that has to raise the
    // keyboard; one that lands on a field already being typed into must
    // not, since the keyboard is up and re-taking focus makes it blink.
    let editingAtPress = false;
    const onPointerDown = (event: PointerEvent): void => {
      // A press is the one event worth a layout flush: it starts a
      // gesture, it is rare next to a move, and it is the shell's only
      // chance to notice that something moved the canvas without
      // telling anyone.
      this.canvasOrigin = null;
      this.flushPendingMove();
      const { x, y } = toLocal(event.clientX, event.clientY);
      editingAtPress = this.proxy?.active ?? false;
      // While an editable has focus the proxy's textarea holds DOM
      // focus; the worker decides whether this press keeps it there.
      if (!(this.proxy?.active ?? false)) {
        canvas.focus();
      }
      // The canvas keeps this contact even once it leaves the element,
      // so a drag that runs off the edge is still delivered. A finger
      // is captured implicitly and a mouse is not; capturing both
      // makes the two behave the same.
      capturePointer(canvas, event.pointerId);
      this.post({
        type: 'pointerDown',
        x,
        y,
        buttons: event.buttons,
        modifiers: modifiersFrom(event),
        pointer: pointerDeviceOf(event),
        at: epochFromEvent(event)
      });
    };
    const onMouseDown = (event: MouseEvent): void => {
      if (this.proxy?.active ?? false) {
        // The default would move focus to the canvas before the worker
        // has said where the press landed.
        event.preventDefault();
      }
    };
    const onVisibilityChange = (): void => {
      this.post({ type: 'visibility', visible: document.visibilityState !== 'hidden' });
    };
    const detachFullscreen = observeFullscreen(canvas, active => {
      // Entering or leaving fullscreen moves the canvas and changes
      // its size without the host's `ResizeObserver` hearing anything;
      // see `surfaceBox`. Both halves matter: the cached origin makes
      // a hover land in the wrong place, and the stale size makes
      // every coordinate wrong by the ratio between the two.
      this.canvasOrigin = null;
      this.fullscreen = active;
      this.post({ type: 'fullscreenChanged', active });
      afterLayout(() => {
        this.canvasOrigin = null;
        const box = this.host === undefined ? null : surfaceBox(canvas, this.host, active);
        if (box !== null) {
          this.requestResize({ ...box, dpr: window.devicePixelRatio || 1 });
        }
      });
    });
    // Once here as well as on change, for the reason visibility is
    // sent once: a canvas mounted into a document that is already
    // fullscreen never fires the event.
    this.post({ type: 'fullscreenChanged', active: isDocumentFullscreen(canvas) });
    // Sent once here as well as on change, for the reason the reduced
    // motion listener below gives for itself: a tab that is *already*
    // hidden when it starts never fires `visibilitychange`, so without
    // this the runtime assumes it is on screen and lays out and paints
    // a canvas nobody can see. That is not hypothetical — a page opened
    // in a background tab, or behind another window, is exactly this.
    onVisibilityChange();
    // Sent once here as well as on change: someone who already has the
    // preference on must not watch the first screen animate.
    const detachReducedMotion = observeReducedMotion(reduced => {
      this.post({ type: 'reducedMotion', reduced });
    });
    const onPointerMove = (event: PointerEvent): void => {
      const { x, y } = toLocal(event.clientX, event.clientY);
      const move: PointerMoveMessage = {
        type: 'pointerMove',
        x,
        y,
        buttons: event.buttons,
        modifiers: modifiersFrom(event),
        pointer: pointerDeviceOf(event),
        at: epochFromEvent(event)
      };
      if (event.buttons !== 0) {
        // Something is pressed, so every point is forwarded. A drag, a
        // text selection, a scrollbar thumb and the touch scroller's
        // fling velocity are all computed from the stream itself, and
        // thinning it would quietly change what they do rather than
        // save work. Coalescing is only ever right for hover, where
        // the newest position is the whole of the information.
        this.flushPendingMove();
        this.post(move);
        return;
      }
      this.pendingMove = move;
      // One frame, one hover hit-test. A high-rate mouse reports
      // hundreds of moves a second and the worker answers each with a
      // hit-test whose result the next one discards, so the held move
      // is overwritten and a single frame sends the last of them. The
      // timestamp posted is that newest event's, not the frame's, so
      // the latency reading still measures from the input.
      this.moveFrame ??= requestAnimationFrame(() => {
        this.moveFrame = null;
        this.flushPendingMove();
      });
    };
    const onPointerUp = (event: PointerEvent): void => {
      this.flushPendingMove();
      const { x, y } = toLocal(event.clientX, event.clientY);
      this.post({
        type: 'pointerUp',
        x,
        y,
        buttons: event.buttons,
        modifiers: modifiersFrom(event),
        pointer: pointerDeviceOf(event),
        at: epochFromEvent(event)
      });
      // The worker's answer to the press has arrived by now — a round
      // trip is a frame and a tap is not — so the proxy already holds
      // DOM focus, taken from a message rather than from a gesture. A
      // phone ignores that one. This is the last gesture task of the
      // press, and the only chance to ask again.
      if (!editingAtPress && (this.proxy?.active ?? false)) {
        this.proxy?.raiseKeyboard();
      }
    };
    const onPointerCancel = (event: PointerEvent): void => {
      this.flushPendingMove();
      this.post({ type: 'pointerCancel', pointer: pointerDeviceOf(event) });
    };
    const onWheel = (event: WheelEvent): void => {
      this.flushPendingMove();
      if (this.wouldConsumeWheel(event)) {
        event.preventDefault();
      }
      const { x, y } = toLocal(event.clientX, event.clientY);
      this.post({
        type: 'wheel',
        x,
        y,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        // Forwarded, not converted: what a line is worth is a policy
        // question and policy lives in the runtime.
        deltaMode: event.deltaMode,
        wheelDeltaY: wheelDeltaYOf(event),
        modifiers: modifiersFrom(event),
        at: epochFromEvent(event)
      });
    };
    const onKeyDown = (event: KeyboardEvent): void => this.forwardKeyDown(event);
    const onKeyUp = (event: KeyboardEvent): void => this.forwardKeyUp(event);
    /**
     * The canvas has moved on the page without necessarily changing
     * size: an ancestor scrolled, or the window resized and the page
     * reflowed around it.
     *
     * The cached origin is dropped rather than re-read, so the cost is
     * paid by the next event that actually needs a position and not by
     * the scroll — and a scroll that nothing is pointing at costs
     * nothing at all.
     */
    const onCanvasMayHaveMoved = (): void => {
      this.canvasOrigin = null;
    };

    canvas.addEventListener('mousedown', onMouseDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('keyup', onKeyUp);
    // Capturing, because a scroll only reaches the scrolled element
    // and its ancestors otherwise, and it is an *ancestor* of the
    // canvas scrolling that moves the canvas. Passive, because this
    // never prevents one and a non-passive scroll listener on the
    // window is exactly the thing that keeps a browser from scrolling
    // off the main thread.
    window.addEventListener('scroll', onCanvasMayHaveMoved, { capture: true, passive: true });
    window.addEventListener('resize', onCanvasMayHaveMoved);

    return () => {
      detachReducedMotion();
      detachFullscreen();
      canvas.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('scroll', onCanvasMayHaveMoved, { capture: true });
      window.removeEventListener('resize', onCanvasMayHaveMoved);
      // A frame still holding a hover move would post it against a
      // surface that is no longer listening, so it is dropped rather
      // than flushed.
      this.dropPendingMove();
      this.canvasOrigin = null;
    };
  }
}

function resolveHost(host: HTMLElement | string): HTMLElement {
  if (typeof host !== 'string') {
    return host;
  }
  const element = document.querySelector<HTMLElement>(host);
  if (element === null) {
    throw new Error(`Mount host '${host}' was not found.`);
  }
  return element;
}

/** Ctrl+A, or Cmd+A on a Mac: select every selectable text in the app. */
function isSelectAll(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && (event.key === 'a' || event.key === 'A');
}

/** Ctrl+F, or Cmd+F on a Mac: open the app's find bar. */
function isFind(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && (event.key === 'f' || event.key === 'F');
}

/**
 * Whether the runtime will take a wheel with these deltas, given what
 * it last said about the pointer's scroll chain.
 *
 * The shell has to answer this synchronously, inside the DOM handler,
 * and the runtime is a `postMessage` away — so it answers from the
 * last frame's report. That is the same bet a browser makes when it
 * scrolls on the compositor thread, and both mistakes it allows are
 * one frame long: a notch swallowed just after a container reached
 * its edge, or one leaked to the page just after it left it. Neither
 * is the failure this replaced, which was every wheel over the canvas
 * dying whether or not there was anything to scroll.
 *
 * The dominant axis decides, matching the runtime's own rule that a
 * container scrolls on one axis at a time. A wheel with no delta in
 * that axis is never consumed.
 */
export function wheelConsumedBy(scrollability: UiScrollability, deltaX: number, deltaY: number): boolean {
  if (Math.abs(deltaY) >= Math.abs(deltaX)) {
    if (deltaY > 0) {
      return scrollability.down;
    }
    return deltaY < 0 ? scrollability.up : false;
  }
  if (deltaX > 0) {
    return scrollability.right;
  }
  return deltaX < 0 ? scrollability.left : false;
}

/**
 * The logical size to start a runtime at, in CSS pixels.
 *
 * The canvas's border box is what the runtime draws into and what
 * pointer coordinates are measured against, so it is the measurement
 * that matters. It is zero before the first layout — a host mounted
 * while detached, or a test double — so the host's content box is the
 * fallback, and a fixed default the last resort.
 */
export function measure(canvas: HTMLCanvasElement, host: HTMLElement): { width: number; height: number } {
  const box = canvas.getBoundingClientRect();
  if (box.width > 0 && box.height > 0) {
    return { width: box.width, height: box.height };
  }
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(host) : undefined;
  const pad = (value: string | undefined): number => parseFloat(value ?? '0') || 0;
  const width = host.clientWidth - pad(style?.paddingLeft) - pad(style?.paddingRight);
  const height = host.clientHeight - pad(style?.paddingTop) - pad(style?.paddingBottom);
  return { width: width > 0 ? width : 600, height: height > 0 ? height : 600 };
}
