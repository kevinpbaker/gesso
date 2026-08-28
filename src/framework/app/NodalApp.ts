import type { FrameworkChild } from '../ComponentElement';
import { ComponentHostResolver } from '../ComponentHostResolver';
import { UiGraph } from '../../ui/graph/UiGraph';
import { UiGraphBuilder } from '../../ui/composition/UiGraphBuilder';
import { isComponentLikeElement, isObservable, type UiElement } from '../../ui/composition/UiElement';
import type { UiNode } from '../../ui/graph/UiNode';
import { UiInputDispatcher } from '../../ui/input/UiInputDispatcher';
import { UiHitTester } from '../../ui/input/UiHitTester';
import { UiPointerController } from '../../ui/input/UiPointerController';
import { UiWheelController } from '../../ui/input/UiWheelController';
import type { ScrollContainerState, ScrollSink } from '../../ui/input/UiWheelController';
import { UiFocusManager } from '../../ui/input/UiFocusManager';
import { UiKeyboardController } from '../../ui/input/UiKeyboardController';
import { CanvasPlatformSurface, UiPlatformAdapter } from '../../ui/input/UiPlatformAdapter';
import { DirtyFlags } from '../../ui/graph/DirtyFlags';
import { LayoutEngine } from '../../ui/layout/LayoutEngine';
import { Constraints } from '../../ui/layout/LayoutTypes';
import { CanvasTextMeasurer, createCanvasSurface, type CanvasHost, type CanvasSurface } from '../../ui/rendering';
import { Canvas2DRenderer } from '../../ui/rendering';
import { UiScheduler } from '../../ui/scheduler';
import { UiAnimationFrameClock } from '../../ui/scheduler';
import type { UiFrame, UiFrameClockFactory } from '../../ui/scheduler';
import { StoreRegistry } from '../store/StoreRegistry';
import type { Store } from '../store/Store';

/**
 * Guard against a root component that only ever renders another
 * component, which would otherwise recurse until the stack gives out.
 */
const MAX_ROOT_COMPONENT_DEPTH = 32;

export interface NodalAppOptions {
  host: HTMLElement;
  root: FrameworkChild;
  storeClasses?: (new () => Store)[];
  canvas?: CanvasHost;
  clock?: UiFrameClockFactory;
  /**
   * Set false to build the tree without attaching platform input.
   * Handlers declared with `on*` props are still registered, so they
   * can be driven directly through `app.input`.
   */
  input?: boolean;
}

/**
 * Single-thread Nodal application runtime.
 *
 * Owns the component renderer, graph, layout engine, scheduler,
 * canvas surface, and renderer. Runs everything on the main thread.
 */
export class NodalApp {
  readonly stores = new StoreRegistry();
  private readonly resolver: ComponentHostResolver;
  private readonly graph = new UiGraph();
  private readonly engine: LayoutEngine;
  private readonly builder: UiGraphBuilder;
  private readonly scheduler: UiScheduler;
  private readonly canvas: CanvasHost;
  private readonly surface: CanvasSurface;
  private readonly textMeasurer: CanvasTextMeasurer;
  private readonly canvasRenderer: Canvas2DRenderer;
  private readonly host: HTMLElement;
  private readonly dispatcher = new UiInputDispatcher();
  private readonly inputEnabled: boolean;

  private adapter: UiPlatformAdapter | undefined;

