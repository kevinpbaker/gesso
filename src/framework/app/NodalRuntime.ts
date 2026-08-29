import type { FrameworkChild } from '../ComponentElement';
import { ComponentHostResolver } from '../ComponentHostResolver';
import { UiGraph } from '../../ui/graph/UiGraph';
import { UiGraphBuilder } from '../../ui/composition/UiGraphBuilder';
import { isComponentLikeElement, isObservable, type UiElement } from '../../ui/composition/UiElement';
import { Stack } from '../../ui/composition/UiComponents';
import { scrollbarThumb } from '../../ui/layout/Scrollbars';
import {
  UiVirtualWindow,
  VIRTUAL_INDEX_PROP,
  VIRTUAL_WINDOW_PROP,
  type VirtualItemMeasure
} from '../../ui/composition/UiVirtualWindow';
import { createComponent } from '../createComponent';
import { OverlayLayer } from '../overlay/OverlayLayer';
import { OverlayStore } from '../overlay/OverlayStore';
import { DirtyFlags } from '../../ui/graph/DirtyFlags';
import { resolveCursor } from '../../ui/input/UiInteraction';
import type { UiNode } from '../../ui/graph/UiNode';
import { UiNodeType } from '../../ui/graph/UiNodeType';
import { UiInputDispatcher } from '../../ui/input/UiInputDispatcher';
import { UiHitTester } from '../../ui/input/UiHitTester';
import { UiPointerController } from '../../ui/input/UiPointerController';
import { UiWheelController } from '../../ui/input/UiWheelController';
import type { ScrollContainerState, ScrollSink } from '../../ui/input/UiWheelController';
import { UiFocusManager } from '../../ui/input/UiFocusManager';
import { UiKeyboardController } from '../../ui/input/UiKeyboardController';
import { LayoutEngine } from '../../ui/layout/LayoutEngine';
import type { LayoutExplanation } from '../../ui/layout/LayoutExplanation';
import { Constraints } from '../../ui/layout/LayoutTypes';
import {
  Canvas2DRenderer,
  CanvasTextMeasurer,
  createCanvasSurface,
  createWebGPUSurface,
  LayoutInspector,
  WebGPURenderer,
  type CanvasHost,
  type CanvasSurface,
  type RendererBackend,
  type UiRenderer,
  type WebGPUCanvasHost
} from '../../ui/rendering';
import { UiScheduler, UiTimerFrameClock } from '../../ui/scheduler';
import type { UiFrame, UiFrameClockFactory } from '../../ui/scheduler';
import { StoreRegistry } from '../store/StoreRegistry';
import type { Store } from '../store/Store';
import type { StoreReplica } from '../store/worker/StoreReplica';

/**
 * The ordered work of one frame.
 *
 * Only four of the seven stages the design document imagined are real
 * phases. Component reconciliation and input dispatch are driven by
 * events, not by the clock: an observable emission reconciles its
 * subtree immediately and a pointer event routes immediately, each
 * marking nodes dirty so the *effects* land in the next frame. Giving
 * them frame slots would add latency and describe the system falsely.
 *
 * `patches` and `environment` run before the dirty set is snapshotted,
 * because both produce dirt that this frame must see. `layout` and
 * `render` run against the snapshot.
 */
export const UI_FRAME_PHASES = ['patches', 'environment', 'virtualize', 'layout', 'render'] as const;

export type UiFramePhase = (typeof UI_FRAME_PHASES)[number];

export type FramePhaseTimings = Record<UiFramePhase, number>;

/**
 * Guard against a root component that only ever renders another
 * component, which would otherwise recurse until the stack gives out.
 */
const MAX_ROOT_COMPONENT_DEPTH = 32;

/**
 * Input controllers over the built tree.
 *
 * Exposed because input arrives differently per thread: from DOM
 * events through a UiPlatformAdapter on the main thread, and from
 * forwarded messages in a render worker. Both end up calling these.
 */
