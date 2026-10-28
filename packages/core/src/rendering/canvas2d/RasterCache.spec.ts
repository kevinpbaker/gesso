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
import { SETTLE_MS } from './RasterCache';

/** A recording context that keeps its transform, as a real one does: a kept subtree is placed by reading it. */
class TransformingContext extends RecordingCanvasContext {
  constructor() {
    super({ transform: true });
  }
}

interface FakeCanvas extends CanvasHost {
  readonly context: TransformingContext;
}

/**
 * Kept subtrees under a camera, asserted as what was drawn where: a
 * frame marked `rasterize` drawn into a canvas of its own once, and
 * copied while the board above it pans and zooms, until something in it
 * changes or the zoom settles at a scale it was not kept at.
 */
describe('kept subtrees (rasterize)', () => {
  let graph: UiGraph;
  let engine: LayoutEngine;
  let context: TransformingContext;
  let renderer: Canvas2DRenderer;
  let canvases: FakeCanvas[];
  let frameId: number;
  let root: UiNode;
  let board: UiNode;
  let frames: UiNode[];
  let swatches: UiNode[];
  const constraints = Constraints.tight(400, 300);

  function setup(options: { rasterCache?: boolean } = {}): void {
    graph = new UiGraph();
    engine = new LayoutEngine(new CharacterCountTextMeasurer());
    context = new TransformingContext();
    const surface = new CanvasSurface(new FakeCanvasHost(context));
    surface.setLogicalSize(400, 300, 1);
    canvases = [];
    renderer = new Canvas2DRenderer({
      surface,
      textCache: false,
      scrollLayers: false,
      rasterCache: options.rasterCache,
      createLayerCanvas: (width, height) => {
        const canvasContext = new TransformingContext();
        const canvas: FakeCanvas = {
          width,
          height,
          context: canvasContext,
          getContext: () => canvasContext as unknown as OffscreenCanvasRenderingContext2D
        };
        canvases.push(canvas);
        return canvas;
      }
    });
    frameId = 1;

    root = graph.createNode('app', UiNodeType.Column);
    board = graph.createNode('board', UiNodeType.Row);
    board.setProperty('gap', 100);
    graph.appendChild(root, board);
    frames = [];
    swatches = [];
    for (let i = 0; i < 2; i++) {
      const frame = graph.createNode(`frame${i}`, UiNodeType.Column);
      frame.setProperty('width', 100);
      frame.setProperty('height', 80);
      frame.setProperty('backgroundColor', '#ffffff');
      frame.setProperty('rasterize', true);
      graph.appendChild(board, frame);
      const swatch = graph.createNode(`swatch${i}`, UiNodeType.Box);
      swatch.setProperty('width', 40);
      swatch.setProperty('height', 20);
      swatch.setProperty('backgroundColor', '#ff0000');
      graph.appendChild(frame, swatch);
      frames.push(frame);
      swatches.push(swatch);
    }
    engine.layout(root, constraints);
    drain();
  }

  beforeEach(() => setup());

  /** A property write as a binding makes one: the value, and the dirt it implies. */
  function set(node: UiNode, property: string, value: unknown): void {
    node.setProperty(property, value);
    graph.markDirty(node, propertyEffects(property));
  }

  /** Where the camera is: the board moved and scaled about its corner. */
  function camera(scale: number, x = 0, y = 0): void {
    set(board, 'transform', { x: 0, y: 0, scaleX: scale, scaleY: scale, translateX: x, translateY: y });
  }

  function drain(): UiFrame {
    graph.processEnvironmentDirty();
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
    for (const canvas of canvases) {
      canvas.context.calls.length = 0;
    }
    renderer.render(root, {
      layout: engine,
      text: new CharacterCountTextMeasurer(),
      now: options.now ?? 0,
      changes: options.vouch === false ? undefined : { frame: collected, geometryVersion: engine.geometryVersion }
    });
  }

  /** Fills drawn into kept canvases on the last frame: a subtree drawn again. */
  const keptFills = () => canvases.reduce((count, canvas) => count + callsOf(canvas.context, 'fillRect').length, 0);
  const frameFills = () => callsOf(context, 'fillRect').length;
  const copies = () => callsOf(context, 'drawImage').length;

  it('draws each frame once, and copies it while the camera pans', () => {
    camera(1);
    frame();
    // Each frame's background and its swatch, into its own canvas.
    expect(keptFills()).toBe(4);
    expect(frameFills()).toBe(0);
    expect(copies()).toBe(2);
    for (let step = 1; step <= 5; step++) {
      camera(1, step * 7.25, step * 3);
      frame();
      expect(keptFills()).toBe(0);
      expect(frameFills()).toBe(0);
      expect(copies()).toBe(2);
    }
  });

  it('places a copy where the frame now is, on whole device pixels', () => {
    camera(1);
    frame();
    const [, x] = callArgs(context, 'drawImage')[0]!;
    camera(1, 30, 0);
    frame();
    const [, moved] = callArgs(context, 'drawImage')[0]!;
    expect((moved as number) - (x as number)).toBe(30);
    expect(Number.isInteger(moved)).toBe(true);
  });

  it('stretches what it kept while a zoom moves, and draws it sharp once the zoom settles', () => {
    camera(1);
    frame({ now: 0 });
    camera(1.5);
    frame({ now: 16 });
    // Stretched, not drawn again: half as large again.
    expect(keptFills()).toBe(0);
    const [, , , width] = callArgs(context, 'drawImage')[0]!;
    expect(width).toBeCloseTo(canvases[0]!.width * 1.5, 5);
    // Asked for the frame that sharpens it, when the zoom will have held.
    expect(renderer.nextRepaint()).toBe(16 + SETTLE_MS);
    // That frame, nothing else having changed: each drawn at 1.5.
    graph.markDirty(root, DirtyFlags.Paint);
    frame({ now: 16 + SETTLE_MS });
    expect(keptFills()).toBe(4);
    expect(renderer.nextRepaint()).toBeUndefined();
    expect(canvases[0]!.width).toBe(Math.ceil((100 + 4) * 1.5) + 1);
  });

  it('draws again at once when stretched past what still reads, if it is small enough to while the zoom moves', () => {
    camera(1);
    frame({ now: 0 });
    camera(0.3);
    frame({ now: 16 });
    expect(keptFills()).toBe(4);
  });

  it('draws directly what would be larger than the screen, where culling draws only what shows', () => {
    camera(1);
    frame();
    // 104 × 84 at 4 is more pixels than the 400 × 300 screen.
    camera(4);
    frame();
    expect(keptFills()).toBe(0);
    expect(frameFills()).toBeGreaterThan(0);
  });

  it('draws only the frame something changed in', () => {
    camera(1);
    frame();
    set(swatches[1]!, 'backgroundColor', '#00ff00');
    frame();
    expect(keptFills()).toBe(2);
    expect(copies()).toBe(2);
  });

  it('draws again when an ancestor changes what it passes down', () => {
    camera(1);
    frame();
    graph.markDirty(board, DirtyFlags.Properties);
    frame();
    expect(keptFills()).toBe(4);
  });

  it('draws everything again on a frame no one vouched for', () => {
    camera(1);
    frame();
    frame({ vouch: false });
    expect(keptFills()).toBe(4);
  });

  it('leaves a frame that changes on every frame to be drawn directly', () => {
    camera(1);
    frame();
    let direct = 0;
    for (let k = 0; k < 10; k++) {
      set(swatches[0]!, 'backgroundColor', `#0000${(k + 16).toString(16)}`);
      frame();
      direct += frameFills() > 0 ? 1 : 0;
    }
    expect(direct).toBeGreaterThan(0);
  });

  it('draws directly a frame too large to keep at the scale it is drawn at', () => {
    camera(100);
    frame();
    expect(keptFills()).toBe(0);
    expect(frameFills()).toBeGreaterThan(0);
  });

  it('with the cache off, draws every frame directly', () => {
    setup({ rasterCache: false });
    camera(1);
    frame();
    camera(1, 5, 0);
    frame();
    expect(canvases).toHaveLength(0);
    expect(frameFills()).toBe(4);
  });
});

