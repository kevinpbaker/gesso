import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { Constraints } from '../layout/LayoutTypes';
import { auto, fr } from '../layout/UiLength';
import { normalizeColor } from '../properties/UiColor';
import { RenderHarness } from './RenderTestUtils';
import type { RecordedCall } from './RenderTestUtils';
import { parseColor } from './webgpu/WebGPUColor';
import {
  buildRenderList,
  CommandKind,
  INSTANCE_STRIDE_FLOATS,
  PrimitiveKind,
  TEXTURED_STRIDE_FLOATS,
  type Affine,
  type RenderList
} from './webgpu/WebGPURenderData';

/**
 * Renderer parity (WebGPU roadmap G0).
 *
 * The two backends share PaintState, layoutTextLines, the scrollbar
 * geometry and paintOrder; what they do not share is the traversal
 * that turns records into draws. This spec runs one set of trees
 * through both — Canvas2DRenderer against the recording context, and
 * buildRenderList for WebGPU — decodes each into the same ordered
 * list of draws in screen space, and asserts the lists are equal.
 *
 * A draw is a fill, a border, an image or a text line, with its box,
 * colour and opacity, and the rectangular clip it was painted under.
 * Text positions are compared to within half a pixel, because the
 * WebGPU path snaps a run's origin to a physical pixel and Canvas2D
 * does not; everything else must match exactly.
 */

interface Draw {
  kind: 'fill' | 'border' | 'image' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Corner radius for fills and borders. */
  radius?: number;
  /** Colour as premultiplied-free RGBA floats, for fills, borders and text. */
  color?: string;
  opacity: number;
  borderWidth?: number;
  /** Rectangular clip in effect, in screen space, or null for none. */
  clip: Clip | null;
  text?: string;
}

interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

const NOW = Number.MAX_SAFE_INTEGER;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function colorKey(r: number, g: number, b: number, a: number): string {
  return `${round(r)},${round(g)},${round(b)},${round(a)}`;
}

function cssColorKey(css: unknown): string {
  const color = normalizeColor(css);
  const rgba = color === undefined ? undefined : parseColor(color);
  return rgba === undefined ? String(css) : colorKey(rgba.r, rgba.g, rgba.b, rgba.a);
}

function apply(t: Affine, x: number, y: number): [number, number] {
  return [x * t[0] + y * t[2] + t[4], x * t[1] + y * t[3] + t[5]];
}

function multiply(a: Affine, b: Affine): Affine {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

/** Axis-aligned screen box of a rectangle through a transform. */
function screenBox(t: Affine, x: number, y: number, width: number, height: number): Clip {
  const corners = [apply(t, x, y), apply(t, x + width, y), apply(t, x, y + height), apply(t, x + width, y + height)];
  const xs = corners.map(c => c[0]);
  const ys = corners.map(c => c[1]);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: round(left), y: round(top), width: round(Math.max(...xs) - left), height: round(Math.max(...ys) - top) };
}