export interface RuntimeInput {
  readonly dispatcher: UiInputDispatcher;
  readonly pointer: UiPointerController;
  readonly wheel: UiWheelController;
  readonly keyboard: UiKeyboardController;
  readonly focus: UiFocusManager;
}

/**
 * Which backend draws.
 *
 * `canvas2d` is the default and the portable choice: WKWebView and
 * WebKitGTK do not ship WebGPU. `webgpu` asks for it and falls back to
 * Canvas2D when the adapter or device cannot be had, reporting the
 * fallback once; `auto` does the same without the report.
 */
export type RendererChoice = RendererBackend | 'auto';

export interface NodalRuntimeOptions {
  /** Root component or element. */
  root: FrameworkChild;
  /** Canvas to draw into: HTMLCanvasElement, OffscreenCanvas, or a test double. */
  canvas: CanvasHost;
  /** The rendering backend. Defaults to `canvas2d`; see RendererChoice. */
  renderer?: RendererChoice;
  /**
   * A canvas for text measurement when the draw canvas is WebGPU's — a
   * canvas holds one context, so the measurer needs its own. Defaults
   * to a 1×1 OffscreenCanvas; tests pass a double.
   */
  measureCanvas?: CanvasHost;
  storeClasses?: (new () => Store)[];
  /**
   * A registry built elsewhere, when some stores live in data workers.
   * Takes the place of storeClasses.
   */
  stores?: StoreRegistry;
  /** Defaults to a timer clock, which is the only option inside a worker. */
  clock?: UiFrameClockFactory;
  /** Initial logical size. Callers normally follow with resize(). */
  width?: number;
  height?: number;
  dpr?: number;
}

/**
 * The whole UI, with no reference to the DOM.
 *
 * Owns the component runtime, retained graph, layout engine, input
 * controllers, scheduler and renderer. Everything here runs happily
 * in a Worker: the only things it cannot do for itself are obtain a
 * canvas and learn about size and input, which is exactly the split
 * between this class and its two hosts — NodalApp on the main thread
 * and renderRoot() in a render worker.
 */
export class NodalRuntime {
  readonly stores: StoreRegistry;
  readonly input: RuntimeInput;
  /**
   * The layout inspector: hover boxes, a heatmap of measured nodes and
   * `engine.explain` for the hovered node, painted over each frame
   * while enabled. Off by default; see `setInspectorEnabled`.
   */
  readonly inspector: LayoutInspector;

  private readonly resolver: ComponentHostResolver;
  private readonly graph = new UiGraph();
  private readonly engine: LayoutEngine;
  private readonly builder: UiGraphBuilder;
  private readonly scheduler: UiScheduler;
  private readonly canvas: CanvasHost;
  private readonly textMeasurer: CanvasTextMeasurer;
  /** The 2D surface when Canvas2D draws; the inspector paints on it. */
  private canvasSurface: CanvasSurface | null = null;
  private renderer: UiRenderer;
  private rendererState: RendererBackend | 'pending';
  /** Resolves with the backend that ended up drawing. */
  readonly rendererReady: Promise<RendererBackend>;
  private readonly dispatcher = new UiInputDispatcher();
  private width: number;
  private height: number;

  /** The layout root: a stack holding the app root and the overlay layer. */
  private root: UiNode | undefined;
  /** The node the app's root definition produced. */
  private appRoot: UiNode | undefined;
  private constraints: Constraints;
  private pixelRatio: number;
  private lastFrameMs = 0;
  private frameListener: ((metrics: FrameMetrics) => void) | null = null;
  private rendererErrorListener: ((message: string) => void) | null = null;
  /** WebGPU stage timings of the frame being rendered; null on Canvas2D. */
  private gpuTimings: GpuStageTimings | null = null;
  private inspectListener: ((text: string | null) => void) | null = null;
  private lastInspection: string | null = null;
  private cursorListener: ((cursor: string | null) => void) | null = null;
  private lastCursor: string | null = null;
  private scrollbarTimer: ReturnType<typeof setTimeout> | null = null;
  private inspectorTimer: ReturnType<typeof setTimeout> | null = null;
  private replicas: readonly StoreReplica[] = [];
  private phaseTimings: FramePhaseTimings = emptyPhaseTimings();

