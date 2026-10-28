import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { Constraints } from '../layout/LayoutTypes';
import { normalizeColor } from '../properties/UiColor';
import { FakeCanvasHost, RenderHarness } from './RenderTestUtils';
import type { RecordedCall } from './RenderTestUtils';
import { parseColor } from './webgpu/WebGPUColor';
import {
  buildRenderList,
  CommandKind,
  INSTANCE_STRIDE_FLOATS,
  PrimitiveKind,
  TEXTURED_STRIDE_FLOATS,
  type EndLayerCommand,
  type RenderList
} from './webgpu/WebGPURenderData';

/**
 * Group opacity, as pixels.
 *
 * The case is the one a BudSense screen rebuilt in Atelier measured
 * against Figma: a disabled button, a box at half opacity with a dark
 * blue background and an opaque white child, on a white page. CSS
 * composites the button whole and then fades it, so the child is white
 * over the faded box — white over white — and the box is half its blue.
 * Fading each draw on its own fades the child twice, once in its own
 * draw and again through the half-transparent box under it, and it came
 * out (202,207,213).
 *
 * Neither backend can be rasterised here, so each one's output is
 * composited down to the pixels at a few points: the Canvas2D call log,
 * frame and layers alike, and the WebGPU render list, layers included.
 * Both are rectangles in this tree, which is all the compositor knows.
 */

type Rgba = [number, number, number, number];

const TRANSPARENT: Rgba = [0, 0, 0, 0];

/** Premultiplied source-over. */
function over(src: Rgba, dst: Rgba): Rgba {
  const keep = 1 - src[3];
  return [src[0] + dst[0] * keep, src[1] + dst[1] * keep, src[2] + dst[2] * keep, src[3] + dst[3] * keep];
}

/** A straight-alpha colour at an opacity, premultiplied. */
function premultiplied(color: { r: number; g: number; b: number; a: number }, opacity: number): Rgba {
  const a = color.a * opacity;
  return [color.r * a, color.g * a, color.b * a, a];
}

function scaled(color: Rgba, by: number): Rgba {
  return [color[0] * by, color[1] * by, color[2] * by, color[3] * by];
}

