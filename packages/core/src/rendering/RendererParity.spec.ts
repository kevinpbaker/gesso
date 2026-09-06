import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { Constraints } from '../layout/LayoutTypes';
import { auto, fr } from '../layout/UiLength';
import { normalizeColor } from '../properties/UiColor';
import { setSelectionRange } from '../selection/UiSelectable';
import { setMatchRanges } from '../find/UiTextMatches';
import type { DecorationShape } from './Decorations';
import { linearGradient, radialGradient } from '../properties/UiGradient';
import { percent } from '../layout/UiLength';
import { FakePaintCanvases, RenderHarness, RecordedGradient } from './RenderTestUtils';
import { paintPictures } from './PaintPicture';
import type { UiPaint, UiPath } from './PaintSurface';
import type { RecordedCall } from './RenderTestUtils';
import { parseColor } from './webgpu/WebGPUColor';
import {
  buildRenderList,
  CommandKind,
  GRADIENT_COLORS_OFFSET,
  GRADIENT_OFFSETS_OFFSET,
  GRADIENT_STRIDE_FLOATS,
  INSTANCE_STRIDE_FLOATS,
  NO_GRADIENT_INDEX,
  PrimitiveKind,
  TEXTURED_STRIDE_FLOATS,
  type Affine,
  type RenderList,
  type ScissorRect,
  type TextRunDraw
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

/**
 * A gradient as a comparable string: kind, geometry in the filled box's
 * own coordinates, then each stop.
 *
 * The two backends state a gradient in different shapes: Canvas2D gets
 * absolute endpoints and `addColorStop` calls, and WebGPU gets a record
 * in a storage buffer, so neither can be compared to the other
 * directly. Both are reduced to this, which is what the fragment shader and
 * `createLinearGradient` are each given: where the ramp starts, where it
 * ends, and what is at each point along it.
 */
function gradientKey(
  kind: string,
  geometry: readonly number[],
  stops: readonly { offset: number; color: string }[]
): string {
  const places = geometry.map(round).join(',');
  const ramp = stops.map(stop => `${round(stop.offset)}:${stop.color}`).join(' ');
  return `${kind}(${places})[${ramp}]`;
}

/**
 * The Canvas2D gradient, relative to the box being filled. Radial
 * gradients are asked for as two concentric circles with the inner one
 * at zero radius, so only the outer radius carries information.
 */
function canvasGradientKey(gradient: RecordedGradient, boxX: number, boxY: number): string {
  const stops = gradient.stops.map(stop => ({ offset: stop.offset, color: cssColorKey(stop.color) }));
  if (gradient.kind === 'linear') {
    const [x0, y0, x1, y1] = gradient.args;
    return gradientKey('linear', [x0 - boxX, y0 - boxY, x1 - boxX, y1 - boxY], stops);
  }
  const [x0, y0, , , , r1] = gradient.args;
  return gradientKey('radial', [x0 - boxX, y0 - boxY, r1], stops);
}

/** The same gradient read back out of the frame's gradient buffer. */
function webgpuGradientKey(data: Float32Array, index: number): string {
  const at = index * GRADIENT_STRIDE_FLOATS;
  const count = data[at + 1];
  const stops: { offset: number; color: string }[] = [];
  for (let i = 0; i < count; i++) {
    const color = at + GRADIENT_COLORS_OFFSET + i * 4;
    stops.push({
      offset: data[at + GRADIENT_OFFSETS_OFFSET + i],
      color: colorKey(data[color], data[color + 1], data[color + 2], data[color + 3])
    });
  }
  if (data[at] === 0) {
    return gradientKey('linear', [data[at + 4], data[at + 5], data[at + 6], data[at + 7]], stops);
  }
  return gradientKey('radial', [data[at + 4], data[at + 5], data[at + 6]], stops);
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
    color: style instanceof RecordedGradient ? canvasGradientKey(style, x, y) : cssColorKey(style),
    opacity: round(alpha),
    clip
  };
}