  constructor(options: NodalRuntimeOptions) {
    this.stores = options.stores ?? new StoreRegistry();
    this.canvas = options.canvas;
    this.pixelRatio = options.dpr ?? 1;
    this.width = options.width ?? 600;
    this.height = options.height ?? 600;
    this.constraints = Constraints.loose(this.width, this.height);

    const choice = options.renderer ?? 'canvas2d';
    if (choice === 'canvas2d') {
      this.canvasSurface = createCanvasSurface(options.canvas);
      this.textMeasurer = new CanvasTextMeasurer(this.canvasSurface.getContext2D());
      this.renderer = new Canvas2DRenderer({ surface: this.canvasSurface });
      this.rendererState = 'canvas2d';
      this.rendererReady = Promise.resolve('canvas2d');
    } else {
      // The draw canvas will hold the WebGPU context, so text is measured
      // on a canvas of its own. One measurer still serves layout and the
      // renderer, which is what keeps line breaks identical.
      const measureSurface = createCanvasSurface(options.measureCanvas ?? createMeasureCanvas());
      this.textMeasurer = new CanvasTextMeasurer(measureSurface.getContext2D());
      const webgpu = new WebGPURenderer({
        surface: createWebGPUSurface(options.canvas as unknown as WebGPUCanvasHost),
        onError: message => this.reportRendererError(message),
        hooks: {
          onPrepareEnd: ms => (this.gpuTimings = { ...(this.gpuTimings ?? emptyGpuTimings()), prepare: ms }),
          onUploadEnd: ms => (this.gpuTimings = { ...(this.gpuTimings ?? emptyGpuTimings()), upload: ms }),
          onEncodeEnd: ms => (this.gpuTimings = { ...(this.gpuTimings ?? emptyGpuTimings()), encode: ms })
        }
      });
      this.renderer = webgpu;
      this.rendererState = 'pending';
      this.rendererReady = webgpu
        .initialize()
        .then((): RendererBackend => {
          if (this.renderer !== webgpu) {
            return this.rendererState === 'pending' ? 'canvas2d' : this.rendererState;
          }
          this.rendererState = 'webgpu';
          this.renderer.resize(this.width, this.height, this.pixelRatio);
          this.requestRepaint();
          return 'webgpu';
        })
        .catch((error: unknown): RendererBackend => {
          if (choice === 'webgpu') {
            // eslint-disable-next-line no-console
            console.error('WebGPU was requested but is unavailable; drawing with Canvas2D.', error);
          }
          this.fallBackToCanvas2D(webgpu);
          return 'canvas2d';
        });
    }

    this.engine = new LayoutEngine(this.textMeasurer);
    this.inspector = new LayoutInspector(this.engine);
    this.resolver = new ComponentHostResolver(this.stores);
    this.builder = new UiGraphBuilder(this.graph, { components: this.resolver, dispatcher: this.dispatcher });

    for (const StoreClass of options.storeClasses ?? []) {
      this.stores.register(StoreClass);
    }
    // Every runtime has an overlay layer; the store behind it is local
    // by necessity (its entries hold elements and nodes).
    if (!this.stores.has(OverlayStore)) {
      this.stores.register(OverlayStore);
    }

    this.scheduler = new UiScheduler({
      clock: options.clock ?? (callback => new UiTimerFrameClock(callback)),
      dirty: this.graph.getDirtyNodes(),
      beforeCollect: () => this.runPreCollectPhases(),
      onFrame: frame => this.handleFrame(frame)
    });

    this.graph.setDirtyListener(() => this.scheduler.notifyDirty());
    this.graph.setNodeRemovedListener(node => this.engine.detachNode(node));

    this.buildRoot(options.root);
    this.input = this.createInput();
    // Keyboard navigation must keep the focused control visible.
    this.input.focus.onFocusChange(node => {
      if (node !== null) {
        this.scrollIntoView(node);
      }
    });

    if (options.width !== undefined && options.height !== undefined) {
      this.resize(options.width, options.height, this.pixelRatio);
    }
  }

