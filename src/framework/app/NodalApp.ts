import type { FrameworkChild } from '../ComponentElement';
import { CanvasPlatformSurface, UiPlatformAdapter } from '../../ui/input/UiPlatformAdapter';
import type { UiNode } from '../../ui/graph/UiNode';
import type { CanvasHost } from '../../ui/rendering';
import { UiAnimationFrameClock } from '../../ui/scheduler';
import type { UiFrameClockFactory } from '../../ui/scheduler';
import type { StoreRegistry } from '../store/StoreRegistry';
import type { Store } from '../store/Store';
import { NodalRuntime, type FrameMetrics } from './NodalRuntime';

export interface NodalAppOptions {
  host: HTMLElement;
  root: FrameworkChild;
  storeClasses?: (new () => Store)[];
  canvas?: CanvasHost;
  clock?: UiFrameClockFactory;
  /**
   * Set false to build the tree without attaching DOM input.
   * Handlers declared with `on*` props are still registered, so they
   * can be driven directly through `app.input`.
   */
  input?: boolean;
}

/**
 * Single-thread Nodal application.
 *
 * A thin DOM shell over NodalRuntime: it creates and sizes a canvas,
 * observes the host element, and forwards browser events into the
 * runtime's input controllers. All UI work — components, graph,
 * layout, rendering — belongs to the runtime and never touches the
 * DOM, which is what lets the same runtime host a render worker.
 *
 * This is the single-thread configuration. It is supported for tests,
 * headless rendering, and environments without OffscreenCanvas, but it
 * puts UI work on the main thread and so is not the default for an
 * interactive app.
 */
export class NodalApp {
  private readonly runtime: NodalRuntime;
  private readonly canvas: CanvasHost;
  private readonly host: HTMLElement;
  private readonly inputEnabled: boolean;
  private readonly adapter: UiPlatformAdapter;

  private running = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(options: NodalAppOptions) {
    this.host = options.host;
    this.canvas = options.canvas ?? createCanvasElement();
    this.inputEnabled = options.input ?? true;

    this.runtime = new NodalRuntime({
      root: options.root,
      canvas: this.canvas,
      storeClasses: options.storeClasses,
      clock: options.clock ?? (callback => new UiAnimationFrameClock(callback)),
      dpr: devicePixelRatio()
    });

    const input = this.runtime.input;
    this.adapter = new UiPlatformAdapter({
      pointerController: input.pointer,
      wheelController: input.wheel,
      keyboardController: input.keyboard
    });
  }

  get stores(): StoreRegistry {
    return this.runtime.stores;
  }

  /**
   * The platform adapter, for tests and for callers driving input from
   * a non-DOM source.
   */
  get input(): UiPlatformAdapter {
    return this.adapter;
  }

  /**
   * Starts the app: appends the canvas to the host, sizes it,
   * attaches input, and arms the frame scheduler.
   */
  mount(): void {
    if (this.running) {
      return;
    }
    this.running = true;

    if (isCanvasElement(this.canvas) && this.canvas.parentElement !== this.host) {
      this.host.appendChild(this.canvas);
      this.canvas.style.display = 'block';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
    }

    this.observeResize();
    this.resize(this.host.clientWidth || this.canvas.width || 600, this.host.clientHeight || this.canvas.height || 600);
    this.attachInput();
    this.runtime.start();
  }

  /**
   * Receives per-frame timings, mirroring WorkerAppOptions.onFrame so
   * the two configurations can be compared on equal terms.
   */
  onFrame(listener: ((metrics: FrameMetrics) => void) | null): void {
    this.runtime.onFrame(listener);
  }

  /** Resizes the drawing surface and schedules a repaint. */
  resize(width: number, height: number): void {
    this.runtime.resize(width, height, devicePixelRatio());
  }

  debugRoot(): UiNode {
    return this.runtime.debugRoot();
  }

  /**
   * Stops the scheduler, detaches input, and removes the canvas.
   */
  dispose(): void {
    this.running = false;
    this.adapter.detach();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (isCanvasElement(this.canvas) && this.canvas.parentElement === this.host) {
      this.host.removeChild(this.canvas);
    }
    this.runtime.dispose();
  }

  private attachInput(): void {
    if (!this.inputEnabled || !isCanvasElement(this.canvas)) {
      // A headless or offscreen canvas has no DOM events to forward.
      return;
    }
    this.canvas.tabIndex = 0;
    this.canvas.style.touchAction = 'none';
    this.adapter.attach(new CanvasPlatformSurface(this.canvas));
  }

  private observeResize(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry === undefined) {
        return;
      }
      // contentRect is the logical CSS size. The surface owns the
      // backing store, so the canvas attributes are never written here:
      // round-tripping the size through them once meant the second
      // resize read device pixels back as logical pixels.
      this.resize(entry.contentRect.width, entry.contentRect.height);
    });
    this.resizeObserver.observe(this.host);
  }
}

function createCanvasElement(): HTMLCanvasElement {
  return document.createElement('canvas');
}

function isCanvasElement(canvas: CanvasHost): canvas is HTMLCanvasElement {
  return typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement;
}

function devicePixelRatio(): number {
  return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
}