/** Decodes a WebGPU render list into draws, in command order. */
function webgpuDraws(list: RenderList): Draw[] {
  const draws: Draw[] = [];
  const clipOf = (scissor: { x: number; y: number; width: number; height: number } | null): Clip | null =>
    scissor === null ? null : { x: scissor.x, y: scissor.y, width: scissor.width, height: scissor.height };
  // Text is compared run by run, not glyph by glyph: what has to match
  // Canvas2D is the words, their baselines and their colour, and the
  // atlas cell a letter happens to land in is not part of that. Runs
  // are emitted in instance order, so consuming them as their glyph
  // commands come up keeps text interleaved with the fills around it.
  const runClips = new Map<TextRunDraw, ScissorRect | null>();
  for (const command of list.commands) {
    if (command.kind === CommandKind.Glyphs) {
      for (const run of list.textRuns) {
        if (run.instance >= command.start && run.instance < command.end) {
          runClips.set(run, command.scissor);
        }
      }
    }
  }
  let nextRun = 0;
  const flushRuns = (limit: number): void => {
    while (nextRun < list.textRuns.length && list.textRuns[nextRun].instance < limit) {
      const run = list.textRuns[nextRun++];
      draws.push({
        kind: 'text',
        text: run.text,
        x: round(run.x),
        y: round(run.y),
        width: 0,
        height: 0,
        color: cssColorKey(run.color),
        opacity: round(run.opacity),
        clip: clipOf(runClips.get(run) ?? null)
      });
    }
  };
  for (const command of list.commands) {
    if (command.kind === CommandKind.Glyphs) {
      flushRuns(command.end);
      continue;
    }
    if (command.kind === CommandKind.Primitives) {
      for (let i = command.start; i < command.end; i++) {
        const o = i * INSTANCE_STRIDE_FLOATS;
        const d = list.instanceData;
        const t: Affine = [d[o + 12], d[o + 13], d[o + 14], d[o + 15], d[o + 16], d[o + 17]];
        const kind = d[o + 11] === PrimitiveKind.Border ? 'border' : 'fill';
        const gradient = d[o + 19];
        draws.push({
          kind,
          ...screenBox(t, d[o], d[o + 1], d[o + 2], d[o + 3]),
          radius: d[o + 8],
          color:
            gradient === NO_GRADIENT_INDEX
              ? colorKey(d[o + 4], d[o + 5], d[o + 6], d[o + 7])
              : webgpuGradientKey(list.gradientData, gradient),
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
    draws.push({
      kind: 'image',
      ...screenBox(t, d[o], d[o + 1], d[o + 2], d[o + 3]),
      opacity: round(d[o + 4]),
      clip: clipOf(command.scissor)
    });
  }
  flushRuns(Number.POSITIVE_INFINITY);
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
  /**
   * A painted node's picture is made by a shared rasteriser, which
   * needs a canvas the suite does not have. The double stands in for
   * it, and is installed for every case rather than for the painted
   * ones alone so that nothing here depends on the order they run in.
   */
  beforeEach(() => {
    paintPictures.setCanvasFactory(new FakePaintCanvases().create);
  });

  afterEach(() => {
    paintPictures.setCanvasFactory(() => null);
  });

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

  it('a selection spanning two wrapped paragraphs', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('width', 160);
    // An explicit selection colour: the theme's default is written as
    // rounded decimals, which Canvas2D quantises to 1/255 on its way
    // through an rgba() string and WebGPU does not, and this spec
    // compares colours exactly.
    const selectionColor = '#66aaff';
    const heading = box(
      h,
      'heading',
      { text: 'A heading that wraps', fontSize: 16, color: '#111', selectionColor },
      UiNodeType.Text
    );
    const body = box(
      h,
      'body',
      { text: 'and a body under it', fontSize: 12, color: '#555', selectionColor },
      UiNodeType.Text
    );
    h.append(root, heading, body);
    // The tail of the first and the head of the second, as a drag
    // across both leaves them.
    setSelectionRange(heading, 6, 20);
    setSelectionRange(body, 0, 9);
    const draws = expectParity(h, root);
    expect(draws.filter(d => d.kind === 'fill').length).toBeGreaterThan(1);
  });

  it('find matches under an active one, across two paragraphs', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('width', 160);
    const style = { fontSize: 12, color: '#333', selectionColor: '#66aaff', matchColor: '#ffcc00' };
    const first = box(h, 'first', { text: 'the one and the other', ...style }, UiNodeType.Text);
    const second = box(h, 'second', { text: 'and the last one', ...style }, UiNodeType.Text);
    h.append(root, first, second);
    setMatchRanges(first, [
      { start: 0, end: 3 },
      { start: 12, end: 15 }
    ]);
    setMatchRanges(second, [{ start: 4, end: 7 }]);
    // The active match is also a selection, drawn over its own highlight.
    setSelectionRange(second, 4, 7);
    const draws = expectParity(h, root);
    expect(draws.filter(d => d.kind === 'fill')).toHaveLength(4);
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

  /**
   * Decorations (MODIFIERS_ROADMAP.md B3) are the only pixels a
   * modifier may put on screen, and the reason they are a shared input
   * rather than a canvas callback is exactly this: the two backends
   * place them from one piece of arithmetic, under one set of clips.
   *
   * The tree puts a ring on a row inside a rounded, scrolled clip — so
   * a decoration that is cut off has to be cut off the same way on
   * both — and a second one on a zIndex-reordered child, so a
   * decoration lands at its node's place in paint order and not at its
   * place in the tree.
   */
  it('decorated nodes under a clip and under paintOrder', () => {
    const h = new RenderHarness(400, 200);
    const ring: readonly DecorationShape[] = [
      { kind: 'stroke', color: '#22d3ee', lineWidth: 2, outset: 4 },
      // Under the node's content, and inside its box rather than around
      // it: the other half of the vocabulary.
      { kind: 'fill', color: 'rgba(34,211,238,0.25)', x: 4, y: 4, width: 16, height: 16, radius: 3 }
    ];
    const over: readonly DecorationShape[] = [
      { kind: 'stroke', color: '#f472b6', lineWidth: 3, outset: 0, after: 'children' }
    ];

    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('padding', 8);

    const scroll = h.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 80);
    scroll.setProperty('borderRadius', 10);
    scroll.setProperty('scrollY', 30);
    scroll.setProperty('backgroundColor', '#0f172a');
    for (let i = 0; i < 5; i++) {
      const row = box(h, `row${i}`, {
        width: 200,
        height: 40,
        flexShrink: 0,
        borderRadius: 6,
        backgroundColor: '#1e293b'
      });
      // The half-scrolled row: its ring must be clipped with it.
      if (i === 1) {
        row.decorations = ring;
      }
      h.append(scroll, row);
    }
    h.append(root, scroll);

    const stack = box(h, 'stack', { width: 200, height: 60 });
    const behind = box(h, 'behind', { width: 60, height: 60, backgroundColor: '#334155', zIndex: 1 });
    const front = box(h, 'front', { width: 60, height: 60, backgroundColor: '#64748b', zIndex: 3 });
    front.decorations = over;
    h.append(stack, front, behind);
    h.append(root, stack);

    const draws = expectParity(h, root);
    // The reordered child's own fill comes after its lower sibling's,
    // and its `after: 'children'` ring immediately after that.
    expect(draws.map(d => d.kind)).toEqual([
      'fill', // the scroller
      'fill', // row 0, scrolled above the viewport
      'fill', // row 1, the decorated one
      'border', // its ring, first in the modifier's list
      'fill', // and the fill behind its content, second
      'fill', // row 2
      'fill', // the lower sibling of the reordered pair
      'fill', // the reordered child, painted after it
      'border' // and its ring, after its children rather than before
    ]);
    // The ring is the row's box grown by the outset on all four sides,
    // and cut off by the scroller's viewport — the whole point of a
    // decoration being painted inside the node's pass.
    const drawnRing = draws[3];
    expect({
      x: drawnRing.x,
      y: drawnRing.y,
      width: drawnRing.width,
      height: drawnRing.height
    }).toEqual({
      x: 4,
      y: 14,
      width: 208,
      height: 48
    });
    expect(drawnRing.clip).toEqual({ x: 8, y: 8, width: 200, height: 80 });
    // The reordered child's own ring is not clipped by anything.
    expect(draws[8].clip).toBeNull();
  });

  /**
   * Gradients (`ROADMAP.md` F9). The two backends could not be further
   * apart in how they hold one: Canvas2D asks the platform for a
   * `CanvasGradient` and WebGPU evaluates a ramp per pixel out of a
   * storage buffer. So what is compared is the gradient itself: its
   * line in the box's own coordinates, and the colour at each point
   * along it. The tree covers what the two could disagree about: the
   * axis a linear gradient runs along, a diagonal whose line has to be
   * lengthened, a gradient over a colour and under an image, one on a
   * rounded box inside a rounded clip, offsets in pixels and in
   * percentages against three stops, and a radial gradient off centre.
   */
  it('linear and radial gradients on boxes, clips and colours', () => {
    const h = new RenderHarness(600, 400);
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('padding', 8);
    root.setProperty('gap', 6);

    h.append(
      root,
      box(h, 'down', {
        width: 120,
        height: 40,
        backgroundGradient: linearGradient(Math.PI, [{ color: '#0ea5e9' }, { color: '#1e293b' }])
      })
    );
    h.append(
      root,
      box(h, 'across', {
        width: 120,
        height: 40,
        borderRadius: 8,
        backgroundGradient: linearGradient(Math.PI / 2, [{ color: '#f43f5e' }, { color: '#facc15' }])
      })
    );
    h.append(
      root,
      box(h, 'diagonal', {
        width: 90,
        height: 90,
        // A gradient over a solid colour and under an image, which is
        // the order CSS paints a background in.
        backgroundColor: '#111827',
        image: { width: 40, height: 20 } as ImageBitmap,
        objectFit: 'contain',
        backgroundGradient: linearGradient(Math.PI / 4, [
          { offset: 0, color: '#22d3ee' },
          { offset: 30, color: '#a855f7' },
          { offset: percent(100), color: '#f97316' }
        ])
      })
    );

    const card = box(h, 'card', { width: 140, height: 70, overflow: 'hidden', borderRadius: 12 });
    h.append(
      card,
      box(h, 'inner', {
        width: 200,
        height: 200,
        flexShrink: 0,
        borderRadius: 6,
        backgroundGradient: radialGradient(
          [
            { offset: percent(0), color: '#ffffff' },
            { offset: percent(70), color: '#38bdf8' },
            { offset: percent(100), color: '#0f172a' }
          ],
          { centerX: percent(25), centerY: 10, radius: 60 }
        )
      })
    );
    h.append(root, card);

    const draws = expectParity(h, root, Constraints.tight(600, 400));
    expect(draws.map(d => d.kind)).toEqual(['fill', 'fill', 'fill', 'fill', 'image', 'fill']);
    // The vertical gradient's line runs the height of the box, top to
    // bottom, and its stops are the ends of it.
    expect(draws[0].color).toBe('linear(60,0,60,40)[0:0.055,0.647,0.914,1 1:0.118,0.161,0.231,1]');
    // The radial one keeps the centre and radius it was given.
    expect(draws[5].color).toMatch(/^radial\(50,10,60\)\[0:1,1,1,1 0\.7:/);
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

  it('a subtree moved by a translation, with a pivot transform under it', () => {
    // The two pairs must not be confused: `translateX/Y` moves the
    // node, `x/y` moves where it turns. A node carrying both proves
    // both backends compose them in the same order.
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const slid = box(h, 'slid', {
      width: 120,
      height: 60,
      backgroundColor: '#f00',
      transform: { translateX: 40, translateY: -25 }
    });
    h.append(
      slid,
      box(h, 'spun', {
        width: 40,
        height: 40,
        backgroundColor: '#0f0',
        transform: { x: 20, y: 20, rotation: Math.PI / 4, translateX: 8 }
      })
    );
    h.append(root, slid);
    expectParity(h, root);
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

  /**
   * A painted node draws one picture, and both backends draw the same
   * one, because there is one per node in the process. What the gate
   * checks is therefore everything else a backend could still get
   * wrong on its own: the box the picture lands in, where it sits in
   * paint order among the node's own background, border and children,
   * the clip in force, and the opacity it inherited.
   *
   * See `decisions/0078` for why the picture is shared rather than
   * replayed twice, and `PaintPicture.budget.spec.ts` for the assertion
   * that the second backend repaints nothing.
   */
  const SPARKLINE: UiPaint = {
    draw(surface, box) {
      surface.beginPath();
      surface.moveTo(0, box.height);
      for (let i = 1; i <= 8; i++) {
        surface.lineTo((box.width * i) / 8, box.height * (i % 2 === 0 ? 0.2 : 0.8));
      }
      surface.strokeColor('#0088ff');
      surface.lineWidth(1.5);
      surface.lineCap('round');
      surface.stroke();
    },
    inputs: [1]
  };

  const LOGO: UiPath = {
    d: 'M12 2 A10 10 0 1 1 11.99 2 Z M7 12 L11 16 L17 8',
    viewBox: 24,
    fill: '#223344',
    fillRule: 'evenodd',
    stroke: '#ffffff',
    strokeWidth: 2,
    lineCap: 'round',
    lineJoin: 'round'
  };

  function painted(h: RenderHarness, id: string, props: Record<string, unknown>): UiNode {
    return box(h, id, props, UiNodeType.Paint);
  }

  it('a painted node, between its own background and its border', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    h.append(
      root,
      painted(h, 'spark', {
        width: 200,
        height: 48,
        backgroundColor: '#f4f4f5',
        borderWidth: 1,
        borderColor: '#d4d4d8',
        paint: SPARKLINE
      })
    );
    const draws = expectParity(h, root);
    expect(draws.map(d => d.kind)).toEqual(['fill', 'image', 'border']);
    expect(draws[1]).toMatchObject({ x: 0, y: 0, width: 200, height: 48 });
  });

  it('a static path node beside a painted one', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Row);
    root.setProperty('gap', 8);
    h.append(
      root,
      painted(h, 'logo', { width: 32, height: 32, path: LOGO }),
      painted(h, 'spark', { width: 120, height: 32, paint: SPARKLINE })
    );
    const draws = expectParity(h, root);
    expect(draws.map(d => d.kind)).toEqual(['image', 'image']);
  });

  it('a painted node under an opacity, a transform and a rounded clip', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const clipper = box(h, 'clipper', {
      width: 160,
      height: 80,
      overflow: 'hidden',
      borderRadius: 12,
      backgroundColor: '#101014'
    });
    h.append(
      clipper,
      painted(h, 'gauge', {
        width: 220,
        height: 60,
        opacity: 0.6,
        transform: { translateX: 10, scaleX: 1.25 },
        paint: SPARKLINE
      })
    );
    h.append(root, clipper);
    const draws = expectParity(h, root);
    const picture = draws.find(d => d.kind === 'image')!;
    expect(picture.opacity).toBe(0.6);
    expect(picture.clip).not.toBeNull();
  });

  it('a painted node with children stacked over its picture', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const gauge = painted(h, 'gauge', { width: 100, height: 100, paint: SPARKLINE, x: 'center', y: 'center' });
    h.append(gauge, box(h, 'label', { text: '72%', fontSize: 14, color: '#111' }, UiNodeType.Text));
    h.append(root, gauge);
    const draws = expectParity(h, root);
    expect(draws.map(d => d.kind)).toEqual(['image', 'text']);
  });

  it('painted nodes in a scrolled list, clipped and culled alike', () => {
    const h = new RenderHarness();
    const list = h.createNode('list', UiNodeType.ScrollView);
    list.setProperty('width', 240);
    list.setProperty('height', 120);
    list.setProperty('scrollY', 30);
    for (let i = 0; i < 8; i++) {
      h.append(list, painted(h, `row${i}`, { width: 240, height: 40, flexShrink: 0, paint: SPARKLINE }));
    }
    const draws = expectParity(h, list, Constraints.tight(240, 120));
    expect(draws.filter(d => d.kind === 'image').length).toBeGreaterThan(0);
  });
});