  /**
   * Aligns patch delivery from worker-owned stores to the frame.
   *
   * Without this a burst of patches rebuilds the bound subtree once per
   * patch, even though only the final state is ever drawn.
   */
  deferPatchesFrom(replicas: readonly StoreReplica[]): void {
    this.replicas = replicas;
    for (const replica of replicas) {
      replica.deferPatches(() => this.scheduler.notifyDirty());
    }
  }

  /** Starts the frame scheduler. */
  start(): void {
    this.scheduler.start();
  }

  /** The backend drawing frames, or `pending` while WebGPU initialises. */
  get rendererBackend(): RendererBackend | 'pending' {
    return this.rendererState;
  }

  /**
   * Receives renderer errors — GPU validation failures, device loss —
   * that would otherwise only reach the console of whichever thread
   * renders. Without a listener they are logged.
   */
  onRendererError(listener: ((message: string) => void) | null): void {
    this.rendererErrorListener = listener;
  }

  private reportRendererError(message: string): void {
    if (this.rendererErrorListener !== null) {
      this.rendererErrorListener(message);
      return;
    }
    // eslint-disable-next-line no-console
    console.error(message);
  }

  /**
   * Replaces a WebGPU renderer that could not start, or lost its
   * device, with Canvas2D on the same canvas. The WebGPU path does not
   * touch the canvas until it has a device, so the 2D context is free.
   */
  private fallBackToCanvas2D(failed: UiRenderer): void {
    if (this.renderer !== failed) {
      return;
    }
    failed.dispose();
    this.canvasSurface = createCanvasSurface(this.canvas);
    this.renderer = new Canvas2DRenderer({ surface: this.canvasSurface });
    this.rendererState = 'canvas2d';
    this.renderer.resize(this.width, this.height, this.pixelRatio);
    this.requestRepaint();
  }

  private requestRepaint(): void {
    if (this.root !== undefined) {
      this.graph.markDirty(this.root, DirtyFlags.Paint);
    }
  }