describe('culling under a camera', () => {
  it('skips what a transform that only moves and scales takes off screen', () => {
    const graph = new UiGraph();
    const engine = new LayoutEngine(new CharacterCountTextMeasurer());
    const context = new TransformingContext();
    const surface = new CanvasSurface(new FakeCanvasHost(context));
    surface.setLogicalSize(400, 300, 1);
    const renderer = new Canvas2DRenderer({ surface, textCache: false, scrollLayers: false, rasterCache: false });
    const root = graph.createNode('app', UiNodeType.Column);
    const board = graph.createNode('board', UiNodeType.Row);
    board.setProperty('gap', 100);
    graph.appendChild(root, board);
    for (let i = 0; i < 4; i++) {
      const tile = graph.createNode(`tile${i}`, UiNodeType.Box);
      tile.setProperty('width', 100);
      tile.setProperty('height', 100);
      tile.setProperty('flexShrink', 0);
      tile.setProperty('backgroundColor', '#ff0000');
      graph.appendChild(board, tile);
    }
    const constraints = Constraints.tight(400, 300);
    const draw = (transform: Record<string, number>) => {
      board.setProperty('transform', transform);
      engine.layout(root, constraints);
      context.calls.length = 0;
      renderer.render(root, { layout: engine, text: new CharacterCountTextMeasurer() });
      return callsOf(context, 'fillRect').length;
    };
    // Tiles at 0, 200, 400 and 600: zoomed in twice on the first, only it shows.
    expect(draw({ x: 0, y: 0, scaleX: 2, scaleY: 2 })).toBe(1);
    // Panned so the third and fourth are on screen.
    expect(draw({ x: 0, y: 0, scaleX: 1, scaleY: 1, translateX: -400 })).toBe(2);
    // Zoomed out, all four.
    expect(draw({ x: 0, y: 0, scaleX: 0.5, scaleY: 0.5 })).toBe(4);
    // Turned: culling stops below it, so all four are drawn.
    expect(draw({ x: 0, y: 0, scaleX: 2, scaleY: 2, rotation: 0.1 })).toBe(4);
  });
});
