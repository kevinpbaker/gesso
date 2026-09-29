import { beforeEach, describe, expect, it } from 'vitest';

import { DirtyFlags } from '../../graph/DirtyFlags';
import { UiGraph } from '../../graph/UiGraph';
import { UiNodeType } from '../../graph/UiNodeType';
import type { UiNode } from '../../graph/UiNode';
import { LayoutEngine } from '../../layout/LayoutEngine';
import { Constraints } from '../../layout/LayoutTypes';
import { CharacterCountTextMeasurer } from '../../layout/TextMeasurer';
import { propertyEffects } from '../../properties/UiPropertyRegistry';
import { UiFrame } from '../../scheduler/UiFrame';
import { callArgs, callsOf, FakeCanvasHost, RecordingCanvasContext } from '../RenderTestUtils';
import { Canvas2DRenderer } from './Canvas2DRenderer';
import { CanvasSurface } from './CanvasSurface';
import type { CanvasHost } from './CanvasSurface';

/**
 * A recording context that also keeps its transform, as a real one
 * does. Scroll layers are placed by reading it, and the shared double
 * has none, which is what keeps every other spec on the direct path.
 */
class TransformingContext extends RecordingCanvasContext {
  private matrix = [1, 0, 0, 1, 0, 0];
  private readonly stack: number[][] = [];

  override save(): void {
    this.stack.push([...this.matrix]);
    super.save();
  }

  override restore(): void {
    this.matrix = this.stack.pop() ?? this.matrix;
    super.restore();
  }

  override setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.matrix = [a, b, c, d, e, f];
    super.setTransform(a, b, c, d, e, f);
  }

  override translate(x: number, y: number): void {
    const [a, b, c, d, e, f] = this.matrix;
    this.matrix = [a, b, c, d, e + a * x + c * y, f + b * x + d * y];
    super.translate(x, y);
  }

  override scale(x: number, y: number): void {
    const [a, b, c, d, e, f] = this.matrix;
    this.matrix = [a * x, b * x, c * y, d * y, e, f];
    super.scale(x, y);
  }

  override rotate(angle: number): void {
    const [a, b, c, d, e, f] = this.matrix;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.matrix = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f];
    super.rotate(angle);
  }

  getTransform(): { a: number; b: number; c: number; d: number; e: number; f: number } {
    const [a, b, c, d, e, f] = this.matrix;
    return { a, b, c, d, e, f };
  }
}

interface FakeLayer extends CanvasHost {
  readonly context: TransformingContext;
}

/**
 * Scroll layer behaviour, asserted as counts of layers built, shifted
 * and dropped and of what was drawn where — never as time. The two
 * questions that matter: does a frame that only scrolled paint only
 * the strip it exposed, and does every other frame fall back to a
 * direct draw, which is always right.
 */