  /**
   * Resizes the surface and schedules a repaint.
   *
   * Zero-sized reports are ignored. A hidden or detached host delivers
   * 0x0, and a zero logical size makes the renderer's cull rectangle
   * empty, which discards every node.
   */
  resize(width: number, height: number, dpr: number = this.pixelRatio): void {
    if (!(width > 0) || !(height > 0)) {
      return;
    }
    this.pixelRatio = dpr;
    this.width = width;
    this.height = height;
    this.renderer.resize(width, height, dpr);
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
   * Receives per-frame timings. Used to report metrics across a
   * worker boundary, and by tests asserting frames actually ran.
   */
  onFrame(listener: ((metrics: FrameMetrics) => void) | null): void {
    this.frameListener = listener;
  }

  /**
   * Turns the layout inspector on or off. While on, every frame paints
   * the hovered node's boxes and the measure heatmap over the scene, and
   * the inspect listener receives the hovered node's explanation.
   */
  setInspectorEnabled(enabled: boolean): void {
    if (this.inspector.isEnabled === enabled) {
      return;
    }
    this.inspector.setEnabled(enabled);
    if (enabled) {
      this.inspector.setHovered(this.input.pointer.hoveredNode);
    }
    // Always sent, so a listener learns the toggle even when the text
    // happens to match (null before and after).
    this.lastInspection = this.inspector.explainHoveredText();
    this.inspectListener?.(this.lastInspection);
    if (this.root !== undefined) {
      this.graph.markDirty(this.root, DirtyFlags.Paint);
    }
  }

  /**
   * Receives the hovered node's layout explanation as text whenever it
   * changes while the inspector is on, and null when nothing is hovered
   * or the inspector is turned off.
   */
  onInspect(listener: ((text: string | null) => void) | null): void {
    this.inspectListener = listener;
  }

  /**
   * Receives the cursor the hovered node asks for (`cursor: 'pointer'`
   * on it or an ancestor) whenever it changes, and null when nothing
   * under the pointer sets one. The shell applies it to the canvas —
   * the runtime has no DOM, in a worker least of all.
   */
  onCursor(listener: ((cursor: string | null) => void) | null): void {
    this.cursorListener = listener;
  }

  /** The cursor currently reported to the shell; null is the default arrow. */
  get cursor(): string | null {
    return this.lastCursor;
  }

  /** `engine.explain` for any node, for tests and devtools. */
  explain(node: UiNode): LayoutExplanation {
    return this.engine.explain(node);
  }

  /**
   * The UiNode the app's root definition produced.
   *
   * For tests and devtools that inspect the retained graph without
   * reaching into private state. It is the first child of the layout
   * root, whose only other child is the overlay layer.
   */
  debugRoot(): UiNode {
    if (this.appRoot === undefined) {
      throw new Error('App root has not been built.');
    }
    return this.appRoot;
  }

  /** The laid-out box of a node, for tests and devtools. */
  debugLayoutBox(node: UiNode): { x: number; y: number; width: number; height: number } {
    return this.engine.worldBox(node);
  }

  /**
   * The node layout, hit testing and painting start from: a stack that
   * stretches the app root over the viewport with the overlay layer on
   * top of it.
   */
  layoutRoot(): UiNode {
    if (this.root === undefined) {
      throw new Error('App root has not been built.');
    }
    return this.root;
  }

  /**
   * Scrolls every scroll container above `node` just enough that the
   * node is inside its viewport, `padding` pixels from the nearest edge.
   * Nothing moves when it is already visible.
   */
  scrollIntoView(node: UiNode, padding = 8): void {
    for (const adjustment of this.engine.revealAdjustments(node, padding)) {
      adjustment.container.setProperty('scrollX', adjustment.scrollX);
      adjustment.container.setProperty('scrollY', adjustment.scrollY);
      this.graph.markDirty(adjustment.container, DirtyFlags.Transform);
    }
  }

  dispose(): void {
    if (this.scrollbarTimer !== null) {
      clearTimeout(this.scrollbarTimer);
      this.scrollbarTimer = null;
    }
    if (this.inspectorTimer !== null) {
      clearTimeout(this.inspectorTimer);
      this.inspectorTimer = null;
    }
    this.inspectListener = null;
    this.cursorListener = null;
    this.rendererErrorListener = null;
    this.scheduler.stop();
    this.graph.setDirtyListener(null);
    this.graph.setNodeRemovedListener(null);
    this.frameListener = null;
    this.resolver.dispose();
    this.renderer.dispose();
  }

  /**
   * Resolves the root definition down to a plain element and builds it.
   *
   * The root is the one component slot the builder cannot anchor for
   * us: anchors are transparent Fragments, and a Fragment is never a
   * valid layout root — it contributes no box, so the layout engine
   * would have nothing to size the tree against. The runtime therefore
   * mounts the root host itself and hands the builder real geometry.
   *
   * Root hosts are still mounted through the resolver, so their
   * onMount() fires from the build pass below, once their nodes exist.
   */
  private buildRoot(rootDefinition: FrameworkChild): void {
    const appElement = this.resolveRootElement(rootDefinition, 0);
    // The app root stretches over the viewport exactly as it did when
    // it was the layout root; the overlay layer floats above it.
    this.root = this.builder.build(
      Stack({ x: 'stretch', y: 'stretch', position: 'relative' }, appElement, createComponent(OverlayLayer))
    );
    const appRoot = this.root.firstChild;
    if (appRoot === null) {
      throw new Error('The app root produced no node.');
    }
    this.appRoot = appRoot;
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
  private createInput(): RuntimeInput {
    const root = this.layoutRoot();
    const hitTester = new UiHitTester(this.engine, root);
    const focus = new UiFocusManager(root, this.dispatcher);
    const scrollSink = this.createScrollSink();
    return {
      dispatcher: this.dispatcher,
      focus,
      pointer: new UiPointerController(hitTester, this.dispatcher, {
        onPress: node => {
          if (node !== null) {
            focus.focusOnPress(node);
          }
        },
        scrollSink,
        onHoverChange: node => this.handleHoverChange(node)
      }),
      wheel: new UiWheelController(hitTester, this.dispatcher, scrollSink),
      keyboard: new UiKeyboardController(this.dispatcher, focus, root)
    };
  }

  /**
   * With the inspector on, a hover change repaints (the overlay follows
   * the pointer) and re-explains the hovered node for the listener.
   */
  private handleHoverChange(node: UiNode | null): void {
    this.sendCursor();
    if (!this.inspector.isEnabled || !this.inspector.setHovered(node)) {
      return;
    }
    this.sendInspection();
    if (this.root !== undefined) {
      this.graph.markDirty(this.root, DirtyFlags.Paint);
    }
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
          horizontal: node.getProperty('direction') === 'row' || node.type === UiNodeType.Row
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
      },
      revealScrollbars: (node): void => {
        this.engine.revealScrollbars(node);
        this.graph.markDirty(node, DirtyFlags.Paint);
      },
      scrollbar: (node, axis) => {
        const record = this.engine.recordFor(node);
        return record === undefined ? null : scrollbarThumb(record, axis);
      }
    };
  }

