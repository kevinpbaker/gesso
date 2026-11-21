import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DirtyFlags } from '../graph/DirtyFlags';
import { UiGraph } from '../graph/UiGraph';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { LayoutEngine } from '../layout/LayoutEngine';
import type { LayoutRecord } from '../layout/LayoutRecord';
import { Constraints } from '../layout/LayoutTypes';
import { CharacterCountTextMeasurer } from '../layout/TextMeasurer';
import { propertyEffects } from '../properties/UiPropertyRegistry';
import { UiFrame } from '../scheduler/UiFrame';
import { Canvas2DRenderer } from './canvas2d/Canvas2DRenderer';
import { CanvasSurface } from './canvas2d/CanvasSurface';
import { PaintPictureCache, PICTURE_SETTLE_MS, paintPictures, pictureScale } from './PaintPicture';
import type { PaintSurface, UiPaint } from './PaintSurface';
import type { PaintContext2D } from './PaintTarget';
import { callArgs, callsOf, FakeCanvasHost, FakePaintCanvases, RecordingCanvasContext } from './RenderTestUtils';

/** A line across the box: enough to see where and how often a painter ran. */
const LINE: UiPaint = {
  draw(surface: PaintSurface, box) {
    surface.beginPath();
    surface.moveTo(0, 0);
    surface.lineTo(box.width, box.height);
    surface.strokeColor('#000000');
    surface.lineWidth(1);
    surface.stroke();
  },
  inputs: []
};

/**
 * Painted nodes under a zoom, asserted as the bitmaps made and where
 * they were drawn: a picture is made at the scale it lands at, the
 * device's times the zoom, so a worksheet zoomed to 300% on a 2x
 * display is as sharp as at 100%; a moving zoom stretches what it has
 * until the zoom holds; a picture too large to keep at its zoom is
 * replayed; and the zoomed bitmaps together are held to a budget.
 */