/** A composited pixel as the 8-bit RGB it shows over nothing. */
function rgb(color: Rgba): [number, number, number] {
  const a = color[3] === 0 ? 1 : color[3];
  return [Math.round((color[0] / a) * 255), Math.round((color[1] / a) * 255), Math.round((color[2] / a) * 255)];
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function inside(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

type Matrix = [number, number, number, number, number, number];

/** The axis-aligned device box of a rectangle through a matrix; nothing here rotates. */
function deviceRect(m: Matrix, x: number, y: number, width: number, height: number): Rect {
  const x0 = m[0] * x + m[2] * y + m[4];
  const y0 = m[1] * x + m[3] * y + m[5];
  const x1 = m[0] * (x + width) + m[2] * (y + height) + m[4];
  const y1 = m[1] * (x + width) + m[3] * (y + height) + m[5];
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}

function cssColor(value: unknown): { r: number; g: number; b: number; a: number } {
  const color = parseColor(normalizeColor(value)!);
  if (color === undefined) {
    throw new Error(`Not a colour the compositor knows: ${String(value)}`);
  }
  return color;
}

/**
 * The pixel at (x, y) after replaying a Canvas2D call log.
 *
 * The frame and every layer record into the one log. A layer is drawn
 * from its region's corner and starts each group transparent (it is
 * given a fresh backing), so what a `drawImage` of one blends is that
 * layer's calls since it was last blended, read at the point less
 * where the layer was put.
 */
function canvasPixel(calls: readonly RecordedCall[], x: number, y: number): Rgba {
  const sinceBlend = new Map<string, number[]>();
  const blended = new Map<number, number[]>();
  const frame: number[] = [];
  calls.forEach((call, i) => {
    if (call.name === 'drawImage' && call.args[0] instanceof FakeCanvasHost) {
      const label = call.args[0].label!;
      blended.set(i, sinceBlend.get(label) ?? []);
      sinceBlend.set(label, []);
    }
    if (call.target === undefined) {
      frame.push(i);
    } else {
      sinceBlend.set(call.target, [...(sinceBlend.get(call.target) ?? []), i]);
    }
  });
  return replay(calls, frame, blended, x, y);
}

function replay(
  calls: readonly RecordedCall[],
  indices: readonly number[],
  blended: ReadonlyMap<number, number[]>,
  x: number,
  y: number
): Rgba {
  interface State {
    m: Matrix;
    alpha: number;
    fill: unknown;
    clip: Rect | null;
  }
  let state: State = { m: [1, 0, 0, 1, 0, 0], alpha: 1, fill: '#000', clip: null };
  const stack: State[] = [];
  let path: Rect | null = null;
  let pixel = TRANSPARENT;
  for (const i of indices) {
    const call = calls[i];
    const a = call.args as number[];
    const visible = (rect: Rect): boolean => inside(rect, x, y) && (state.clip === null || inside(state.clip, x, y));
    switch (call.name) {
      case 'save':
        stack.push({ ...state });
        break;
      case 'restore':
        state = stack.pop() ?? state;
        break;
      case 'setTransform':
        state.m = [a[0], a[1], a[2], a[3], a[4], a[5]];
        break;
      case 'translate':
        state.m = multiply(state.m, [1, 0, 0, 1, a[0], a[1]]);
        break;
      case 'scale':
        state.m = multiply(state.m, [a[0], 0, 0, a[1], 0, 0]);
        break;
      case 'set:globalAlpha':
        state.alpha = a[0];
        break;
      case 'set:fillStyle':
        state.fill = call.args[0];
        break;
      case 'beginPath':
        path = null;
        break;
      case 'rect':
        path = deviceRect(state.m, a[0], a[1], a[2], a[3]);
        break;
      case 'clip': {
        const clip = state.clip;
        const p = path!;
        if (clip === null) {
          state.clip = p;
        } else {
          const left = Math.max(clip.x, p.x);
          const top = Math.max(clip.y, p.y);
          const right = Math.min(clip.x + clip.width, p.x + p.width);
          const bottom = Math.min(clip.y + clip.height, p.y + p.height);
          state.clip = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
        }
        break;
      }
      case 'clearRect':
        if (inside(deviceRect(state.m, a[0], a[1], a[2], a[3]), x, y)) {
          pixel = TRANSPARENT;
        }
        break;
      case 'fillRect':
        if (visible(deviceRect(state.m, a[0], a[1], a[2], a[3]))) {
          pixel = over(premultiplied(cssColor(state.fill), state.alpha), pixel);
        }
        break;
      case 'fill':
        if (path !== null && visible(path)) {
          pixel = over(premultiplied(cssColor(state.fill), state.alpha), pixel);
        }
        break;
      case 'drawImage': {
        const place = deviceRect(state.m, a[1], a[2], a[3], a[4]);
        if (!(call.args[0] instanceof FakeCanvasHost) || !visible(place)) {
          break;
        }
        const layer = replay(calls, blended.get(i)!, blended, x - place.x, y - place.y);
        pixel = over(scaled(layer, state.alpha), pixel);
        break;
      }
      default:
        break;
    }
  }
  return pixel;
}

/**
 * The pixel at (x, y) after drawing a WebGPU render list: each fill
 * instance blended as the primitive pipeline blends it, each layer
 * begun transparent and blended premultiplied at its instance's
 * opacity, as the layer pipeline does.
 */
function webgpuPixel(list: RenderList, x: number, y: number): Rgba {
  const targets: Rgba[] = [TRANSPARENT];
  const top = (): number => targets.length - 1;
  for (const command of list.commands) {
    const scissor = command.scissor;
    const scissored = scissor !== null && !inside(scissor, x, y);
    switch (command.kind) {
      case CommandKind.BeginLayer:
        targets.push(TRANSPARENT);
        break;
      case CommandKind.EndLayer: {
        const layer = targets.pop()!;
        if (command.instance === null || scissored) {
          break;
        }
        // The quad covers the group's region, in surface coordinates,
        // as the layer texture is the surface's size.
        const t = list.texturedData;
        const o = command.instance * TEXTURED_STRIDE_FLOATS;
        if (inside({ x: t[o], y: t[o + 1], width: t[o + 2], height: t[o + 3] }, x, y)) {
          targets[top()] = over(scaled(layer, t[o + 4]), targets[top()]);
        }
        break;
      }
      case CommandKind.Primitives:
        for (let i = command.start; i < command.end; i++) {
          const o = i * INSTANCE_STRIDE_FLOATS;
          const d = list.instanceData;
          if (d[o + 11] !== PrimitiveKind.Fill || scissored) {
            continue;
          }
          const m: Matrix = [d[o + 12], d[o + 13], d[o + 14], d[o + 15], d[o + 16], d[o + 17]];
          if (!inside(deviceRect(m, d[o], d[o + 1], d[o + 2], d[o + 3]), x, y)) {
            continue;
          }
          const color = { r: d[o + 4], g: d[o + 5], b: d[o + 6], a: d[o + 7] };
          targets[top()] = over(premultiplied(color, d[o + 9]), targets[top()]);
        }
        break;
      default:
        break;
    }
  }
  return targets[0];
}

function box(h: RenderHarness, id: string, props: Record<string, unknown>): UiNode {
  const node = h.createNode(id, UiNodeType.Box);
  for (const [key, value] of Object.entries(props)) {
    node.setProperty(key, value);
  }
  return node;
}

/** A white page holding a disabled button: a faded blue box with an opaque white child. */
function disabledButton(h: RenderHarness): { root: UiNode; button: UiNode; label: UiNode } {
  const root = h.createNode('page', UiNodeType.Column);
  root.setProperty('backgroundColor', '#ffffff');
  root.setProperty('padding', 20);
  const button = box(h, 'button', {
    width: 120,
    height: 40,
    padding: 12,
    backgroundColor: 'rgb(43, 63, 87)',
    opacity: 0.5
  });
  const label = box(h, 'label', { width: 60, height: 16, backgroundColor: '#ffffff' });
  h.append(button, label);
  h.append(root, button);
  h.layout(root, Constraints.tight(200, 100));
  return { root, button, label };
}

const NOW = Number.MAX_SAFE_INTEGER;

function render(h: RenderHarness, root: UiNode): { canvas: readonly RecordedCall[]; gpu: RenderList } {
  h.context.calls.length = 0;
  h.renderer.render(root, { layout: h.engine, text: h.measurer, now: NOW });
  const gpu = buildRenderList(root, h.engine, h.measurer, h.surface.logicalWidth, h.surface.logicalHeight, 1, NOW);
  return { canvas: h.context.calls, gpu };
}

describe('group opacity', () => {
  it("draws a faded box's opaque child over the faded box, not faded a second time", () => {
    const h = new RenderHarness(200, 100, 1, { groups: true });
    const { root, button, label } = disabledButton(h);
    const { canvas, gpu } = render(h, root);
    const labelBox = h.box(label);
    const buttonBox = h.box(button);
    const onLabel = [labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2] as const;
    const onButton = [buttonBox.x + 4, buttonBox.y + 4] as const;
    const onPage = [5, 5] as const;

    for (const [name, pixel] of [
      ['Canvas2D', (x: number, y: number) => canvasPixel(canvas, x, y)],
      ['WebGPU', (x: number, y: number) => webgpuPixel(gpu, x, y)]
    ] as const) {
      // White over the faded box, as CSS and Figma draw it — not
      // (202,207,213), which is white faded over the faded box.
      expect(rgb(pixel(...onLabel)), `${name} label`).toEqual([255, 255, 255]);
      expect(rgb(pixel(...onButton)), `${name} button`).toEqual([149, 159, 171]);
      expect(rgb(pixel(...onPage)), `${name} page`).toEqual([255, 255, 255]);
    }
  });

  it('keeps fading each draw where the subtree is a single draw, which is the same picture', () => {
    const h = new RenderHarness(200, 100, 1, { groups: true });
    const root = h.createNode('page', UiNodeType.Column);
    root.setProperty('padding', 20);
    // A wrapper that paints nothing around a box that paints once.
    const wrapper = box(h, 'wrapper', { opacity: 0.5 });
    h.append(wrapper, box(h, 'icon', { width: 24, height: 24, backgroundColor: '#ff0000', opacity: 0.5 }));
    h.append(root, wrapper);
    h.layout(root, Constraints.tight(200, 100));
    const { canvas, gpu } = render(h, root);

    expect(h.groupLayers.size).toBe(0);
    expect(canvas.some(call => call.target !== undefined)).toBe(false);
    expect(gpu.commands.some(command => command.kind === CommandKind.BeginLayer)).toBe(false);
    expect(rgb(canvasPixel(canvas, 30, 30))).toEqual(rgb(webgpuPixel(gpu, 30, 30)));
    expect(canvasPixel(canvas, 30, 30)[3]).toBeCloseTo(0.25);
  });

  it('draws a layer the size of the region its subtree paints, and blends only that', () => {
    const h = new RenderHarness(200, 100, 1, { groups: true });
    const { root } = disabledButton(h);
    const { canvas, gpu } = render(h, root);

    // The button's box, a slop's width wider each way, rather than the
    // surface: a layer the surface's size costs Chrome a copy of all of
    // it on every blend.
    const blend = canvas.find(call => call.name === 'drawImage');
    expect(blend?.args.slice(1)).toEqual([18, 18, 124, 44]);
    const layer = h.groupLayers.get('group0')!;
    expect([layer.width, layer.height]).toEqual([124, 44]);
    const end = gpu.commands.find((command): command is EndLayerCommand => command.kind === CommandKind.EndLayer)!;
    const o = end.instance! * TEXTURED_STRIDE_FLOATS;
    expect([...gpu.texturedData.slice(o, o + 4)]).toEqual([18, 18, 124, 44]);
    expect(end.scissor).toBeNull();

    // A second frame draws into the same canvas rather than making another.
    const again = render(h, root);
    expect(h.groupLayers.size).toBe(1);
    expect(rgb(canvasPixel(again.canvas, 50, 38))).toEqual([255, 255, 255]);
  });

  it('grows the region over a descendant transformed past the box', () => {
    const h = new RenderHarness(200, 100, 1, { groups: true });
    const { root, label } = disabledButton(h);
    label.setProperty('transform', { translateX: 100 });
    h.layout(root, Constraints.tight(200, 100));
    const { canvas, gpu } = render(h, root);

    const moved = h.box(label);
    const blend = canvas.find(call => call.name === 'drawImage');
    // From the button's left to the moved label's right, plus the slop.
    expect(blend?.args.slice(1)).toEqual([18, 18, moved.x + 100 + moved.width + 2 - 18, 44]);
    for (const [name, pixel] of [
      ['Canvas2D', canvasPixel(canvas, moved.x + 130, moved.y + 8)],
      ['WebGPU', webgpuPixel(gpu, moved.x + 130, moved.y + 8)]
    ] as const) {
      // The moved child is still white, out past the button.
      expect(rgb(pixel), name).toEqual([255, 255, 255]);
    }
  });

  it('blends nothing for a group that is off the surface', () => {
    const h = new RenderHarness(200, 100, 1, { groups: true });
    const { root, button } = disabledButton(h);
    button.setProperty('transform', { translateY: 400 });
    h.layout(root, Constraints.tight(200, 100));
    const { canvas, gpu } = render(h, root);

    expect(canvas.some(call => call.name === 'drawImage')).toBe(false);
    const end = gpu.commands.find((command): command is EndLayerCommand => command.kind === CommandKind.EndLayer);
    expect(end?.instance).toBeNull();
  });

  it('falls back to fading each draw where no layer canvas can be had', () => {
    const h = new RenderHarness(200, 100);
    const { root } = disabledButton(h);
    const { canvas } = render(h, root);
    expect(canvas.some(call => call.name === 'drawImage')).toBe(false);
    expect(rgb(canvasPixel(canvas, 50, 38))).toEqual([202, 207, 213]);
  });
});
