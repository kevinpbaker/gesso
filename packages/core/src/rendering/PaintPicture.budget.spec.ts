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
 * move must make twenty draw calls and run no painter at all.
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

  it('paints each node once on the first frame and never again while it holds still', () => {
    const { root } = buildTree();
    h.render(root);
    expect(paintPictures.stats.recorded).toBe(NODES);
    expect(paintPictures.stats.rasterized).toBe(NODES);
    expect(callsOf(h.context, 'drawImage').length).toBe(NODES);

    paintPictures.resetStats();
    h.context.calls.length = 0;
    for (let frame = 0; frame < 5; frame++) {
      h.render(root);
    }
    // Five more frames of the same tree: five draw calls per node and
    // not one painter run between them.
    expect(paintPictures.stats.recorded).toBe(0);
    expect(paintPictures.stats.rasterized).toBe(0);
    expect(canvases.contexts.length).toBe(NODES);
    expect(callsOf(h.context, 'drawImage').length).toBe(NODES * 5);
  });

  it('repaints only the node whose inputs changed', () => {
    const { root, painted } = buildTree();
    h.render(root);
    paintPictures.resetStats();

    painted[7].setProperty('paint', sparkline(0.99));
    h.render(root);

    expect(paintPictures.stats.recorded).toBe(1);
    expect(paintPictures.stats.rasterized).toBe(1);
    expect(paintPictures.stats.resolved).toBe(NODES);
  });

  it('hands the second backend the pictures the first made, without repainting them', () => {
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

  it('allocates one bitmap per repaint and releases the one it replaced', () => {
    const { root, painted } = buildTree();
    h.render(root);
    expect(canvases.bitmaps.length).toBe(NODES);
    expect(canvases.bitmaps.filter(bitmap => bitmap.closed).length).toBe(0);

    for (let i = 0; i < 10; i++) {
      painted[0].setProperty('paint', sparkline(i / 10));
      h.render(root);
    }
    expect(canvases.bitmaps.length).toBe(NODES + 10);
    // Every picture but the one on screen has been released, so a
    // chart driven by a stream holds one bitmap and not a history.
    expect(canvases.bitmaps.filter(bitmap => bitmap.closed).length).toBe(10);
  });
});
