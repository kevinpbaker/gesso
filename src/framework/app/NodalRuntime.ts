import type { FrameworkChild } from '../ComponentElement';
import { ComponentHostResolver } from '../ComponentHostResolver';
import { UiGraph } from '../../ui/graph/UiGraph';
import { UiGraphBuilder } from '../../ui/composition/UiGraphBuilder';
import { isComponentLikeElement, isObservable, type UiElement } from '../../ui/composition/UiElement';
import { DirtyFlags } from '../../ui/graph/DirtyFlags';
import type { UiNode } from '../../ui/graph/UiNode';
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

  private root: UiNode | undefined;
  private constraints: Constraints;
  private pixelRatio: number;
  private lastFrameMs = 0;
  private frameListener: ((metrics: FrameMetrics) => void) | null = null;

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

    this.scheduler = new UiScheduler({
      clock: options.clock ?? (callback => new UiTimerFrameClock(callback)),
      dirty: this.graph.getDirtyNodes(),
      onFrame: frame => this.handleFrame(frame)
    });

    this.graph.setDirtyListener(() => this.scheduler.notifyDirty());
    this.graph.setNodeRemovedListener(node => this.engine.detachNode(node));

    this.buildRoot(options.root);
    this.input = this.createInput();

    if (options.width !== undefined && options.height !== undefined) {
      this.resize(options.width, options.height, this.pixelRatio);
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
   * The root UiNode of the built tree.
   *
   * For tests and devtools that inspect the retained graph without
   * reaching into private state.
   */
  debugRoot(): UiNode {
    if (this.root === undefined) {
      throw new Error('App root has not been built.');
    }
    return this.root;
  }

  dispose(): void {
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
  private createInput(): RuntimeInput {
    const root = this.debugRoot();
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
    const started = now();
    this.graph.processEnvironmentDirty();
    this.engine.layoutForFrame(frame, this.constraints, root);
    this.canvasRenderer.render(root, { layout: this.engine, text: this.textMeasurer });
    const finished = now();
    const elapsed = finished - started;
    this.lastFrameMs = elapsed;
    this.frameListener?.({ frame: frame.id, durationMs: elapsed, nodes: frame.size, at: finished });
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