  private root: UiNode | undefined;
  private constraints: Constraints;
  private running = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(options: NodalAppOptions) {
    this.host = options.host;
    this.canvas = options.canvas ?? this.createCanvas();
    this.surface = createCanvasSurface(this.canvas);
    this.textMeasurer = new CanvasTextMeasurer(this.surface.getContext2D());
    this.engine = new LayoutEngine(this.textMeasurer);
    this.resolver = new ComponentHostResolver(this.stores);
    this.builder = new UiGraphBuilder(this.graph, { components: this.resolver, dispatcher: this.dispatcher });
    this.inputEnabled = options.input ?? true;
    this.canvasRenderer = new Canvas2DRenderer({ surface: this.surface });
    this.constraints = Constraints.loose(this.canvas.width || 600, this.canvas.height || 600);

    for (const StoreClass of options.storeClasses ?? []) {
      this.stores.register(StoreClass);
    }

    this.scheduler = new UiScheduler({
      clock: options.clock ?? (callback => new UiAnimationFrameClock(callback)),
      dirty: this.graph.getDirtyNodes(),
      onFrame: frame => this.handleFrame(frame)
    });

    this.graph.setDirtyListener(() => this.scheduler.notifyDirty());
    this.graph.setNodeRemovedListener(node => this.engine.detachNode(node));

    this.buildRoot(options.root);
    this.adapter = this.createInputAdapter();
  }

  /**
   * The input adapter, for tests and for callers that drive input
   * from a non-DOM source (a worker receiving forwarded events).
   */
  get input(): UiPlatformAdapter {
    if (this.adapter === undefined) {
      throw new Error('Input is not available: the app root has not been built.');
    }
    return this.adapter;
  }

  /**
   * Starts the app: appends the canvas to the host, sizes it,
   * runs an initial layout, and arms the frame scheduler.
   */
  mount(): void {
    if (this.running) {
      return;
    }
    this.running = true;

    if (
      typeof HTMLCanvasElement !== 'undefined' &&
      this.canvas instanceof HTMLCanvasElement &&
      this.canvas.parentElement !== this.host
    ) {
      this.host.appendChild(this.canvas);
      this.canvas.style.display = 'block';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
    }

    this.observeResize();
    this.resize(this.host.clientWidth || this.canvas.width || 600, this.host.clientHeight || this.canvas.height || 600);
    this.attachInput();
    this.scheduler.start();
  }

  /**
   * Stops the scheduler and detaches the canvas.
   */
  dispose(): void {
    this.running = false;
    this.scheduler.stop();
    this.resizeObserver?.disconnect();
    if (
      typeof HTMLCanvasElement !== 'undefined' &&
      this.canvas instanceof HTMLCanvasElement &&
      this.canvas.parentElement === this.host
    ) {
      this.host.removeChild(this.canvas);
    }
    this.adapter?.detach();
    this.graph.setDirtyListener(null);
    this.graph.setNodeRemovedListener(null);
    this.resolver.dispose();
  }

  /**
   * Resizes the surface and schedules a repaint.
   *
   * Public because the size of the drawing surface is owned by whoever
   * hosts it: a ResizeObserver here, and a forwarded resize message in
   * a worker runtime.
   *
   * Zero-sized reports are ignored. A hidden or detached host delivers
   * 0x0, and a zero logical size makes the renderer's cull rectangle
   * empty, which discards every node.
   */
  resize(width: number, height: number): void {
    if (!(width > 0) || !(height > 0)) {
      return;
    }
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.surface.setLogicalSize(width, height, dpr);
    this.constraints = Constraints.loose(width, height);
    if (this.root === undefined) {
      return;
    }
    this.engine.layout(this.root, this.constraints);
    // Resizing the backing store clears whatever was drawn, and layout
    // marks nothing dirty on its own, so without this the canvas stays
    // blank until some unrelated change happens to schedule a frame.
    this.graph.markDirty(this.root, DirtyFlags.Paint);
  }

  /**
   * The root UiNode of the built tree.
   *
   * Exposed for tests and devtools that need to inspect the retained
   * graph without reaching into private state.
   */
  debugRoot(): UiNode {
    if (this.root === undefined) {
      throw new Error('App root has not been built.');
    }
    return this.root;
  }

  private createCanvas(): HTMLCanvasElement {
    return document.createElement('canvas');
  }

