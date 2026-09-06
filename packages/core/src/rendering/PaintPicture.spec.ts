import { beforeEach, describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { darkTheme, lightTheme } from '../environment/UiTheme';
import { linearGradient } from '../properties/UiGradient';
import { Constraints } from '../layout/LayoutTypes';
import { PaintPictureCache } from './PaintPicture';
import type { PaintSurface, UiPaint, UiPath } from './PaintSurface';
import { FakePaintCanvases, RenderHarness } from './RenderTestUtils';

/**
 * The picture cache: what a painted node draws, when it draws it, and
 * what it costs to draw it again.
 *
 * The three questions this file exists to answer are the three the
 * design turns on. Does a painter run only when its inputs move? Does
 * a palette name follow the theme? And is the bitmap the two backends
 * are handed the same object, which is the whole of the parity claim.
 */
describe('PaintPictureCache', () => {
  let canvases: FakePaintCanvases;
  let pictures: PaintPictureCache;
  let h: RenderHarness;

  beforeEach(() => {
    canvases = new FakePaintCanvases();
    pictures = new PaintPictureCache(canvases.create);
    h = new RenderHarness();
  });

  let ids = 0;

  function paintNode(props: Record<string, unknown>): UiNode {
    const suffix = ids++;
    const root = h.createNode(`app${suffix}`, UiNodeType.Column);
    const node = h.createNode(`painted${suffix}`, UiNodeType.Paint);
    for (const [name, value] of Object.entries(props)) {
      node.setProperty(name, value);
    }
    h.append(root, node);
    h.layout(root, Constraints.tight(400, 300));
    return node;
  }

  const stroke: UiPaint = {
    draw(surface: PaintSurface, box) {
      surface.beginPath();
      surface.moveTo(0, box.height);
      surface.lineTo(box.width, 0);
      surface.strokeColor('#ff0000');
      surface.lineWidth(1 / box.scale);
      surface.stroke();
    },
    inputs: [1]
  };

  it('draws a painter into a bitmap the size of the box in device pixels', () => {
    const node = paintNode({ width: 120, height: 40, paint: stroke });
    const picture = pictures.pictureFor(node, h.record(node), 2);
    expect(picture).toBeDefined();
    expect(picture!.width).toBe(240);
    expect(picture!.height).toBe(80);
    // One transform puts the picture in physical pixels; the painter's
    // own calls stay in logical ones.
    expect(canvases.last.calls[0]).toEqual({ name: 'scale', args: [2, 2] });
    expect(canvases.last.calls.map(call => call.name)).toContain('stroke');
  });

  it('reuses the picture while the inputs, the box, the scale and the theme hold still', () => {
    const node = paintNode({ width: 120, height: 40, paint: stroke });
    const first = pictures.pictureFor(node, h.record(node), 2);
    const second = pictures.pictureFor(node, h.record(node), 2);
    expect(second).toBe(first);
    expect(pictures.stats.recorded).toBe(1);
    expect(pictures.stats.rasterized).toBe(1);
    expect(pictures.stats.resolved).toBe(2);
  });

  it('repaints when an input changes, and releases the bitmap it replaced', () => {
    const node = paintNode({ width: 120, height: 40, paint: stroke });
    const first = pictures.pictureFor(node, h.record(node), 2);
    node.setProperty('paint', { draw: stroke.draw, inputs: [2] });
    const second = pictures.pictureFor(node, h.record(node), 2);
    expect(second).not.toBe(first);
    expect(pictures.stats.rasterized).toBe(2);
    expect(canvases.bitmaps[0].closed).toBe(true);
  });

  it('repaints when the device scale changes, so a window moved to a retina display is crisp', () => {
    const node = paintNode({ width: 120, height: 40, paint: stroke });
    pictures.pictureFor(node, h.record(node), 1);
    const retina = pictures.pictureFor(node, h.record(node), 2);
    expect(retina!.width).toBe(240);
    expect(pictures.stats.rasterized).toBe(2);
  });

  it('repaints when the box changes size', () => {
    const node = paintNode({ width: 120, height: 40, paint: stroke });
    pictures.pictureFor(node, h.record(node), 1);
    node.setProperty('width', 200);
    h.layout(node.parent!, Constraints.tight(400, 300));
    pictures.pictureFor(node, h.record(node), 1);
    expect(pictures.stats.rasterized).toBe(2);
  });

  it('resolves a palette name against the node theme, and repaints when the theme changes', () => {
    const named: UiPaint = {
      draw(surface, box) {
        surface.beginPath();
        surface.rect(0, 0, box.width, box.height);
        surface.fillColor('background');
        surface.fill();
      }
    };
    const node = paintNode({ width: 20, height: 20, paint: named });
    const root = node.parent!;
    root.setProperty('theme', lightTheme);
    h.graph.propagateEnvironment(root);
    pictures.pictureFor(node, h.record(node), 1);
    const light = canvases.last.calls.find(call => call.name === 'fill')!.args[1];

    root.setProperty('theme', darkTheme);
    h.graph.propagateEnvironment(root);
    pictures.pictureFor(node, h.record(node), 1);
    const dark = canvases.last.calls.find(call => call.name === 'fill')!.args[1];

    expect(pictures.stats.rasterized).toBe(2);
    expect(dark).not.toEqual(light);
  });

  it('places a gradient in the rectangle it was given, not in the node box', () => {
    const ramp = linearGradient(90, [
      { offset: 0, color: '#000000' },
      { offset: 1, color: '#ffffff' }
    ]);
    const node = paintNode({
      width: 100,
      height: 50,
      paint: {
        draw(surface) {
          surface.beginPath();
          surface.rect(10, 20, 30, 10);
          surface.fillGradient(ramp, 10, 20, 30, 10);
          surface.fill();
        }
      } satisfies UiPaint
    });
    pictures.pictureFor(node, h.record(node), 1);
    const [x0, y0, x1, y1] = canvases.last.calls.find(call => call.name === 'createLinearGradient')!.args as number[];
    // The ramp is centred on the rectangle it was given, which is at
    // (10, 20) and 30 by 10, not on the node's 100 by 50 box.
    expect((x0 + x1) / 2).toBeCloseTo(25, 6);
    expect((y0 + y1) / 2).toBeCloseTo(25, 6);
  });

  it('draws a path property, fitting its viewBox into the content box', () => {
    const path: UiPath = { d: 'M0 0 H24 V24 Z', viewBox: 24, fill: '#00ff00', fillRule: 'evenodd' };
    const node = paintNode({ width: 48, height: 96, padding: 4, path });
    pictures.pictureFor(node, h.record(node), 1);
    const names = canvases.last.calls.map(call => call.name);
    expect(names).toContain('fill');
    // 48 wide with 4 of padding on each side is 40 of content, so a
    // 24-unit grid scales by 40/24 and is centred in the 88 of height.
    const scaled = canvases.last.calls.filter(call => call.name === 'scale');
    expect(scaled.at(-1)!.args[0]).toBeCloseTo(40 / 24, 6);
    expect(canvases.last.calls.find(call => call.name === 'fill')!.args[0]).toBe('evenodd');
  });

  it('strokes a path with its dash, cap and join', () => {
    const path: UiPath = {
      d: 'M0 0 L10 10',
      stroke: '#000000',
      strokeWidth: 2,
      lineCap: 'round',
      lineJoin: 'bevel',
      dash: [3, 2],
      dashOffset: 1
    };
    const node = paintNode({ width: 40, height: 40, path });
    pictures.pictureFor(node, h.record(node), 1);
    const ctx = canvases.last;
    expect(ctx.calls.map(call => call.name)).toContain('setLineDash');
    expect(ctx.lineCap).toBe('round');
    expect(ctx.lineJoin).toBe('bevel');
    expect(ctx.lineDashOffset).toBe(1);
  });

  it('clips to clipPath and blurs by blur before anything is drawn', () => {
    const node = paintNode({
      width: 40,
      height: 40,
      blur: 6,
      clipPath: 'M0 0 H40 V40 H0 Z',
      path: { d: 'M0 0 L40 40', stroke: '#000000', strokeWidth: 1 } satisfies UiPath
    });
    pictures.pictureFor(node, h.record(node), 1);
    const names = canvases.last.calls.map(call => call.name);
    expect(names.indexOf('clip')).toBeLessThan(names.indexOf('stroke'));
    expect(canvases.last.filter).toBe('blur(6px)');
  });

  it('draws nothing for a node with no paint and no path, and nothing for an empty box', () => {
    const empty = paintNode({ width: 40, height: 40 });
    expect(pictures.pictureFor(empty, h.record(empty), 1)).toBeUndefined();
    const zero = paintNode({ width: 0, height: 0, paint: stroke });
    expect(pictures.pictureFor(zero, h.record(zero), 1)).toBeUndefined();
    expect(pictures.stats.rasterized).toBe(0);
  });

  it('draws nothing, rather than throwing, when the host has no canvas to give', () => {
    const none = new PaintPictureCache(() => null);
    const node = paintNode({ width: 40, height: 40, paint: stroke });
    expect(none.pictureFor(node, h.record(node), 1)).toBeUndefined();
  });

  it('keeps the recording a picture was made from, for the gate and the inspector', () => {
    const node = paintNode({ width: 40, height: 40, paint: stroke });
    pictures.pictureFor(node, h.record(node), 1);
    expect(pictures.recordingFor(node).ops.map(op => op.op)).toEqual([
      'beginPath',
      'moveTo',
      'lineTo',
      'strokeColor',
      'lineWidth',
      'stroke'
    ]);
  });
});