  /**
   * Work that must happen before the frame's dirty set is snapshotted.
   *
   * Environment propagation belongs here and nowhere else: rebuilding a
   * node's environment marks its descendants dirty, and those nodes
   * have to be in the frame that is about to be collected. Run after
   * collection it saw an already-drained set and silently did nothing,
   * so a theme change never reached descendants at all.
   */
  /**
   * The phases that run before the frame's dirty set is snapshotted.
   *
   * Both produce dirt of their own — applying a patch updates bound
   * properties, rebuilding an environment marks descendants — and those
   * nodes have to belong to the frame about to be collected. Run after
   * collection, the environment phase saw an already-drained set and
   * silently did nothing, so a theme change never reached descendants.
   */
  private runPreCollectPhases(): void {
    this.phaseTimings = emptyPhaseTimings();

    this.phaseTimings.patches = this.timePhase(
      () => this.replicas.some(replica => replica.hasPendingPatches),
      () => {
        for (const replica of this.replicas) {
          replica.flush();
        }
      }
    );

    this.phaseTimings.environment = this.timePhase(
      () => this.graph.hasEnvironmentDirty(),
      () => this.graph.processEnvironmentDirty()
    );

    // Lazy lists decide which rows to mount from the scroll offset the
    // frame is about to lay out with, so rows a scroll reveals are built,
    // measured and painted on that same frame.
    this.phaseTimings.virtualize = this.timePhase(
      () => this.hasVirtualWindows(),
      () => this.updateVirtualWindows()
    );
  }

  private hasVirtualWindows(): boolean {
    for (const node of this.engine.scrollContainers()) {
      if (node.properties.get(VIRTUAL_WINDOW_PROP) instanceof UiVirtualWindow) {
        return true;
      }
    }
    return false;
  }

  /**
   * Advances every lazy list's window: reports the container's scroll
   * offset and viewport, and the measured extent of each mounted item,
   * then applies any scroll adjustment the window asks for to keep its
   * first item anchored while estimates above it are corrected.
   */
  private updateVirtualWindows(): void {
    for (const node of this.engine.scrollContainers()) {
      const window = node.properties.get(VIRTUAL_WINDOW_PROP);
      if (!(window instanceof UiVirtualWindow)) {
        continue;
      }
      const rec = this.engine.recordFor(node);
      if (rec === undefined) {
        continue;
      }
      const column = window.axis === 'column';
      // A wheel may have written a newer offset than the record holds.
      const scrollProp = node.properties.get(column ? 'scrollY' : 'scrollX');
      const scroll = typeof scrollProp === 'number' ? scrollProp : column ? rec.scrollY : rec.scrollX;
      const measures: VirtualItemMeasure[] = [];
      this.collectVirtualMeasures(node, column, measures);
      const result = window.update({ scroll, extent: column ? rec.height : rec.width }, measures);
      if (result.scrollAdjust !== 0) {
        node.setProperty(column ? 'scrollY' : 'scrollX', scroll + result.scrollAdjust);
        this.graph.markDirty(node, DirtyFlags.Transform);
      }
    }
  }

