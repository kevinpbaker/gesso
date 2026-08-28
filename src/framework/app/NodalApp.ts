import type { FrameworkChild } from '../ComponentElement';
import { ComponentHostResolver } from '../ComponentHostResolver';
import { UiGraph } from '../../ui/graph/UiGraph';
import { UiGraphBuilder } from '../../ui/composition/UiGraphBuilder';
import { isComponentLikeElement, isObservable, type UiElement } from '../../ui/composition/UiElement';
import type { UiNode } from '../../ui/graph/UiNode';
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
    this.builder = new UiGraphBuilder(this.graph, { components: this.resolver });
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
    this.applySize();
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
    this.graph.setDirtyListener(null);
    this.graph.setNodeRemovedListener(null);
    this.resolver.dispose();
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
      const { width, height } = entry.contentRect;
      this.canvas.width = width;
      this.canvas.height = height;
      this.applySize();
    });
    this.resizeObserver.observe(this.host);
  }

  private applySize(): void {
    const width = this.canvas.width || this.host.clientWidth || 600;
    const height = this.canvas.height || this.host.clientHeight || 600;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.surface.setLogicalSize(width, height, dpr);
    this.constraints = Constraints.loose(width, height);
    if (this.root !== undefined) {
      this.engine.layout(this.root, this.constraints);
    }
  }
}