  /**
   * Resolves the root definition down to a plain element and builds it.
   *
   * The root is the one component slot the builder cannot anchor for
   * us: anchors are transparent Fragments, and a Fragment is never a
   * valid layout root — it contributes no box, so the layout engine
   * would have nothing to size the tree against. The app therefore
   * mounts the root host itself and hands the builder real geometry.
   *
   * Root hosts are still mounted through the resolver, so their
   * onMount() fires from the build pass below, once their nodes exist.
   */
  private buildRoot(rootDefinition: FrameworkChild): void {
    this.root = this.builder.build(this.resolveRootElement(rootDefinition, 0));
    this.graph.propagateEnvironment(this.root);
  }

  private resolveRootElement(definition: FrameworkChild, depth: number): UiElement {
    if (isObservable(definition)) {
      throw new Error('Root definition cannot be an Observable. Wrap it in a component or static element.');
    }
    if (isComponentLikeElement(definition)) {
      if (depth > MAX_ROOT_COMPONENT_DEPTH) {
        throw new Error(
          `Root component chain exceeded ${MAX_ROOT_COMPONENT_DEPTH} levels without producing an element.`
        );
      }
      const output = this.resolver.resolve(definition, `app:component:${depth}`);
      return this.resolveRootElement(output as FrameworkChild, depth + 1);
    }
    return definition;
  }

  /**
   * Builds the input stack over the freshly built tree.
   *
   * Handlers are registered on the dispatcher by the builder as it
   * reconciles `on*` props; this wires the other half — hit-testing,
   * pointer/wheel/keyboard routing, and focus — so those handlers
   * actually receive events.
   */
  private createInputAdapter(): UiPlatformAdapter {
    const root = this.debugRoot();
    const hitTester = new UiHitTester(this.engine, root);
    const focusManager = new UiFocusManager(root, this.dispatcher);
    return new UiPlatformAdapter({
      pointerController: new UiPointerController(hitTester, this.dispatcher, {
        onPress: node => {
          if (node !== null) {
            focusManager.focusOnPress(node);
          }
        }
      }),
      wheelController: new UiWheelController(hitTester, this.dispatcher, this.createScrollSink()),
      keyboardController: new UiKeyboardController(this.dispatcher, focusManager, root)
    });
  }

  private attachInput(): void {
    if (!this.inputEnabled || this.adapter === undefined) {
      return;
    }
    if (typeof HTMLCanvasElement === 'undefined' || !(this.canvas instanceof HTMLCanvasElement)) {
      // A headless or offscreen canvas has no DOM events to forward.
      return;
    }
    this.canvas.tabIndex = 0;
    this.canvas.style.touchAction = 'none';
    this.adapter.attach(new CanvasPlatformSurface(this.canvas));
  }

  /**
   * Scrolling backed directly by layout records and node properties.
   *
   * The layout engine clamps scrollX/scrollY against content size on
   * every pass, so writing the raw offset here is enough.
   */
  private createScrollSink(): ScrollSink {
    return {
      containerState: (node): ScrollContainerState | undefined => {
        const record = this.engine.recordFor(node);
        if (record === undefined) {
          return undefined;
        }
        return {
          scrollX: record.scrollX,
          scrollY: record.scrollY,
          maxScrollX: Math.max(0, record.contentWidth - record.width),
          maxScrollY: Math.max(0, record.contentHeight - record.height),
          horizontal: node.getProperty('direction') === 'row'
        };
      },
      scrollBy: (node, dx, dy): void => {
        const record = this.engine.recordFor(node);
        if (record === undefined) {
          return;
        }
        if (dx !== 0) {
          node.setProperty('scrollX', record.scrollX + dx);
        }
        if (dy !== 0) {
          node.setProperty('scrollY', record.scrollY + dy);
        }
        this.graph.markDirty(node, DirtyFlags.Transform);
      }
    };
  }

  private handleFrame(frame: UiFrame): void {
    const root = this.root;
    if (root === undefined) {
      return;
    }
    this.graph.processEnvironmentDirty();
    this.engine.layoutForFrame(frame, this.constraints, root);
    this.canvasRenderer.render(root, { layout: this.engine, text: this.textMeasurer });
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