  private collectVirtualMeasures(parent: UiNode, column: boolean, out: VirtualItemMeasure[]): void {
    for (let child = parent.firstChild; child !== null; child = child.nextSibling) {
      if (child.type === UiNodeType.Fragment) {
        this.collectVirtualMeasures(child, column, out);
        continue;
      }
      const index = child.properties.get(VIRTUAL_INDEX_PROP);
      if (typeof index !== 'number') {
        continue;
      }
      const rec = this.engine.recordFor(child);
      if (rec === undefined) {
        continue;
      }
      out.push({
        index,
        extent: column
          ? rec.measuredHeight + rec.marginTop + rec.marginBottom
          : rec.measuredWidth + rec.marginLeft + rec.marginRight
      });
    }
  }

  private handleFrame(frame: UiFrame): void {
    const root = this.root;
    if (root === undefined) {
      return;
    }
    const started = now();

    const laidOut = frameNeedsLayout(frame);
    this.phaseTimings.layout = this.timePhase(
      () => laidOut,
      () => this.engine.layoutForFrame(frame, this.constraints, root)
    );
    if (laidOut) {
      this.inspector.recordLayout(started);
    }

    // Render is unconditional once the backend is ready: both backends
    // redraw the whole scene, so any frame that got this far changes
    // pixels. Before WebGPU has a device there is nothing to draw with;
    // a lost device falls back to Canvas2D and repaints.
    if (this.renderer.backend === 'webgpu' && (this.renderer as WebGPURenderer).isLost) {
      this.fallBackToCanvas2D(this.renderer);
    }
    // The inspector's overlay rides along with the frame, so either
    // backend draws it over the finished scene. The hovered node's
    // explanation only changes with layout, so it is re-read then and
    // sent when it differs from what the listener already has.
    const overlay = this.inspector.isEnabled ? this.inspector.overlay(started) : null;
    this.gpuTimings = null;
    this.phaseTimings.render = this.timePhase(
      () => this.renderer.isReady,
      () =>
        this.renderer.render(root, {
          layout: this.engine,
          text: this.textMeasurer,
          now: started,
          overlay: overlay?.shapes
        })
    );
    if (overlay !== null) {
      if (laidOut) {
        this.sendInspection();
      }
      this.scheduleInspectorRepaint(overlay.nextChange);
    }

    const finished = now();
    const elapsed = finished - started;
    this.lastFrameMs = elapsed;
    this.scheduleScrollbarFade(finished);
    // A frame can change the cursor without the pointer moving: the
    // hovered node's `cursor` prop, or the node itself, may have changed.
    this.sendCursor();
    this.frameListener?.({
      frame: frame.id,
      durationMs: elapsed,
      nodes: frame.size,
      measured: this.engine.stats.measured,
      relayoutRoots: this.engine.stats.fullLayout ? 0 : this.engine.stats.relayoutRoots,
      at: finished,
      phases: this.phaseTimings,
      renderer: this.rendererState,
      gpu: this.gpuTimings
    });
  }

  /**
   * Overlay scrollbars fade after scrolling stops, which needs frames no
   * property change asks for. The engine says when the next change is
   * due; one pending timer marks a repaint for it.
   */
  private scheduleScrollbarFade(now: number): void {
    const next = this.engine.nextScrollbarChange(now);
    if (next === undefined || this.scrollbarTimer !== null) {
      return;
    }
    this.scrollbarTimer = setTimeout(
      () => {
        this.scrollbarTimer = null;
        if (this.root !== undefined) {
          this.graph.markDirty(this.root, DirtyFlags.Paint);
        }
      },
      Math.max(16, next - now)
    );
  }

