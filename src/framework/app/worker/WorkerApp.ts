import type { FrameMetrics, RendererChoice } from '../NodalRuntime';
import {
  epochFromEvent,
  epochNow,
  isInputMessage,
  modifiersFrom,
  type RuntimeToShellMessage,
  type ShellToRuntimeMessage
} from './RenderWorkerProtocol';
import { EditingProxy, writeClipboard } from '../EditingProxy';
import { observeReducedMotion } from '../reducedMotion';

export interface WorkerAppOptions {
  /**
   * The worker that calls renderRoot().
   *
   * Prefer the factory form. Bundlers only code-split a worker when
   * they can see `new Worker(new URL('./x.ts', import.meta.url))`
   * written out literally, and that cannot happen inside this file —
   * it has to appear in the calling module:
   *
   *   worker: () => new Worker(new URL('./app.worker.ts', import.meta.url), { type: 'module' })
   *
   * A URL is accepted for environments that resolve modules at
   * runtime, but a bundled build will not emit a chunk for it.
   */
  worker: (() => Worker) | URL | string;
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
   * Spawns the application worker: api, persistence, domain and view
   * models, published as channels.
   *
   * The shell creates it, hands the render worker a port to it, and
   * then has nothing more to do with it — no patch ever crosses this
   * thread. Owning the spawn is bootstrap wiring, not a running
   * responsibility, and it buys two things: the application survives
   * the render worker being replaced, and nothing depends on a worker
   * being able to spawn a worker.
   *
   * A factory rather than a URL, for the same reason `worker` is one.
   *
   * Pass an already-running `Worker` to keep it across a remount. The
   * app is disposed and rebuilt whenever the *rendering* changes — the
   * playground's Canvas2D/WebGPU switch does exactly that — and an
   * application worker spawned here would go with it, discarding
   * application state for a reason that had nothing to do with the
   * application. What this class spawned, it terminates; what it was
   * handed, it leaves alone.
   */
  appWorker?: Worker | (() => Worker) | URL | string;
  /** Receives errors thrown inside the render worker. Defaults to console.error. */
  onError?: (message: string, stack?: string) => void;
  /**
   * Receives the hovered node's layout explanation while the inspector
   * is on (see `setInspector`), and null when nothing is hovered.
   */
  onInspect?: (text: string | null) => void;
  /**
   * Cancel the browser's Ctrl/Cmd+F on the canvas, so the app's own
   * find bar takes it. Off by default: the browser's find bar cannot
   * see a canvas, but taking the shortcut from an app that has no find
   * of its own would leave the user with neither.
   *
   * A flag rather than something the runtime decides, because the
   * worker's answer cannot come back in time to cancel a default —
   * unlike `NodalApp`, where the platform adapter cancels whatever the
   * app's own KeyDown listener claimed.
   */
  interceptFind?: boolean;
}

/**
 * Main-thread half of a worker-hosted Nodal application.
 *
 * Owns nothing but the canvas element and the event plumbing. It
 * creates the canvas, hands its drawing surface to the worker as an
 * OffscreenCanvas, and forwards pointer, wheel, keyboard and resize
 * into the worker. No component, node, layout record or render call
 * exists on this thread, so main-thread work cannot delay a frame.
 */
export class WorkerApp {
  private readonly options: WorkerAppOptions;

  private worker: Worker | undefined;
  private applicationWorker: Worker | undefined;
  /** True only when this class spawned the application worker. */
  private ownsApplicationWorker = false;
  private canvas: HTMLCanvasElement | undefined;
  private host: HTMLElement | undefined;
  private resizeObserver: ResizeObserver | null = null;
  private detachInput: (() => void) | null = null;
  private proxy: EditingProxy | null = null;

  constructor(options: WorkerAppOptions) {
    this.options = options;
  }

  /**
   * Creates the canvas, starts the worker, and wires event forwarding.
   *
   * Returns a dispose function.
   */
  mount(host: HTMLElement | string): () => void {
    const element = resolveHost(host);
    this.host = element;

    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
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
    const spec = this.options.worker;
    const worker = typeof spec === 'function' ? spec() : new Worker(spec, { type: 'module' });
    this.worker = worker;
    worker.addEventListener('message', this.handleWorkerMessage);

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
    if (this.options.appWorker !== undefined) {
      const spec = this.options.appWorker;
      const given = typeof spec === 'object' && spec instanceof Worker;
      const application = given ? spec : typeof spec === 'function' ? spec() : new Worker(spec, { type: 'module' });
      this.applicationWorker = application;
      this.ownsApplicationWorker = !given;
      // One channel between the two workers. The shell holds neither
      // end afterwards, so it cannot be in the way of a patch even by
      // accident.
      const hub = new MessageChannel();
      application.postMessage({ type: 'nodal:hub' }, [hub.port2]);
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
        appPort
      } as ShellToRuntimeMessage,
      transfer
    );

    this.observeResize(element);
    this.detachInput = this.attachInput(canvas);
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

    return () => this.dispose();
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

  dispose(): void {
    this.proxy?.dispose();
    this.proxy = null;
    this.detachInput?.();
    this.detachInput = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.worker !== undefined) {
      this.worker.postMessage({ type: 'dispose' } as ShellToRuntimeMessage);
      this.worker.removeEventListener('message', this.handleWorkerMessage);
      this.worker.terminate();
      this.worker = undefined;
    }
    if (this.ownsApplicationWorker) {
      this.applicationWorker?.terminate();
    }
    this.applicationWorker = undefined;
    this.ownsApplicationWorker = false;
    if (this.canvas !== undefined && this.canvas.parentElement === this.host) {
      this.host?.removeChild(this.canvas);
    }
    this.canvas = undefined;
    this.host = undefined;
  }

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
      const report = this.options.onError ?? ((text, stack) => console.error(`[nodal render worker] ${text}`, stack));
      report(message.message, message.stack);
      return;
    }
    if (message.type === 'inspect') {
      this.options.onInspect?.(message.text);
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
    }
  };

  private post(message: ShellToRuntimeMessage): void {
    // A backstop only. An input forwarded from a DOM event carries the
    // event's own timestamp (see `epochFromEvent`); this covers the
    // few that have no event behind them, and costs a listener that
    // forgot to stamp a reading that is late by however long the shell
    // took to get here.
    if (isInputMessage(message) && message.at === undefined) {
      (message as { at?: number }).at = epochNow();
    }
    this.worker?.postMessage(message);
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
   * defaultPrevented flag, and that answer lives in the worker and
   * cannot come back synchronously. The shell instead prevents the
   * defaults that matter — page scroll on wheel, focus stealing on
   * Tab, and the page's own select-all — and lets the worker route
   * everything else.
   */
  private attachInput(canvas: HTMLCanvasElement): () => void {
    const toLocal = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const onPointerDown = (event: PointerEvent): void => {
      const { x, y } = toLocal(event.clientX, event.clientY);
      // While an editable has focus the proxy's textarea holds DOM
      // focus; the worker decides whether this press keeps it there.
      if (!(this.proxy?.active ?? false)) {
        canvas.focus();
      }
      this.post({
        type: 'pointerDown',
        x,
        y,
        buttons: event.buttons,
        modifiers: modifiersFrom(event),
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
        at: epochFromEvent(event)
      });
    };
    const onPointerCancel = (): void => {
      this.post({ type: 'pointerCancel' });
    };
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const { x, y } = toLocal(event.clientX, event.clientY);
      this.post({
        type: 'wheel',
        x,
        y,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
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
