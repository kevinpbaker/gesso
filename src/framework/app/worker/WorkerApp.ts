import type { FramePhaseTimings } from '../NodalRuntime';
import { modifiersFrom, type RuntimeToShellMessage, type ShellToRuntimeMessage } from './RenderWorkerProtocol';

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
  /** Receives frame timings reported by the render worker. */
  onFrame?: (metrics: {
    frame: number;
    durationMs: number;
    nodes: number;
    measured: number;
    relayoutRoots: number;
    at: number;
    phases: FramePhaseTimings;
  }) => void;
  /** Receives errors thrown inside the render worker. Defaults to console.error. */
  onError?: (message: string, stack?: string) => void;
  /**
   * Receives the hovered node's layout explanation while the inspector
   * is on (see `setInspector`), and null when nothing is hovered.
   */
  onInspect?: (text: string | null) => void;
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
  private canvas: HTMLCanvasElement | undefined;
  private host: HTMLElement | undefined;
  private resizeObserver: ResizeObserver | null = null;
  private detachInput: (() => void) | null = null;

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

    const width = element.clientWidth || 600;
    const height = element.clientHeight || 600;
    worker.postMessage(
      { type: 'init', canvas: offscreen, width, height, dpr: window.devicePixelRatio || 1 } as ShellToRuntimeMessage,
      [offscreen]
    );

    this.observeResize(element);
    this.detachInput = this.attachInput(canvas);

    return () => this.dispose();
  }

  /**
   * Turns the layout inspector on or off in the worker: hover boxes and
   * a measure heatmap over the scene, and explanations via `onInspect`.
   */
  setInspector(enabled: boolean): void {
    this.post({ type: 'inspector', enabled });
  }

  dispose(): void {
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
        phases: message.phases
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
    }
  };

  private post(message: ShellToRuntimeMessage): void {
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
   * two defaults that matter — page scroll on wheel, and focus
   * stealing on Tab — and lets the worker route everything else.
   */
  private attachInput(canvas: HTMLCanvasElement): () => void {
    const toLocal = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const onPointerDown = (event: PointerEvent): void => {
      const { x, y } = toLocal(event.clientX, event.clientY);
      canvas.focus();
      this.post({ type: 'pointerDown', x, y, buttons: event.buttons, modifiers: modifiersFrom(event) });
    };
    const onPointerMove = (event: PointerEvent): void => {
      const { x, y } = toLocal(event.clientX, event.clientY);
      this.post({ type: 'pointerMove', x, y, buttons: event.buttons, modifiers: modifiersFrom(event) });
    };
    const onPointerUp = (event: PointerEvent): void => {
      const { x, y } = toLocal(event.clientX, event.clientY);
      this.post({ type: 'pointerUp', x, y, buttons: event.buttons, modifiers: modifiersFrom(event) });
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
        modifiers: modifiersFrom(event)
      });
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') {
        event.preventDefault();
      }
      this.post({ type: 'keyDown', key: event.key, modifiers: modifiersFrom(event) });
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      this.post({ type: 'keyUp', key: event.key, modifiers: modifiersFrom(event) });
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('keyup', onKeyUp);

    return () => {
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
