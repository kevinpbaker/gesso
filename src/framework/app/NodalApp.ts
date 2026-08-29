import type { FrameworkChild } from '../ComponentElement';
import { CanvasPlatformSurface, UiPlatformAdapter } from '../../ui/input/UiPlatformAdapter';
import type { UiNode } from '../../ui/graph/UiNode';
import type { CanvasHost } from '../../ui/rendering';
import { UiAnimationFrameClock } from '../../ui/scheduler';
import type { UiFrameClockFactory } from '../../ui/scheduler';
import type { StoreRegistry } from '../store/StoreRegistry';
import type { Store } from '../store/Store';
import { NodalRuntime, type FrameMetrics, type RendererChoice } from './NodalRuntime';
import { EditingProxy, writeClipboard } from './EditingProxy';
import { measure } from './worker/WorkerApp';
import type { StoreReplica } from '../store/worker/StoreReplica';

export interface NodalAppOptions {
  host: HTMLElement;
  root: FrameworkChild;
  storeClasses?: (new () => Store)[];
  /** A registry built elsewhere, when some stores live in data workers. */
  stores?: StoreRegistry;
  canvas?: CanvasHost;
  /** The rendering backend; see RendererChoice. Defaults to `canvas2d`. */
  renderer?: RendererChoice;
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
  private proxy: EditingProxy | null = null;
  private detachVisibility: (() => void) | null = null;

  constructor(options: NodalAppOptions) {
    this.host = options.host;
    this.canvas = options.canvas ?? createCanvasElement();
    this.inputEnabled = options.input ?? true;

    this.runtime = new NodalRuntime({
      root: options.root,
      canvas: this.canvas,
      renderer: options.renderer,
      storeClasses: options.storeClasses,
      stores: options.stores,
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
    // The canvas's box rather than the host's: clientWidth/clientHeight
    // include the host's padding, and starting the runtime a padding
    // wider than the surface it draws on leaves the first frame scaled
    // and every pointer coordinate off by the same ratio. See
    // `measure` in worker/WorkerApp for the same reasoning on the
    // worker path.
    const box = isCanvasElement(this.canvas) ? measure(this.canvas, this.host) : undefined;
    this.resize(box?.width ?? this.canvas.width ?? 600, box?.height ?? this.canvas.height ?? 600);
    this.attachInput();
    this.runtime.onCursor(cursor => {
      if (isCanvasElement(this.canvas)) {
        this.canvas.style.cursor = cursor ?? '';
      }
    });
    this.runtime.start();
  }

  /** Aligns patch delivery from worker-owned stores to the frame. */
  deferPatchesFrom(replicas: readonly StoreReplica[]): void {
    this.runtime.deferPatchesFrom(replicas);
  }

  /**
   * Receives per-frame timings, mirroring WorkerAppOptions.onFrame so
   * the two configurations can be compared on equal terms.
   */
  onFrame(listener: ((metrics: FrameMetrics) => void) | null): void {
    this.runtime.onFrame(listener);
  }

  /** Resolves with the backend that ended up drawing. */
  get rendererReady(): Promise<'canvas2d' | 'webgpu'> {
    return this.runtime.rendererReady;
  }

  /** Resizes the drawing surface and schedules a repaint. */
  resize(width: number, height: number): void {
    this.runtime.resize(width, height, devicePixelRatio());
  }

  /** Turns the layout inspector on or off; see NodalRuntime.setInspectorEnabled. */
  setInspector(enabled: boolean): void {
    this.runtime.setInspectorEnabled(enabled);
  }

  /** Receives the hovered node's explanation while the inspector is on. */
  onInspect(listener: ((text: string | null) => void) | null): void {
    this.runtime.onInspect(listener);
  }

  debugRoot(): UiNode {
    return this.runtime.debugRoot();
  }

  /**
   * Stops the scheduler, detaches input, and removes the canvas.
   */
  dispose(): void {
    this.running = false;
    this.proxy?.dispose();
    this.proxy = null;
    this.detachVisibility?.();
    this.detachVisibility = null;
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

    // Text editing goes through a hidden textarea, exactly as in the
    // worker configuration, so the IME works the same on both. Keys are
    // not forwarded from it: the surface above listens on `window` and
    // already sees them.
    const editing = this.runtime.input.editing;
    const canvas = this.canvas;
    this.proxy = new EditingProxy(canvas, {
      beforeInput: (inputType, data) => editing.beforeInput(inputType, data),
      compositionStart: () => editing.compositionStart(),
      compositionUpdate: (text, caret) => editing.compositionUpdate(text, caret),
      compositionEnd: text => editing.compositionEnd(text),
      paste: text => editing.paste(text),
      blur: () => this.runtime.input.focus.blur()
    });
    this.runtime.setTextInputSource('proxy');
    this.runtime.onEditingState(state => this.proxy?.update(state));
    this.runtime.onShellRequest(request => {
      if (request.type === 'clipboard') {
        writeClipboard(request.text, canvas.ownerDocument);
      } else {
        canvas.ownerDocument.defaultView?.open(request.url, '_blank', 'noopener,noreferrer');
      }
    });
    if (typeof document !== 'undefined') {
      const onVisibility = (): void => this.runtime.setVisible(document.visibilityState !== 'hidden');
      document.addEventListener('visibilitychange', onVisibility);
      this.detachVisibility = () => document.removeEventListener('visibilitychange', onVisibility);
    }
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
