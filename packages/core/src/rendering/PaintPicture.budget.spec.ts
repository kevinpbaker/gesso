import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { Constraints } from '../layout/LayoutTypes';
import { paintPictures } from './PaintPicture';
import type { PaintSurface, UiPaint } from './PaintSurface';
import { callsOf, FakePaintCanvases, RenderHarness } from './RenderTestUtils';
import { buildRenderList, CommandKind } from './webgpu/WebGPURenderData';

/**
 * Paint budgets, in the shape `LayoutEngine.budget.spec.ts` set.
 *
 * The whole risk here
 * is a drawing hook that quietly repaints every frame and undoes what
 * the scheduler earned. The numbers here are the hard budget for that:
 * counts of painter runs, rasterisations and draw calls, not wall
 * time. A frame that draws twenty painted nodes whose inputs did not
 * move must make twenty draw calls and run no painter at all; a picture
 * that changes every frame must not be rasterised into a bitmap at all,
 * and one seen for the first time must be rasterised once, not twice.
 */
describe('paint budgets', () => {
  const NODES = 20;
  const VIEWPORT = Constraints.tight(800, 600);

  let canvases: FakePaintCanvases;
  let h: RenderHarness;

  beforeEach(() => {
    canvases = new FakePaintCanvases();
    paintPictures.setCanvasFactory(canvases.create);
    paintPictures.resetStats();
    h = new RenderHarness();
  });

  afterEach(() => {
    // The cache is module level so both backends reach the same one;
    // leaving a spec's double installed would follow it into the next
    // file in the worker.
    paintPictures.setCanvasFactory(() => null);
  });

  /** A painter whose drawing depends on one number. */
  function sparkline(value: number): UiPaint {
    return {
      draw(surface: PaintSurface, box) {
        surface.beginPath();
        surface.moveTo(0, box.height);
        surface.lineTo(box.width * value, 0);
        surface.strokeColor('#0088ff');
        surface.lineWidth(1);
        surface.stroke();
      },
      inputs: [value]
    };
  }

  function buildTree(): { root: UiNode; painted: UiNode[] } {
    const root = h.createNode('app', UiNodeType.Column);
    const painted: UiNode[] = [];
    for (let i = 0; i < NODES; i++) {
      const node = h.createNode(`spark${i}`, UiNodeType.Paint);
      node.setProperty('width', 120);
      node.setProperty('height', 24);
      node.setProperty('paint', sparkline(i / NODES));
      painted.push(node);
      h.append(root, node);
    }
    h.layout(root, VIEWPORT);
    return { root, painted };
  }

  it('paints and rasterises each node once on the first frame, and never again while it holds still', () => {
    const { root } = buildTree();
    h.render(root);
    // A node seen for the first time most likely holds still, so its
    // bitmap is made at once rather than replayed and rasterised later.
    expect(paintPictures.stats.recorded).toBe(NODES);
    expect(paintPictures.stats.rasterized).toBe(NODES);
    expect(paintPictures.stats.direct).toBe(0);
    expect(callsOf(h.context, 'drawImage').length).toBe(NODES);

    paintPictures.resetStats();
    h.context.calls.length = 0;
    for (let frame = 0; frame < 5; frame++) {
      h.render(root);
    }
    // Five more frames of the same tree: five draw calls per node and
    // not one painter run or rasterisation between them.
    expect(paintPictures.stats.recorded).toBe(0);
    expect(paintPictures.stats.rasterized).toBe(0);
    expect(paintPictures.stats.direct).toBe(0);
    expect(canvases.contexts.length).toBe(NODES);
    expect(callsOf(h.context, 'drawImage').length).toBe(NODES * 5);
  });

  it('rasterises a resized node at once rather than replaying it', () => {
    const { root, painted } = buildTree();
    h.render(root);
    paintPictures.resetStats();

    painted[3].setProperty('width', 140);
    h.layout(root, VIEWPORT);
    h.render(root);

    expect(paintPictures.stats.recorded).toBe(1);
    expect(paintPictures.stats.rasterized).toBe(1);
    expect(paintPictures.stats.direct).toBe(0);
  });

  it('repaints only the node whose inputs changed, and draws that one straight onto the frame', () => {
    const { root, painted } = buildTree();
    h.render(root);
    paintPictures.resetStats();

    painted[7].setProperty('paint', sparkline(0.99));
    h.render(root);

    expect(paintPictures.stats.recorded).toBe(1);
    expect(paintPictures.stats.direct).toBe(1);
    expect(paintPictures.stats.rasterized).toBe(0);
    expect(paintPictures.stats.resolved).toBe(NODES);
  });

  it('replays a changed picture in the box its bitmap would fill, clipped to it', () => {
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('padding', 10);
    const node = h.createNode('spark', UiNodeType.Paint);
    node.setProperty('width', 120);
    node.setProperty('height', 24);
    node.setProperty('paint', sparkline(0.5));
    h.append(root, node);
    h.layout(root, VIEWPORT);
    h.render(root);

    node.setProperty('paint', sparkline(0.75));
    h.context.calls.length = 0;
    h.render(root);
    const names = h.context.calls.map(call => call.name);
    const start = names.indexOf('translate');
    // Moved to the box's corner, clipped to its size, then the painter's
    // own calls in its own coordinates, and restored.
    expect(h.context.calls[start]!.args).toEqual([10, 10]);
    expect(names.slice(start + 1, start + 4)).toEqual(['beginPath', 'rect', 'clip']);
    expect(h.context.calls[start + 2]!.args).toEqual([0, 0, 120, 24]);
    expect(names.slice(start + 4, start + 7)).toEqual(['beginPath', 'moveTo', 'lineTo']);
    expect(names).toContain('restore');
    expect(callsOf(h.context, 'drawImage')).toEqual([]);

    // And once it has settled, the bitmap in the same box.
    for (let frame = 0; frame < 3; frame++) h.render(root);
    h.context.calls.length = 0;
    h.render(root);
    expect(callsOf(h.context, 'drawImage').map(call => call.args.slice(1))).toEqual([[10, 10, 120, 24]]);
  });

  it('hands the second backend the pictures the first settled on, without repainting them', () => {
    const { root } = buildTree();
    h.render(root);
    const drawn = callsOf(h.context, 'drawImage').map(call => call.args[0]);
    paintPictures.resetStats();

    const list = buildRenderList(root, h.engine, h.measurer, 800, 600, 1, Number.MAX_SAFE_INTEGER);
    const images = list.commands.filter(command => command.kind === CommandKind.Image);

    expect(images.length).toBe(NODES);
    // The same bitmap objects, in the same order. This is the parity
    // claim at its narrowest: there is one picture per painted node in
    // the process, so the two backends cannot draw different ones.
    expect(images.map(command => command.source)).toEqual(drawn);
    expect(paintPictures.stats.recorded).toBe(0);
    expect(paintPictures.stats.rasterized).toBe(0);
  });

  it('rasterises for WebGPU from the recording Canvas2D replayed, and Canvas2D then draws that bitmap', () => {
    const { root, painted } = buildTree();
    h.render(root);
    painted.forEach((node, i) => node.setProperty('paint', sparkline((i + 0.5) / NODES)));
    h.render(root);
    expect(paintPictures.stats.direct).toBe(NODES);
    paintPictures.resetStats();

    // WebGPU asks before Canvas2D has settled: the pictures are made from
    // the recordings already held, not painted again.
    const list = buildRenderList(root, h.engine, h.measurer, 800, 600, 1, Number.MAX_SAFE_INTEGER);
    const images = list.commands.filter(command => command.kind === CommandKind.Image);
    expect(paintPictures.stats.recorded).toBe(0);
    expect(paintPictures.stats.rasterized).toBe(NODES);

    // And Canvas2D's next frame draws the same bitmaps, making none.
    paintPictures.resetStats();
    h.context.calls.length = 0;
    h.render(root);
    expect(paintPictures.stats.rasterized).toBe(0);
    expect(callsOf(h.context, 'drawImage').map(call => call.args[0])).toEqual(images.map(command => command.source));
  });

  it('makes no bitmap for a picture that changes every frame, and releases the one it had', () => {
    const { root, painted } = buildTree();
    h.render(root);
    expect(canvases.bitmaps.length).toBe(NODES);

    for (let i = 0; i < 10; i++) {
      painted[0].setProperty('paint', sparkline(i / 10));
      h.render(root);
    }
    // Ten frames of a picture that moved every frame: ten replays and not
    // one bitmap, where the cache used to make and discard ten. The
    // bitmap it had before it started moving has been released.
    expect(canvases.bitmaps.length).toBe(NODES);
    expect(canvases.bitmaps.filter(bitmap => bitmap.closed).length).toBe(1);

    // Held still, it gets one again — but not on the first still frame,
    // which proves nothing: see the next spec.
    for (let frame = 0; frame < 3; frame++) {
      h.render(root);
      expect(canvases.bitmaps.length).toBe(NODES);
    }
    h.render(root);
    expect(canvases.bitmaps.length).toBe(NODES + 1);
  });

  it('makes no bitmap for a picture that changes most frames, with still frames between', () => {
    // gessologic's live wires, which change on every publish while its
    // frame readout draws a frame between publishes. Rasterising on the
    // first still frame made a bitmap per gap that the next change threw
    // away, and in software compositing each fresh canvas could wait on
    // the page's main thread — which stalled the render worker through a
    // blocked page. Replayed until they settle, they make none.
    const { root, painted } = buildTree();
    h.render(root);
    paintPictures.resetStats();

    for (let i = 0; i < 30; i++) {
      painted[0].setProperty('paint', sparkline(i / 30));
      h.render(root);
      // One or two frames drawn for something else before the next change.
      h.render(root);
      if (i % 2 === 0) h.render(root);
    }
    expect(paintPictures.stats.rasterized).toBe(0);
    expect(canvases.bitmaps.length).toBe(NODES);
  });
});