describe('painted pictures under a zoom', () => {
  let canvases: FakePaintCanvases;
  let graph: UiGraph;
  let engine: LayoutEngine;
  let context: RecordingCanvasContext;
  let renderer: Canvas2DRenderer;
  let frameId: number;
  let root: UiNode;
  let board: UiNode;
  let picture: UiNode;
  const constraints = Constraints.tight(400, 300);

  beforeEach(() => {
    canvases = new FakePaintCanvases();
    paintPictures.setCanvasFactory(canvases.create);
    paintPictures.resetStats();
    graph = new UiGraph();
    engine = new LayoutEngine(new CharacterCountTextMeasurer());
    context = new RecordingCanvasContext({ transform: true });
    const surface = new CanvasSurface(new FakeCanvasHost(context));
    surface.setLogicalSize(400, 300, 2);
    renderer = new Canvas2DRenderer({ surface, textCache: false, scrollLayers: false });
    frameId = 1;
    root = graph.createNode('app', UiNodeType.Column);
    board = graph.createNode('board', UiNodeType.Column);
    graph.appendChild(root, board);
    picture = graph.createNode('picture', UiNodeType.Paint);
    picture.setProperty('width', 120);
    picture.setProperty('height', 24);
    picture.setProperty('paint', LINE);
    graph.appendChild(board, picture);
    engine.layout(root, constraints);
    drain();
  });

  afterEach(() => {
    paintPictures.setCanvasFactory(() => null);
  });

  function set(node: UiNode, property: string, value: unknown): void {
    node.setProperty(property, value);
    graph.markDirty(node, propertyEffects(property));
  }

  /** The paper zoomed about its corner, as Calcwright zooms a worksheet. */
  function zoom(scale: number): void {
    set(board, 'transform', { x: 0, y: 0, scaleX: scale, scaleY: scale });
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

  function frame(now = 0): void {
    const collected = drain();
    engine.layoutForFrame(collected, constraints, root);
    context.calls.length = 0;
    renderer.render(root, {
      layout: engine,
      text: new CharacterCountTextMeasurer(),
      now,
      changes: { frame: collected, geometryVersion: engine.geometryVersion }
    });
  }

  const lastBitmap = () => canvases.bitmaps.at(-1)!;

  it('makes a picture at the device scale at 100%, and draws it into its box as before', () => {
    frame();
    expect(canvases.bitmaps).toHaveLength(1);
    expect(lastBitmap()).toMatchObject({ width: 240, height: 48 });
    const [draw] = callsOf(context, 'drawImage');
    expect(draw!.args.slice(1)).toEqual([0, 0, 120, 24]);
  });

  it('makes a zoomed picture at the zoom times the device scale, and copies it one pixel to one', () => {
    zoom(3);
    frame();
    expect(canvases.bitmaps).toHaveLength(1);
    expect(lastBitmap()).toMatchObject({ width: 720, height: 144 });
    // Onto whole device pixels at its own size: no resampling to blur it.
    const [draw] = callsOf(context, 'drawImage');
    expect(draw!.args.slice(1)).toEqual([0, 0, 720, 144]);
  });

  it('stretches the bitmap it has while the zoom moves, and makes it sharp once the zoom holds', () => {
    frame();
    expect(canvases.bitmaps).toHaveLength(1);

    zoom(1.5);
    frame(0);
    zoom(2);
    frame(50);
    // Every step of the zoom is the one bitmap, stretched into the box.
    expect(canvases.bitmaps).toHaveLength(1);
    expect(paintPictures.stats.recorded).toBe(1);
    expect(callArgs(context, 'drawImage').at(-1)!.slice(1)).toEqual([0, 0, 120, 24]);
    // And the renderer asks for the frame on which the zoom will have held.
    expect(renderer.nextRepaint()).toBe(50 + PICTURE_SETTLE_MS);

    frame(50 + PICTURE_SETTLE_MS - 1);
    expect(canvases.bitmaps).toHaveLength(1);

    frame(50 + PICTURE_SETTLE_MS);
    expect(canvases.bitmaps).toHaveLength(2);
    expect(lastBitmap()).toMatchObject({ width: 480, height: 96 });
    expect(canvases.bitmaps[0]!.closed).toBe(true);
    expect(paintPictures.stats.resharpened).toBe(1);
    expect(renderer.nextRepaint()).toBeUndefined();
  });

  it('makes a picture that changes during a zoom at the scale it lands at, without waiting', () => {
    frame();
    zoom(2);
    set(picture, 'width', 140);
    frame(0);
    expect(lastBitmap()).toMatchObject({ width: 560, height: 96 });
  });

  it('replays a picture too large to keep at its zoom, and keeps no bitmap of it', () => {
    set(picture, 'width', 400);
    set(picture, 'height', 300);
    zoom(3);
    frame();
    // 2400 x 1800 device pixels is larger than the surface itself.
    expect(canvases.bitmaps).toHaveLength(0);
    expect(paintPictures.stats.replayed).toBe(1);
    expect(callsOf(context, 'stroke')).toHaveLength(1);

    // Drawn again: a frame with nothing changed draws nothing at all.
    graph.markDirty(picture, DirtyFlags.Paint);
    frame();
    expect(canvases.bitmaps).toHaveLength(0);
    expect(paintPictures.stats.replayed).toBe(2);
    expect(paintPictures.stats.recorded).toBe(1);
  });

  it('makes a picture smaller than the device scale when zoomed out', () => {
    zoom(0.5);
    frame();
    expect(lastBitmap()).toMatchObject({ width: 120, height: 24 });
  });
});

describe('the zoomed picture budget', () => {
  const graph = new UiGraph();
  let canvases: FakePaintCanvases;
  let cache: PaintPictureCache;

  /** A frame's context at six device pixels to the logical one: 300% on a 2x display. */
  const frameContext = {
    getTransform: () => ({ a: 6, b: 0, c: 0, d: 6, e: 0, f: 0 }),
    setTransform: () => {},
    save: () => {},
    restore: () => {},
    drawImage: () => {}
  } as unknown as PaintContext2D;

  function painted(id: string): { node: UiNode; rec: LayoutRecord } {
    const node = graph.createNode(id, UiNodeType.Paint);
    node.setProperty('paint', LINE);
    // 300 x 300 at 6x: 3.24 million pixels, just under what one zoomed picture may hold.
    const rec = {
      x: 0,
      y: 0,
      width: 300,
      height: 300,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0
    } as unknown as LayoutRecord;
    return { node, rec };
  }

  /** A surface of four million pixels: the budget is its floor, 8.4 million. */
  const SURFACE = 4_000_000;

  function drawFrame(...pictures: { node: UiNode; rec: LayoutRecord }[]): void {
    cache.beginFrame(SURFACE);
    for (const { node, rec } of pictures) {
      cache.draw(node, rec, 2, frameContext, 0, true);
    }
    cache.endFrame();
  }

  beforeEach(() => {
    canvases = new FakePaintCanvases();
    cache = new PaintPictureCache(canvases.create);
  });

  it('lets go of the zoomed bitmaps drawn longest ago once they hold more than the budget', () => {
    const a = painted('a');
    const b = painted('b');
    const c = painted('c');
    const d = painted('d');
    drawFrame(a, b);
    expect(cache.zoomedMemory).toEqual({ pictures: 2, pixels: 2 * 1800 * 1800 });

    // Scrolled on: two more, and the four are past the budget, so the two
    // not drawn on this frame go.
    drawFrame(c, d);
    expect(cache.zoomedMemory).toEqual({ pictures: 2, pixels: 2 * 1800 * 1800 });
    expect(canvases.bitmaps.map(bitmap => bitmap.closed)).toEqual([true, true, false, false]);

    // Scrolled back: made again from the recording, without the painter.
    drawFrame(a);
    expect(canvases.bitmaps).toHaveLength(5);
    expect(cache.stats.recorded).toBe(4);
  });

  it('never counts a bitmap at the device scale against it', () => {
    const atDevice = { ...frameContext, getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }) };
    const e = painted('e');
    cache.beginFrame(SURFACE);
    cache.draw(e.node, e.rec, 2, atDevice as unknown as PaintContext2D);
    cache.endFrame();
    expect(cache.zoomedMemory).toEqual({ pictures: 0, pixels: 0 });
  });
});

describe('pictureScale', () => {
  it('is the device scale when nothing else scales the picture', () => {
    expect(pictureScale({ a: 2.625, b: 0, c: 0, d: 2.625 }, 2.625)).toBe(2.625);
  });

  it('is the device scale times the zoom, to a 256th, so a zoom is one scale and not a rounding error', () => {
    expect(pictureScale({ a: 1.1 * 2, b: 0, c: 0, d: 1.1 * 2 }, 2)).toBe(Math.round(2.2 * 256) / 256);
  });

  it('is the larger axis of a rotated or stretched transform', () => {
    expect(pictureScale({ a: 0, b: 3, c: -3, d: 0 }, 1)).toBe(3);
    expect(pictureScale({ a: 2, b: 0, c: 0, d: 4 }, 1)).toBe(4);
  });
});
