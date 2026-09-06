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
  pointerDeviceOf,
  prepareInputSurface,
  touchActionFor,
  wheelDeltaYOf,
  type UiScrollability
} from '@gesso/core';
import { AudioSink } from '../AudioSink';
import { portHandle, type WorkerHandle } from '../../worker/WorkerPorts';
import { EditingProxy, writeClipboard } from '../EditingProxy';
import { SemanticsMirror } from '../SemanticsMirror';
import { observeColorScheme, type ColorSchemePreference } from '../colorScheme';
import { observeReducedMotion } from '../reducedMotion';
import { createShellHistory, type ShellHistory, type ShellHistoryOptions } from '../shellHistory';

/**
 * What the shell needs to spawn and drive a render worker.
 *
 * There is deliberately nothing here about media. A resolver is a
 * function and no function crosses a `postMessage`, so an option on
 * this side could only ever be a promise the shell could not keep;
 * the worker entry builds its own and declares it with
 * `renderRoot(AppRoot).useMedia(...)`.
 */
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
   * The rendering backend the worker draws with. Defaults to Canvas2D;
   * `webgpu` and `auto` fall back to it when the browser has no WebGPU
   * in workers, and the frame metrics say which one is drawing.
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
  appLogicWorker?: Worker | (() => Worker) | URL | string;
  /**
   * Receives errors thrown inside the render worker: while handling a
   * message, uncaught during a frame, from the renderer, or from a
   * channel — `source` says which, and `RuntimeErrorSource` says what
   * each one costs the running application.
   *
   * Defaults to `console.error`, which is a developer reading the
   * right thread in devtools at the right moment. `@gesso/devtools`'s
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
export class WorkerApp {
  private readonly options: WorkerAppOptions;

  private renderWorker: Worker | undefined;
  private appLogicWorker: Worker | undefined;
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
  /** The appearance this shell reports, remembered across a remount. */
  private colorSchemePreference: ColorSchemePreference = 'auto';

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
      const spec = this.options.appLogicWorker;
      const given = typeof spec === 'object' && spec instanceof Worker;
      const application = given ? spec : typeof spec === 'function' ? spec() : new Worker(spec, { type: 'module' });
      this.appLogicWorker = application;
      this.ownsAppLogicWorker = !given;
      application.addEventListener('message', this.handleAppWorkerMessage);
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
    if (this.renderWorker !== undefined) {
      this.renderWorker.postMessage({ type: 'dispose' } as ShellToRuntimeMessage);
      this.renderWorker.removeEventListener('message', this.handleWorkerMessage);
      this.renderWorker.removeEventListener('error', this.handleWorkerFailure);
      this.renderWorker.terminate();
      this.renderWorker = undefined;
    }
    this.appLogicWorker?.removeEventListener('message', this.handleAppWorkerMessage);
    if (this.ownsAppLogicWorker) {
      this.appLogicWorker?.terminate();
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
    if (message.type === 'editing') {
      this.proxy?.update(message.state);
      return;
    }
    if (message.type === 'clipboard') {
      writeClipboard(message.text);
      return;
    }
    if (message.type === 'openUrl') {
      window.open(message.url, '_blank', 'noopener,noreferrer');
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
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        this.post({ type: 'resize', width, height, dpr: window.devicePixelRatio || 1 });
      }
    });
    this.resizeObserver.observe(element);
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

  private attachInput(canvas: HTMLCanvasElement): () => void {
    const toLocal = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    // Whether an editable already had focus when the press began. A
    // press that *starts* editing is the one that has to raise the
    // keyboard; one that lands on a field already being typed into must
    // not, since the keyboard is up and re-taking focus makes it blink.
    let editingAtPress = false;
    const onPointerDown = (event: PointerEvent): void => {
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
      this.post({
        type: 'pointerMove',
        x,
        y,
        buttons: event.buttons,
        modifiers: modifiersFrom(event),
        pointer: pointerDeviceOf(event),
        at: epochFromEvent(event)
      });
    };
    const onPointerUp = (event: PointerEvent): void => {
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
      this.post({ type: 'pointerCancel', pointer: pointerDeviceOf(event) });
    };
    const onWheel = (event: WheelEvent): void => {
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

    canvas.addEventListener('mousedown', onMouseDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('keyup', onKeyUp);

    return () => {
      detachReducedMotion();
      canvas.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('keyup', onKeyUp);
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