  /**
   * The heatmap cools in steps, which needs frames nothing else asks
   * for; one pending timer marks a repaint for the next step due.
   */
  private scheduleInspectorRepaint(nextChange: number | undefined): void {
    if (nextChange === undefined || this.inspectorTimer !== null) {
      return;
    }
    this.inspectorTimer = setTimeout(
      () => {
        this.inspectorTimer = null;
        if (this.root !== undefined && this.inspector.isEnabled) {
          this.graph.markDirty(this.root, DirtyFlags.Paint);
        }
      },
      Math.max(16, nextChange)
    );
  }

  /** Hands the listener the hovered node's cursor, when it changed. */
  private sendCursor(): void {
    const cursor = resolveCursor(this.input.pointer.hoveredNode);
    if (cursor === this.lastCursor) {
      return;
    }
    this.lastCursor = cursor;
    this.cursorListener?.(cursor);
  }

  /** Hands the listener the hovered node's explanation, when it changed. */
  private sendInspection(): void {
    const text = this.inspector.explainHoveredText();
    if (text === this.lastInspection) {
      return;
    }
    this.lastInspection = text;
    this.inspectListener?.(text);
  }

  /**
   * Runs a phase when it has work, returning what it cost.
   *
   * A skipped phase reports 0, which is what makes the breakdown
   * useful: a frame doing nothing but scrolling should show zeroes
   * everywhere but render.
   */
  private timePhase(hasWork: () => boolean, run: () => void): number {
    if (!hasWork()) {
      return 0;
    }
    const started = now();
    run();
    return now() - started;
  }

  /** Duration of the most recent frame, in milliseconds. */
  get lastFrameDurationMs(): number {
    return this.lastFrameMs;
  }
}

export interface FrameMetrics {
  frame: number;
  durationMs: number;
  nodes: number;
  /** Nodes the layout phase measured (memo hits excluded). */
  measured: number;
  /** Relayout boundaries the layout phase started from; 0 when it ran from the root or not at all. */
  relayoutRoots: number;
  /** Milliseconds per phase. A phase with no work reports 0. */
  phases: FramePhaseTimings;
  /** The backend that drew this frame, or `pending` while WebGPU initialises. */
  renderer: RendererBackend | 'pending';
  /**
   * The WebGPU render phase split into its stages — building the render
   * list, uploading buffers, encoding and submitting — or null when
   * Canvas2D drew. Their sum is the render phase's cost on the GPU path.
   */
  gpu: GpuStageTimings | null;
  /**
   * When the frame finished, on the clock of the thread that rendered
   * it. Gaps between consecutive values are the only honest measure of
   * a stall: across a worker boundary the messages themselves queue up
   * behind a blocked main thread and all arrive at once, so arrival
   * times say nothing about when the work happened.
   */
  at: number;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** A canvas for the text measurer when the draw canvas is not a 2D one. */
function createMeasureCanvas(): CanvasHost {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(1, 1) as unknown as CanvasHost;
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas;
  }
  throw new Error('NodalRuntime: no canvas is available for text measurement; pass `measureCanvas`.');
}

/** Milliseconds per WebGPU stage of one frame. */
export interface GpuStageTimings {
  prepare: number;
  upload: number;
  encode: number;
}

function emptyGpuTimings(): GpuStageTimings {
  return { prepare: 0, upload: 0, encode: 0 };
}

function emptyPhaseTimings(): FramePhaseTimings {
  return { patches: 0, environment: 0, virtualize: 0, layout: 0, render: 0 };
}

/**
 * Whether anything in the frame needs measuring or placing.
 *
 * Mirrors what LayoutEngine.layoutForFrame decides internally, so a
 * scroll-only frame is reported as skipping layout rather than
 * spending an immeasurable amount of time deciding to do nothing.
 */
function frameNeedsLayout(frame: UiFrame): boolean {
  const layoutFlags = DirtyFlags.Layout | DirtyFlags.Children | DirtyFlags.SubtreeLayout | DirtyFlags.Transform;
  return frame.nodes.some(node => (frame.dirtyFlagsFor(node) & layoutFlags) !== 0);
}