describe('scroll layers', () => {
  const ROWS = 12;
  const ROW = 30;
  let graph: UiGraph;
  let engine: LayoutEngine;
  let context: TransformingContext;
  let surface: CanvasSurface;
  let renderer: Canvas2DRenderer;
  let layers: FakeLayer[];
  let frameId: number;
  let root: UiNode;
  let scroll: UiNode;
  let rows: UiNode[];
  const constraints = Constraints.tight(400, 300);

  function setup(options: { dpr?: number; scrollLayers?: boolean; left?: number } = {}): void {
    graph = new UiGraph();
    const measurer = new CharacterCountTextMeasurer();
    engine = new LayoutEngine(measurer);
    context = new TransformingContext();
    surface = new CanvasSurface(new FakeCanvasHost(context));
    surface.setLogicalSize(400, 300, options.dpr ?? 1);
    layers = [];
    renderer = new Canvas2DRenderer({
      surface,
      scrollLayers: options.scrollLayers,
      createLayerCanvas: (width, height) => {
        const layerContext = new TransformingContext();
        const layer: FakeLayer = {
          width,
          height,
          context: layerContext,
          getContext: () => layerContext as unknown as OffscreenCanvasRenderingContext2D
        };
        layers.push(layer);
        return layer;
      }
    });
    frameId = 1;

    root = graph.createNode('app', UiNodeType.Column);
    root.setProperty('padding', options.left ?? 0);
    scroll = graph.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 100);
    scroll.setProperty('backgroundColor', '#fff');
    graph.appendChild(root, scroll);
    rows = [];
    for (let i = 0; i < ROWS; i++) {
      const row = graph.createNode(`row${i}`, UiNodeType.Box);
      row.setProperty('height', ROW);
      row.setProperty('flexShrink', 0);
      row.setProperty('backgroundColor', `#${(i + 1).toString(16).padStart(6, '0')}`);
      graph.appendChild(scroll, row);
      rows.push(row);
    }
    engine.layout(root, constraints);
    drain();
  }

  /** A property write as a binding makes one: the value, and the dirt it implies. */
  function set(node: UiNode, property: string, value: unknown): void {
    node.setProperty(property, value);
    graph.markDirty(node, propertyEffects(property));
  }

  function drain(): UiFrame {
    const dirty = new Map<UiNode, DirtyFlags>();
    for (const node of graph.getDirtyNodes().take()) {
      dirty.set(node, node.dirtyFlags);
      node.dirtyFlags = DirtyFlags.None;
    }
    return new UiFrame(frameId++, 0, dirty);
  }

  /** One runtime frame: collect, lay out, draw with the changes. */
  function frame(options: { vouch?: boolean; now?: number } = {}): void {
    const collected = drain();
    engine.layoutForFrame(collected, constraints, root);
    context.calls.length = 0;
    for (const layer of layers) {
      layer.context.calls.length = 0;
    }
    renderer.resetScrollLayerStats();
    renderer.render(root, {
      layout: engine,
      text: new CharacterCountTextMeasurer(),
      now: options.now ?? Number.MAX_SAFE_INTEGER,
      changes: options.vouch === false ? undefined : { frame: collected, geometryVersion: engine.geometryVersion }
    });
  }

  function scrollTo(y: number): void {
    set(scroll, 'scrollY', y);
    frame();
  }

  /** Row fills drawn straight onto the frame, the background excluded. */
  function directRowFills(): unknown[][] {
    return callArgs(context, 'fillRect').filter(args => (args as number[])[2] === 200 && (args as number[])[3] === ROW);
  }

  function composites(): unknown[][] {
    return callArgs(context, 'drawImage').filter(args => layers.some(layer => layer === args[0]));
  }

  beforeEach(() => setup());

  it('draws directly until a container scrolls, then builds one layer and copies it onto the frame', () => {
    frame();
    expect(renderer.scrollLayerStats.built).toBe(0);
    expect(directRowFills().length).toBe(4);

    scrollTo(10);
    expect(renderer.scrollLayerStats.built).toBe(1);
    expect(layers.length).toBe(2);
    expect(directRowFills()).toEqual([]);
    expect(composites()).toEqual([[layers[0], 0, 0, 200, 100]]);
    // Rows 0..3 cover 10..110 of the content; the layer drew all four.
    expect(callsOf(layers[0].context, 'fillRect').length).toBe(4);
  });

  it('on a frame that only scrolled, shifts the pixels and paints only the strip that came into view', () => {
    scrollTo(10);
    scrollTo(25);

    const stats = renderer.scrollLayerStats;
    expect(stats.built).toBe(0);
    expect(stats.shifted).toBe(1);
    expect(stats.composited).toBe(1);
    expect(directRowFills()).toEqual([]);
    // The copy went into the other canvas, moved up by the 15 pixels
    // scrolled, and that canvas is now the one on the frame.
    const [shifted] = callArgs(layers[1].context, 'drawImage');
    expect(shifted).toEqual([layers[0], 0, -15, 200, 100]);
    expect(composites()).toEqual([[layers[1], 0, 0, 200, 100]]);
    // Only the bottom 15 pixels are painted, clipped rather than culled.
    expect(callArgs(layers[1].context, 'rect')).toEqual([[0, 85, 200, 15]]);
    expect(callArgs(layers[1].context, 'clip').length).toBe(1);
  });

  it('reuses the layer untouched on a frame that changed something beside it', () => {
    const other = graph.createNode('other', UiNodeType.Box);
    set(other, 'height', 20);
    set(other, 'backgroundColor', '#f00');
    graph.appendChild(root, other);
    frame();
    scrollTo(10);

    set(other, 'backgroundColor', '#0f0');
    frame();

    expect(renderer.scrollLayerStats.built).toBe(0);
    expect(renderer.scrollLayerStats.dropped).toBe(0);
    expect(composites().length).toBe(1);
    expect(layers.flatMap(layer => layer.context.calls)).toEqual([]);
    expect(directRowFills()).toEqual([]);
  });

  it('drops the layer and draws directly when something inside the container changes', () => {
    scrollTo(10);
    set(rows[1], 'backgroundColor', '#abcdef');
    frame();

    expect(renderer.scrollLayerStats.dropped).toBe(1);
    expect(composites()).toEqual([]);
    expect(directRowFills().length).toBe(4);
  });

  it('drops the layer when an ancestor is dirtied, since inherited paint reaches the subtree without dirtying it', () => {
    scrollTo(10);
    graph.markDirty(root, DirtyFlags.Paint);
    frame();

    expect(renderer.scrollLayerStats.dropped).toBe(1);
    expect(directRowFills().length).toBe(4);
  });

  it('drops the layer when layout moves anything', () => {
    scrollTo(10);
    set(root, 'padding', 5);
    frame();

    expect(renderer.scrollLayerStats.dropped).toBe(1);
    expect(directRowFills().length).toBe(4);
  });

  it('drops the layer for a scroll that is not a whole number of device pixels', () => {
    scrollTo(10);
    scrollTo(12.5);

    expect(renderer.scrollLayerStats.dropped).toBe(1);
    expect(composites()).toEqual([]);
    expect(directRowFills().length).toBe(4);
  });

  it('follows a scroll that floating point made nearly whole, and keeps the pixels true to the whole one', () => {
    scrollTo(10);
    scrollTo(20.0000000001);

    expect(renderer.scrollLayerStats.shifted).toBe(1);
    // The strip is drawn at the offset the copied pixels show, 20, so
    // the two meet on a pixel boundary.
    const translates = callArgs(layers[1].context, 'translate');
    expect(translates[0]).toEqual([0, -20]);
  });

  it('repaints the whole layer when a scroll moves further than the viewport', () => {
    scrollTo(10);
    scrollTo(200);

    expect(renderer.scrollLayerStats.dropped).toBe(0);
    expect(callArgs(layers[0].context, 'clearRect')).toEqual([[0, 0, 200, 100]]);
    expect(callArgs(layers[0].context, 'rect')).toEqual([[0, 0, 200, 100]]);
    expect(composites()).toEqual([[layers[0], 0, 0, 200, 100]]);
  });

  it('builds nothing on a frame the caller does not vouch for', () => {
    set(scroll, 'scrollY', 10);
    frame({ vouch: false });
    expect(renderer.scrollLayerStats.built).toBe(0);
    expect(directRowFills().length).toBe(4);

    scrollTo(20);
    set(scroll, 'scrollY', 30);
    frame({ vouch: false });
    expect(renderer.scrollLayerStats.dropped).toBe(1);
    expect(directRowFills().length).toBe(4);
  });

  it('builds nothing when scroll layers are turned off', () => {
    setup({ scrollLayers: false });
    scrollTo(10);
    scrollTo(20);
    expect(renderer.scrollLayerStats.built).toBe(0);
    expect(layers).toEqual([]);
    expect(directRowFills().length).toBe(4);
  });

  it('drops every layer after a frame that threw part way through one', () => {
    scrollTo(10);
    const back = layers[1].context;
    back.fillRect = () => {
      throw new Error('painter failed');
    };
    expect(() => scrollTo(20)).toThrow('painter failed');
    delete (back as Partial<TransformingContext>).fillRect;

    frame();
    expect(composites()).toEqual([]);
    expect(directRowFills().length).toBe(4);
  });

  it('drops the layer on resize', () => {
    scrollTo(10);
    renderer.resize(400, 280, 1);
    frame();
    expect(composites()).toEqual([]);
    expect(directRowFills().length).toBe(4);
  });

  it('drops a layer whose container stopped being drawn', () => {
    scrollTo(10);
    set(scroll, 'visible', false);
    frame();
    expect(renderer.scrollLayerStats.dropped).toBe(1);
    expect(layers[0].width).toBe(0);
  });

  it('places the layer on whole device pixels and draws into it at the fraction the frame would have', () => {
    setup({ dpr: 2, left: 10.25 });
    scrollTo(10);

    // 10.25 logical is 20.5 device pixels: the layer starts on pixel 20
    // and spans the 400.5 the viewport touches, rounded out to 401.
    expect(composites()).toEqual([[layers[0], 20, 20, 401, 201]]);
    expect(callArgs(layers[0].context, 'setTransform')[0]).toEqual([2, 0, 0, 2, -20, -20]);

    scrollTo(15);
    // Five logical pixels are ten device pixels.
    expect(callArgs(layers[1].context, 'drawImage')[0]).toEqual([layers[0], 0, -10, 401, 201]);
    expect(callArgs(layers[1].context, 'rect')).toEqual([[0, 191, 401, 10]]);
  });

  it('draws directly under a scale, where a copy would be resampled', () => {
    set(root, 'transform', { scaleX: 1.5, scaleY: 1.5 });
    engine.layout(root, constraints);
    drain();
    scrollTo(10);
    expect(renderer.scrollLayerStats.built).toBe(0);
    expect(composites()).toEqual([]);
    // Every row: the direct path does not cull under a transform.
    expect(directRowFills().length).toBe(ROWS);
  });

  it('does not keep a layer that drew something following the clock, and does not rebuild it until the subtree changes', () => {
    // A nested scroll container whose scrollbar is still fading.
    const inner = graph.createNode('inner', UiNodeType.ScrollView);
    set(inner, 'height', 20);
    set(inner, 'flexShrink', 0);
    const tall = graph.createNode('tall', UiNodeType.Box);
    set(tall, 'height', 80);
    set(tall, 'flexShrink', 0);
    graph.appendChild(inner, tall);
    graph.insertBefore(scroll, inner, rows[0]);
    frame();
    set(inner, 'scrollY', 5);
    frame({ now: 0 });

    set(scroll, 'scrollY', 10);
    frame({ now: 0 });
    expect(renderer.scrollLayerStats.built).toBe(1);
    // The outer layer, refused for the fading scrollbar it holds, and
    // the inner one's own from the frame it scrolled, which is not made
    // inside another layer's walk and so went unused.
    expect(renderer.scrollLayerStats.dropped).toBe(2);

    set(scroll, 'scrollY', 20);
    frame({ now: 0 });
    expect(renderer.scrollLayerStats.built).toBe(0);

    // The scrollbar has faded, and the runtime's fade timer marked the
    // root: the refusal is lifted and the next scroll builds again.
    graph.markDirty(root, DirtyFlags.Paint);
    frame();
    scrollTo(30);
    expect(renderer.scrollLayerStats.built).toBe(1);
    expect(renderer.scrollLayerStats.dropped).toBe(0);
  });
});
