import type { FrameworkChild } from '../ComponentRenderer';
import { ComponentRenderer } from '../ComponentRenderer';
import { UiGraph } from '../../ui/graph/UiGraph';
import { UiGraphBuilder } from '../../ui/composition/UiGraphBuilder';
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
  private readonly renderer: ComponentRenderer;
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
    this.builder = new UiGraphBuilder(this.graph);
    this.renderer = new ComponentRenderer(this.stores);
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
  }

  private createCanvas(): HTMLCanvasElement {
    return document.createElement('canvas');
  }

  private buildRoot(rootDefinition: FrameworkChild): void {
    const definition = this.renderer.render(rootDefinition);
    this.root = this.builder.build(definition);
    this.graph.propagateEnvironment(this.root);
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
