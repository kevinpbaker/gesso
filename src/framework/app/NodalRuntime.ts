import type { FrameworkChild } from '../ComponentElement';
import { ComponentHostResolver } from '../ComponentHostResolver';
import { UiGraph } from '../../ui/graph/UiGraph';
import { UiGraphBuilder } from '../../ui/composition/UiGraphBuilder';
import { isComponentLikeElement, isObservable, type UiElement } from '../../ui/composition/UiElement';
import { Stack } from '../../ui/composition/UiComponents';
import { createComponent } from '../createComponent';
import { OverlayLayer } from '../overlay/OverlayLayer';
import { OverlayStore } from '../overlay/OverlayStore';
import { DirtyFlags } from '../../ui/graph/DirtyFlags';
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
import { Constraints } from '../../ui/layout/LayoutTypes';
import {
  Canvas2DRenderer,
  CanvasTextMeasurer,
  createCanvasSurface,
  type CanvasHost,
  type CanvasSurface
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
export const UI_FRAME_PHASES = ['patches', 'environment', 'layout', 'render'] as const;

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

export interface NodalRuntimeOptions {
  /** Root component or element. */
  root: FrameworkChild;
  /** Canvas to draw into: HTMLCanvasElement, OffscreenCanvas, or a test double. */
  canvas: CanvasHost;
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

  private readonly resolver: ComponentHostResolver;
  private readonly graph = new UiGraph();
  private readonly engine: LayoutEngine;
  private readonly builder: UiGraphBuilder;
  private readonly scheduler: UiScheduler;
  private readonly surface: CanvasSurface;
  private readonly textMeasurer: CanvasTextMeasurer;
  private readonly canvasRenderer: Canvas2DRenderer;
  private readonly dispatcher = new UiInputDispatcher();

  /** The layout root: a stack holding the app root and the overlay layer. */
  private root: UiNode | undefined;
  /** The node the app's root definition produced. */
  private appRoot: UiNode | undefined;
  private constraints: Constraints;
  private pixelRatio: number;
  private lastFrameMs = 0;
  private frameListener: ((metrics: FrameMetrics) => void) | null = null;
  private scrollbarTimer: ReturnType<typeof setTimeout> | null = null;
  private replicas: readonly StoreReplica[] = [];
  private phaseTimings: FramePhaseTimings = emptyPhaseTimings();

  constructor(options: NodalRuntimeOptions) {
    this.stores = options.stores ?? new StoreRegistry();
    this.surface = createCanvasSurface(options.canvas);
    this.textMeasurer = new CanvasTextMeasurer(this.surface.getContext2D());
    this.engine = new LayoutEngine(this.textMeasurer);
    this.resolver = new ComponentHostResolver(this.stores);
    this.builder = new UiGraphBuilder(this.graph, { components: this.resolver, dispatcher: this.dispatcher });
    this.canvasRenderer = new Canvas2DRenderer({ surface: this.surface });
    this.pixelRatio = options.dpr ?? 1;
    this.constraints = Constraints.loose(options.width ?? 600, options.height ?? 600);

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
   * Receives per-frame timings. Used to report metrics across a
   * worker boundary, and by tests asserting frames actually ran.
   */
  onFrame(listener: ((metrics: FrameMetrics) => void) | null): void {
    this.frameListener = listener;
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
    this.scheduler.stop();
    this.graph.setDirtyListener(null);
    this.graph.setNodeRemovedListener(null);
    this.frameListener = null;
    this.resolver.dispose();
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
    return {
      dispatcher: this.dispatcher,
      focus,
      pointer: new UiPointerController(hitTester, this.dispatcher, {
        onPress: node => {
          if (node !== null) {
            focus.focusOnPress(node);
          }
        }
      }),
      wheel: new UiWheelController(hitTester, this.dispatcher, this.createScrollSink()),
      keyboard: new UiKeyboardController(this.dispatcher, focus, root)
    };
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
  }

  private handleFrame(frame: UiFrame): void {
    const root = this.root;
    if (root === undefined) {
      return;
    }
    const started = now();

    this.phaseTimings.layout = this.timePhase(
      () => frameNeedsLayout(frame),
      () => this.engine.layoutForFrame(frame, this.constraints, root)
    );

    // Render is unconditional: the Canvas2D backend redraws the whole
    // scene, so any frame that got this far changes pixels.
    this.phaseTimings.render = this.timePhase(
      () => true,
      () => this.canvasRenderer.render(root, { layout: this.engine, text: this.textMeasurer, now: started })
    );

    const finished = now();
    const elapsed = finished - started;
    this.lastFrameMs = elapsed;
    this.scheduleScrollbarFade(finished);
    this.frameListener?.({
      frame: frame.id,
      durationMs: elapsed,
      nodes: frame.size,
      at: finished,
      phases: this.phaseTimings
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
  /** Milliseconds per phase. A phase with no work reports 0. */
  phases: FramePhaseTimings;
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

function emptyPhaseTimings(): FramePhaseTimings {
  return { patches: 0, environment: 0, layout: 0, render: 0 };
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