function intersect(a: Clip | null, b: Clip): Clip {
  if (a === null) {
    return b;
  }
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/**
 * Decodes the Canvas2D call log into draws. Tracks the CTM, alpha and
 * clip through save/restore, and recognises the two path shapes the
 * renderer traces: `rect` and the moveTo/arcTo rounded rectangle.
 */
function canvasDraws(calls: readonly RecordedCall[]): Draw[] {
  const draws: Draw[] = [];
  let ctm: Affine = [1, 0, 0, 1, 0, 0];
  let alpha = 1;
  let clip: Clip | null = null;
  let fillStyle: unknown = '#000';
  let strokeStyle: unknown = '#000';
  let lineWidth = 1;
  const stack: { ctm: Affine; alpha: number; clip: Clip | null }[] = [];
  let path: { x: number; y: number; width: number; height: number; radius: number } | null = null;
  let moveTo: [number, number] | null = null;
  let arcs = 0;

  for (const call of calls) {
    const a = call.args as number[];
    switch (call.name) {
      case 'save':
        stack.push({ ctm, alpha, clip });
        break;
      case 'restore': {
        const saved = stack.pop()!;
        ctm = saved.ctm;
        alpha = saved.alpha;
        clip = saved.clip;
        break;
      }
      case 'setTransform':
        ctm = [a[0], a[1], a[2], a[3], a[4], a[5]];
        break;
      case 'translate':
        ctm = multiply(ctm, [1, 0, 0, 1, a[0], a[1]]);
        break;
      case 'scale':
        ctm = multiply(ctm, [a[0], 0, 0, a[1], 0, 0]);
        break;
      case 'rotate':
        ctm = multiply(ctm, [Math.cos(a[0]), Math.sin(a[0]), -Math.sin(a[0]), Math.cos(a[0]), 0, 0]);
        break;
      case 'set:globalAlpha':
        alpha = a[0];
        break;
      case 'set:fillStyle':
        fillStyle = call.args[0];
        break;
      case 'set:strokeStyle':
        strokeStyle = call.args[0];
        break;
      case 'set:lineWidth':
        lineWidth = a[0];
        break;
      case 'beginPath':
        path = null;
        moveTo = null;
        arcs = 0;
        break;
      case 'rect':
        path = { x: a[0], y: a[1], width: a[2], height: a[3], radius: 0 };
        break;
      case 'moveTo':
        moveTo = [a[0], a[1]];
        break;
      case 'arcTo':
        arcs++;
        if (arcs === 1 && moveTo !== null) {
          const radius = a[4];
          const x = moveTo[0] - radius;
          const y = moveTo[1];
          path = { x, y, width: a[0] - x, height: a[3] - y, radius };
        }
        break;
      case 'fillRect':
        draws.push(fillDraw(ctm, a[0], a[1], a[2], a[3], 0, fillStyle, alpha, clip));
        break;
      case 'fill':
        draws.push(fillDraw(ctm, path!.x, path!.y, path!.width, path!.height, path!.radius, fillStyle, alpha, clip));
        break;
      case 'strokeRect':
      case 'stroke': {
        // Canvas2D strokes a path inset by half the line width so the
        // band lies inside the box; recover the box the band belongs to.
        const inset = lineWidth / 2;
        const p = call.name === 'strokeRect' ? { x: a[0], y: a[1], width: a[2], height: a[3], radius: 0 } : path!;
        const radius = p.radius === 0 ? 0 : p.radius + inset;
        draws.push({
          ...fillDraw(
            ctm,
            p.x - inset,
            p.y - inset,
            p.width + lineWidth,
            p.height + lineWidth,
            radius,
            strokeStyle,
            alpha,
            clip
          ),
          kind: 'border',
          borderWidth: lineWidth
        });
        break;
      }
      case 'clip':
        clip = intersect(clip, screenBox(ctm, path!.x, path!.y, path!.width, path!.height));
        break;
      case 'drawImage':
        draws.push({ kind: 'image', ...screenBox(ctm, a[1], a[2], a[3], a[4]), opacity: alpha, clip });
        break;
      case 'fillText': {
        const [x, y] = apply(ctm, a[1], a[2]);
        draws.push({
          kind: 'text',
          text: call.args[0] as string,
          x: round(x),
          y: round(y),
          width: 0,
          height: 0,
          color: cssColorKey(fillStyle),
          opacity: alpha,
          clip
        });
        break;
      }
      default:
        break;
    }
  }
  return draws;
}

function fillDraw(
  ctm: Affine,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  style: unknown,
  alpha: number,
  clip: Clip | null
): Draw {
  return {
    kind: 'fill',
    ...screenBox(ctm, x, y, width, height),
    radius,
    color: cssColorKey(style),
    opacity: round(alpha),
    clip
  };
}

/** Decodes a WebGPU render list into draws, in command order. */
function webgpuDraws(list: RenderList): Draw[] {
  const draws: Draw[] = [];
  const clipOf = (scissor: { x: number; y: number; width: number; height: number } | null): Clip | null =>
    scissor === null ? null : { x: scissor.x, y: scissor.y, width: scissor.width, height: scissor.height };
  for (const command of list.commands) {
    if (command.kind === CommandKind.Primitives) {
      for (let i = command.start; i < command.end; i++) {
        const o = i * INSTANCE_STRIDE_FLOATS;
        const d = list.instanceData;
        const t: Affine = [d[o + 12], d[o + 13], d[o + 14], d[o + 15], d[o + 16], d[o + 17]];
        const kind = d[o + 11] === PrimitiveKind.Border ? 'border' : 'fill';
        draws.push({
          kind,
          ...screenBox(t, d[o], d[o + 1], d[o + 2], d[o + 3]),
          radius: d[o + 8],
          color: colorKey(d[o + 4], d[o + 5], d[o + 6], d[o + 7]),
          opacity: round(d[o + 9]),
          ...(kind === 'border' ? { borderWidth: d[o + 10] } : {}),
          clip: clipOf(command.scissor)
        });
      }
      continue;
    }
    const o = command.instance * TEXTURED_STRIDE_FLOATS;
    const d = list.texturedData;
    const t: Affine = [d[o + 6], d[o + 7], d[o + 8], d[o + 9], d[o + 10], d[o + 11]];
    if (command.kind === CommandKind.Image) {
      draws.push({
        kind: 'image',
        ...screenBox(t, d[o], d[o + 1], d[o + 2], d[o + 3]),
        opacity: round(d[o + 4]),
        clip: clipOf(command.scissor)
      });
      continue;
    }
    for (const line of command.item.lines) {
      const [x, y] = apply(t, d[o] + line.x, d[o + 1] + line.baselineY);
      draws.push({
        kind: 'text',
        text: line.text,
        x: round(x),
        y: round(y),
        width: 0,
        height: 0,
        color: cssColorKey(command.item.color),
        opacity: round(d[o + 4]),
        clip: clipOf(command.scissor)
      });
    }
  }
  return draws;
}

function expectParity(h: RenderHarness, root: UiNode, constraints = Constraints.tight(800, 600)): Draw[] {
  h.layout(root, constraints);
  h.context.calls.length = 0;
  h.renderer.render(root, { layout: h.engine, text: h.measurer, now: NOW });
  const canvas = canvasDraws(h.context.calls);
  const gpu = webgpuDraws(
    buildRenderList(root, h.engine, h.measurer, h.surface.logicalWidth, h.surface.logicalHeight, 1, NOW)
  );

  expect(
    gpu.map(d => d.kind),
    'draw order'
  ).toEqual(canvas.map(d => d.kind));
  for (let i = 0; i < canvas.length; i++) {
    const a = canvas[i];
    const b = gpu[i];
    const where = `draw ${i} (${a.kind}${a.text !== undefined ? ` "${a.text}"` : ''})`;
    if (a.kind === 'text') {
      expect(b.text, where).toBe(a.text);
      expect(Math.abs(b.x - a.x), `${where} x`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(b.y - a.y), `${where} baseline`).toBeLessThanOrEqual(0.5);
      expect(b.color, where).toBe(a.color);
      expect(b.opacity, where).toBe(a.opacity);
      expect(b.clip, `${where} clip`).toEqual(a.clip);
      continue;
    }
    expect(b, where).toEqual(a);
  }
  return canvas;
}

function box(h: RenderHarness, id: string, props: Record<string, unknown>, type = UiNodeType.Box): UiNode {
  const node = h.createNode(id, type);
  for (const [key, value] of Object.entries(props)) {
    node.setProperty(key, value);
  }
  return node;
}

describe('renderer parity: Canvas2D and WebGPU paint the same draws', () => {
  it('a card with background, border, padding and text', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('padding', 12);
    const card = box(h, 'card', {
      width: 240,
      height: 120,
      backgroundColor: '#ffffff',
      borderWidth: 2,
      borderColor: '#334455',
      borderRadius: 6,
      padding: 8
    });
    const title = box(
      h,
      'title',
      { text: 'A title that wraps onto more than one line', fontSize: 14, color: '#111' },
      UiNodeType.Text
    );
    const value = box(h, 'value', { text: 'Value', fontSize: 12, color: '#777', textAlign: 'right' }, UiNodeType.Text);
    h.append(card, title, value);
    h.append(root, card);
    const draws = expectParity(h, root);
    expect(draws.filter(d => d.kind === 'text').length).toBeGreaterThan(1);
  });

  it('children under fragments, plain and zIndex-ordered', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const plain = box(h, 'plain', { width: 200, height: 100 });
    const fragment = h.createNode('fragment', UiNodeType.Fragment);
    h.append(fragment, box(h, 'f1', { width: 50, height: 50, backgroundColor: '#f00' }));
    h.append(fragment, box(h, 'f2', { width: 50, height: 50, backgroundColor: '#0f0' }));
    h.append(plain, fragment);

    const ordered = box(h, 'ordered', { width: 200, height: 100 });
    const fragment2 = h.createNode('fragment2', UiNodeType.Fragment);
    h.append(fragment2, box(h, 'z2', { width: 50, height: 50, backgroundColor: '#00f', zIndex: 2 }));
    h.append(fragment2, box(h, 'z1', { width: 50, height: 50, backgroundColor: '#ff0', zIndex: 1 }));
    h.append(ordered, fragment2);
    h.append(ordered, box(h, 'z0', { width: 50, height: 50, backgroundColor: '#0ff' }));

    h.append(root, plain, ordered);
    const draws = expectParity(h, root);
    expect(draws).toHaveLength(5);
    expect(h.record(ordered).paintOrder).not.toBeNull();
  });

  it('a rounded overflow-hidden card clipping a spilling child and an image', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('padding', 10);
    const image = { width: 300, height: 200 } as ImageBitmap;
    const card = box(h, 'card', {
      width: 160,
      height: 90,
      overflow: 'hidden',
      borderRadius: 12,
      backgroundColor: '#eee'
    });
    h.append(card, box(h, 'photo', { width: 400, height: 400, image, objectFit: 'cover', flexShrink: 0 }));
    h.append(card, box(h, 'spill', { width: 300, height: 300, backgroundColor: '#f00', flexShrink: 0 }));
    h.append(root, card);
    const draws = expectParity(h, root);
    expect(draws.map(d => d.kind)).toEqual(['fill', 'image', 'fill']);
    expect(draws[1].clip).toEqual({ x: 10, y: 10, width: 160, height: 90 });
  });

  it('images under every objectFit', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Row);
    root.setProperty('gap', 4);
    const image = { width: 200, height: 100 } as ImageBitmap;
    for (const fit of ['fill', 'cover', 'contain', 'none']) {
      h.append(root, box(h, fit, { width: 100, height: 100, image, objectFit: fit, overflow: 'hidden' }));
    }
    const draws = expectParity(h, root);
    expect(draws.filter(d => d.kind === 'image')).toHaveLength(4);
  });

  it('a scrolled list with a sticky header, an overlay above it, and culling', () => {
    const h = new RenderHarness(400, 200);
    const root = h.createNode('app', UiNodeType.Box);
    root.setProperty('position', 'relative');
    const scroll = h.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 400);
    scroll.setProperty('height', 200);
    scroll.setProperty('scrollY', 135);
    h.append(
      scroll,
      box(h, 'header', {
        width: 400,
        height: 24,
        backgroundColor: '#333',
        position: 'sticky',
        top: 0,
        flexShrink: 0,
        text: 'Header',
        color: '#fff'
      })
    );
    for (let i = 0; i < 200; i++) {
      h.append(
        scroll,
        box(h, `row${i}`, {
          width: 400,
          height: 20,
          backgroundColor: i % 2 ? '#fafafa' : '#f0f0f0',
          flexShrink: 0,
          text: `Row ${i}`,
          fontSize: 11
        })
      );
    }
    const overlay = box(h, 'overlay', {
      position: 'absolute',
      left: 250,
      top: 40,
      width: 120,
      height: 80,
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: '#999',
      zIndex: 10
    });
    h.append(overlay, box(h, 'menu-item', { text: 'Menu item', fontSize: 12 }, UiNodeType.Text));
    h.append(root, scroll, overlay);
    const draws = expectParity(h, root, Constraints.tight(400, 200));
    // Culling keeps the visible rows only: 200 rows would be 400 draws.
    expect(draws.length).toBeLessThan(40);
    // The overlay paints after the list, so its text is not under a row.
    const last = draws[draws.length - 1];
    expect(last.kind).toBe('text');
    expect(last.text).toBe('Menu item');
  });

  it('nested scrollers with independent offsets', () => {
    const h = new RenderHarness(300, 300);
    const outer = h.createNode('outer', UiNodeType.ScrollView);
    outer.setProperty('width', 300);
    outer.setProperty('height', 300);
    outer.setProperty('scrollY', 40);
    const inner = h.createNode('inner', UiNodeType.ScrollView);
    inner.setProperty('width', 200);
    inner.setProperty('height', 100);
    inner.setProperty('scrollY', 25);
    inner.setProperty('flexShrink', 0);
    for (let i = 0; i < 20; i++) {
      h.append(inner, box(h, `i${i}`, { width: 200, height: 15, backgroundColor: '#abc', flexShrink: 0 }));
    }
    h.append(outer, box(h, 'top', { width: 300, height: 60, backgroundColor: '#def', flexShrink: 0 }));
    h.append(outer, inner);
    h.append(outer, box(h, 'bottom', { width: 300, height: 600, backgroundColor: '#fed', flexShrink: 0 }));
    const draws = expectParity(h, outer, Constraints.tight(300, 300));
    const innerClip = draws.find(d => d.clip !== null && d.clip.height === 100)?.clip;
    expect(innerClip).toEqual({ x: 0, y: 20, width: 200, height: 100 });
  });

  it('a translated, scaled and nested-opacity subtree inside a clip', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const clipper = box(h, 'clipper', { width: 200, height: 200, overflow: 'hidden', opacity: 0.5 });
    const moved = box(h, 'moved', {
      width: 100,
      height: 100,
      backgroundColor: '#f00',
      opacity: 0.5,
      transform: { x: 30, y: 10, scaleX: 2, scaleY: 0.5 }
    });
    h.append(
      moved,
      box(h, 'inner', { width: 40, height: 40, backgroundColor: '#00f', borderWidth: 1, borderColor: '#000' })
    );
    h.append(clipper, moved);
    h.append(root, clipper);
    const draws = expectParity(h, root);
    expect(draws.map(d => d.opacity)).toEqual([0.25, 0.25, 0.25]);
  });

  it('a rotated subtree keeps the same draws, boxes compared as bounds', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const spun = box(h, 'spun', {
      width: 100,
      height: 50,
      backgroundColor: '#f00',
      transform: { rotation: Math.PI / 6 }
    });
    h.append(spun, box(h, 'inner', { width: 30, height: 30, backgroundColor: '#0f0' }));
    h.append(root, spun);
    expectParity(h, root);
  });

  it('a grid of labelled cells', () => {
    const h = new RenderHarness();
    const grid = h.createNode('grid', UiNodeType.Grid);
    grid.setProperty('columns', [auto, fr(1)]);
    grid.setProperty('gap', 6);
    grid.setProperty('width', 300);
    for (let i = 0; i < 3; i++) {
      h.append(grid, box(h, `label${i}`, { text: `Label ${i}`, fontSize: 12 }, UiNodeType.Text));
      h.append(
        grid,
        box(h, `field${i}`, {
          height: 24,
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#ccc',
          borderRadius: 3
        })
      );
    }
    const draws = expectParity(h, grid, Constraints.loose(800, 600));
    expect(draws.filter(d => d.kind === 'text').length).toBeGreaterThanOrEqual(3);
  });
});
