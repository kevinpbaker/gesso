import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../../graph/UiNodeType';
import type { UiNode } from '../../graph/UiNode';
import { Constraints } from '../../layout/LayoutTypes';
import { RenderHarness } from '../RenderTestUtils';
import {
  buildRenderList,
  createTextCache,
  textRuns,
  glyphCount,
  viewportScissor,
  CLIP_STRIDE_FLOATS,
  CommandKind,
  INSTANCE_STRIDE_FLOATS,
  TEXTURED_STRIDE_FLOATS,
  PrimitiveKind,
  type ImageCommand,
  type PrimitiveCommand,
  type GlyphCommand
} from './WebGPURenderData';
import { WebGPUSurface, toPhysicalPixels } from './WebGPUSurface';

function box(h: RenderHarness, id: string, props: Record<string, unknown>): UiNode {
  const node = h.createNode(id, UiNodeType.Box);
  for (const [key, value] of Object.entries(props)) {
    node.setProperty(key, value);
  }
  return node;
}

function layoutAndBuild(h: RenderHarness, root: UiNode, cache = createTextCache()) {
  h.layout(root);
  return buildRenderList(
    root,
    h.engine,
    h.measurer,
    h.surface.logicalWidth,
    h.surface.logicalHeight,
    h.surface.dpr,
    undefined,
    undefined,
    cache
  );
}

function readInstance(list: ReturnType<typeof buildRenderList>, index: number) {
  const offset = index * INSTANCE_STRIDE_FLOATS;
  const data = list.instanceData;
  return {
    x: data[offset + 0],
    y: data[offset + 1],
    width: data[offset + 2],
    height: data[offset + 3],
    color: {
      r: data[offset + 4],
      g: data[offset + 5],
      b: data[offset + 6],
      a: data[offset + 7]
    },
    radius: data[offset + 8],
    opacity: data[offset + 9],
    borderWidth: data[offset + 10],
    kind: data[offset + 11],
    transform: [
      data[offset + 12],
      data[offset + 13],
      data[offset + 14],
      data[offset + 15],
      data[offset + 16],
      data[offset + 17]
    ] as [number, number, number, number, number, number],
    clipIndex: data[offset + 18]
  };
}

/** A node of the clip chain: box, radius, parent link and inverse transform. */
function readClip(list: ReturnType<typeof buildRenderList>, index: number) {
  const o = index * CLIP_STRIDE_FLOATS;
  const d = list.clipData;
  return {
    x: d[o],
    y: d[o + 1],
    width: d[o + 2],
    height: d[o + 3],
    radius: d[o + 4],
    parent: d[o + 5],
    inverse: [d[o + 8], d[o + 9], d[o + 10], d[o + 11], d[o + 12], d[o + 13]] as [
      number,
      number,
      number,
      number,
      number,
      number
    ]
  };
}

/** Screen-space box of a primitive instance: its rectangle through its transform. */
function screenBox(list: ReturnType<typeof buildRenderList>, index: number) {
  const inst = readInstance(list, index);
  const t = inst.transform;
  return {
    x: inst.x * t[0] + inst.y * t[2] + t[4],
    y: inst.x * t[1] + inst.y * t[3] + t[5],
    width: inst.width * t[0],
    height: inst.height * t[3]
  };
}

function primitiveCommands(list: ReturnType<typeof buildRenderList>): PrimitiveCommand[] {
  return list.commands.filter((c): c is PrimitiveCommand => c.kind === CommandKind.Primitives);
}

describe('buildRenderList geometry', () => {
  it('emits nothing for an empty tree', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    h.layout(root);
    const list = buildRenderList(
      root,
      h.engine,
      h.measurer,
      h.surface.logicalWidth,
      h.surface.logicalHeight,
      h.surface.dpr
    );
    expect(list.instanceCount).toBe(0);
    expect(list.commands).toHaveLength(0);
  });

  it('emits one fill instance for a colored box', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const node = box(h, 'box', { width: 100, height: 50, backgroundColor: '#f00' });
    h.graph.appendChild(root, node);
    const list = layoutAndBuild(h, root);
    expect(list.instanceCount).toBe(1);
    const inst = readInstance(list, 0);
    expect(inst.x).toBe(0);
    expect(inst.y).toBe(0);
    expect(inst.width).toBe(100);
    expect(inst.height).toBe(50);
    expect(inst.color.r).toBe(1);
    expect(inst.kind).toBe(PrimitiveKind.Fill);
  });

  it('emits background then border for a bordered box', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const node = box(h, 'box', {
      width: 100,
      height: 50,
      backgroundColor: '#f00',
      borderWidth: 2,
      borderColor: '#00f'
    });
    h.graph.appendChild(root, node);
    const list = layoutAndBuild(h, root);
    expect(list.instanceCount).toBe(2);
    expect(readInstance(list, 0).kind).toBe(PrimitiveKind.Fill);
    expect(readInstance(list, 1).kind).toBe(PrimitiveKind.Border);
    expect(readInstance(list, 1).borderWidth).toBe(2);
  });

  it('honors padding from layout output', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    root.setProperty('padding', 10);
    const node = box(h, 'box', { width: 100, height: 50, backgroundColor: '#f00' });
    h.graph.appendChild(root, node);
    const list = layoutAndBuild(h, root);
    const inst = readInstance(list, 0);
    expect(inst.x).toBe(10);
    expect(inst.y).toBe(10);
  });

  it('produces identical instance data across repeated builds', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const node = box(h, 'box', { width: 100, height: 50, backgroundColor: '#f00' });
    h.graph.appendChild(root, node);
    h.layout(root);
    const first = buildRenderList(root, h.engine, h.measurer, 800, 600, 1);
    const second = buildRenderList(root, h.engine, h.measurer, 800, 600, 1);
    expect(first.instanceCount).toBe(second.instanceCount);
    for (let i = 0; i < first.instanceData.length; i++) {
      expect(first.instanceData[i]).toBe(second.instanceData[i]);
    }
  });

  it('renders children in tree order', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const a = box(h, 'a', { width: 50, height: 50, backgroundColor: '#f00' });
    const b = box(h, 'b', { width: 50, height: 50, backgroundColor: '#0f0' });
    h.graph.appendChild(root, a);
    h.graph.appendChild(root, b);
    const list = layoutAndBuild(h, root);
    expect(list.instanceCount).toBe(2);
    expect(readInstance(list, 0).y).toBe(0);
    expect(readInstance(list, 1).y).toBe(50);
  });

  it('renders nested children at absolute coordinates', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    root.setProperty('padding', 10);
    const outer = box(h, 'outer', { width: 100, height: 100, backgroundColor: '#f00' });
    const inner = box(h, 'inner', { width: 50, height: 50, backgroundColor: '#00f' });
    h.graph.appendChild(outer, inner);
    h.graph.appendChild(root, outer);
    const list = layoutAndBuild(h, root);
    expect(list.instanceCount).toBe(2);
    expect(readInstance(list, 0)).toMatchObject({ x: 10, y: 10, width: 100, height: 100 });
    expect(readInstance(list, 1)).toMatchObject({ x: 10, y: 10, width: 50, height: 50 });
  });

  it('skips transparent and invisible nodes', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const hidden = box(h, 'hidden', { width: 100, height: 100, visible: false });
    const transparent = box(h, 'transparent', { width: 100, height: 100, opacity: 0 });
    h.graph.appendChild(root, hidden);
    h.graph.appendChild(root, transparent);
    const list = layoutAndBuild(h, root);
    expect(list.instanceCount).toBe(0);
  });
});

describe('buildRenderList opacity', () => {
  it('applies node opacity', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const node = box(h, 'box', { width: 50, height: 50, backgroundColor: '#f00', opacity: 0.5 });
    h.graph.appendChild(root, node);
    const list = layoutAndBuild(h, root);
    expect(readInstance(list, 0).opacity).toBe(0.5);
  });

  it('multiplies nested opacities', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const parent = box(h, 'parent', { width: 100, height: 100, backgroundColor: '#00f', opacity: 0.5 });
    const child = box(h, 'child', { width: 50, height: 50, backgroundColor: '#f00', opacity: 0.5 });
    h.graph.appendChild(parent, child);
    h.graph.appendChild(root, parent);
    const list = layoutAndBuild(h, root);
    expect(readInstance(list, 0).opacity).toBe(0.5);
    expect(readInstance(list, 1).opacity).toBe(0.25);
  });
});

describe('buildRenderList clipping', () => {
  it('creates a scissor command for a scroll view', () => {
    const h = new RenderHarness();
    const scroll = h.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 100);
    const a = box(h, 'a', { width: 40, height: 50, backgroundColor: '#aaa', flexShrink: 0 });
    const b = box(h, 'b', { width: 40, height: 50, backgroundColor: '#bbb', flexShrink: 0 });
    h.graph.appendChild(scroll, a);
    h.graph.appendChild(scroll, b);
    h.layout(scroll, Constraints.loose(800, 600));
    const list = buildRenderList(scroll, h.engine, h.measurer, 800, 600, 1);
    expect(list.commands.length).toBeGreaterThan(0);
    const command = list.commands[0];
    expect(command.scissor).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it('applies device pixel ratio to scissor', () => {
    const h = new RenderHarness(800, 600, 2);
    const scroll = h.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 100);
    const child = box(h, 'a', { width: 40, height: 50, backgroundColor: '#aaa', flexShrink: 0 });
    h.graph.appendChild(scroll, child);
    h.layout(scroll, Constraints.loose(800, 600));
    const list = buildRenderList(scroll, h.engine, h.measurer, 800, 600, 2);
    const command = list.commands[0];
    expect(command.scissor).toEqual({ x: 0, y: 0, width: 400, height: 200 });
  });
});

describe('buildRenderList transforms', () => {
  it('keeps the layout position on the instance, not in the transform', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    root.setProperty('padding', 10);
    const node = box(h, 'box', { width: 50, height: 50, backgroundColor: '#f00' });
    h.graph.appendChild(root, node);
    const list = layoutAndBuild(h, root);
    const inst = readInstance(list, 0);
    expect(inst.x).toBe(10);
    expect(inst.y).toBe(10);
    expect(inst.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(screenBox(list, 0)).toEqual({ x: 10, y: 10, width: 50, height: 50 });
  });

  it('encodes a scale transform', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const node = box(h, 'box', { width: 50, height: 50, backgroundColor: '#f00', transform: { scaleX: 2 } });
    h.graph.appendChild(root, node);
    const list = layoutAndBuild(h, root);
    const inst = readInstance(list, 0);
    expect(inst.transform[0]).toBe(2);
    expect(inst.transform[3]).toBe(1);
  });

  it('does not double-count parent positions in nested boxes', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    root.setProperty('padding', 10);
    const outer = h.createNode('outer', UiNodeType.Column);
    outer.setProperty('width', 100);
    outer.setProperty('height', 100);
    outer.setProperty('backgroundColor', '#f00');
    const inner = box(h, 'inner', { width: 50, height: 50, backgroundColor: '#00f' });
    inner.setProperty('marginLeft', 20);
    inner.setProperty('marginTop', 15);
    h.graph.appendChild(outer, inner);
    h.graph.appendChild(root, outer);
    const list = layoutAndBuild(h, root);
    expect(screenBox(list, 0)).toMatchObject({ x: 10, y: 10 });
    expect(screenBox(list, 1)).toMatchObject({ x: 30, y: 25 });
  });

  it('scales about the node origin like the Canvas2D renderer', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    root.setProperty('padding', 10);
    const node = box(h, 'box', { width: 50, height: 50, backgroundColor: '#f00', transform: { scaleX: 2 } });
    h.graph.appendChild(root, node);
    const list = layoutAndBuild(h, root);
    // Canvas2D: translate(10,10) scale(2,1) translate(-10,-10) → the box
    // keeps its left edge at 10 and doubles its width.
    expect(screenBox(list, 0)).toEqual({ x: 10, y: 10, width: 100, height: 50 });
  });
});

describe('buildRenderList text', () => {
  it('collects a text command in paint order instead of a primitive', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const node = box(h, 'label', {
      width: 100,
      height: 30,
      text: 'Hello',
      fontSize: 14,
      color: '#123456'
    });
    h.graph.appendChild(root, node);
    const list = layoutAndBuild(h, root);
    expect(list.instanceCount).toBe(0);
    // One textured instance per inked cluster, not one per run.
    expect(list.texturedCount).toBe(5);
    expect(glyphCount(list)).toBe(5);
    const runs = textRuns(list);
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('Hello');
    expect(runs[0].glyphs).toBe(5);
    expect(runs[0].font).toBe('normal 14px sans-serif');
    expect(runs[0].color).toBe('#123456');
    // The five glyphs share a page and a scissor, so they are one draw.
    expect(list.commands).toHaveLength(1);
    expect(list.commands[0]).toMatchObject({ kind: CommandKind.Glyphs, start: 0, end: 5, page: 0 });
  });

  it('emits no instance for a blank cluster, but still records the run', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const node = box(h, 'label', { width: 200, height: 30, text: 'a b', fontSize: 14, textWrap: 'none' });
    h.graph.appendChild(root, node);
    const list = layoutAndBuild(h, root);
    expect(glyphCount(list)).toBe(2);
    expect(textRuns(list)[0]).toMatchObject({ text: 'a b', glyphs: 2 });
  });

  it('sizes each instance to its glyph cell, not to the run or the box', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    // A cell is one cluster's advance plus its side bearings, so every
    // instance is far narrower than either the run or the 300-wide box.
    const node = box(h, 'label', { width: 300, height: 100, text: 'Hello', fontSize: 10, textWrap: 'none' });
    h.graph.appendChild(root, node);
    const list = layoutAndBuild(h, root);
    const [run] = textRuns(list);
    const advance = run.width / 'Hello'.length;
    for (let i = 0; i < list.texturedCount; i++) {
      const offset = i * TEXTURED_STRIDE_FLOATS;
      expect(list.texturedData[offset + 2]).toBeGreaterThan(advance);
      expect(list.texturedData[offset + 2]).toBeLessThan(run.width);
      // The cell samples a sub-rectangle of its page, never all of it.
      expect(list.texturedData[offset + 14]).toBeLessThan(1);
      expect(list.texturedData[offset + 15]).toBeLessThan(1);
    }
  });

  it('draws text that overflows a tight box, as Canvas2D does', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const node = box(h, 'label', { width: 20, height: 12, text: 'Overflowing', fontSize: 10, textWrap: 'none' });
    h.graph.appendChild(root, node);
    const list = layoutAndBuild(h, root);
    const [run] = textRuns(list);
    expect(run.width).toBeGreaterThan(20);
    const command = list.commands.find((c): c is GlyphCommand => c.kind === CommandKind.Glyphs)!;
    expect(command.end - command.start).toBe('Overflowing'.length);
    // The last glyph starts past the box's right edge; the box does not
    // clip it, as Canvas2D does not either.
    const last = (command.end - 1) * TEXTURED_STRIDE_FLOATS;
    expect(list.texturedData[last]).toBeGreaterThan(20);
  });

  it('keeps the same texture key while the run moves', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    root.setProperty('padding', 0);
    const node = box(h, 'label', { width: 100, height: 30, text: 'Hello', fontSize: 14 });
    h.graph.appendChild(root, node);
    const cache = createTextCache();
    layoutAndBuild(h, root, cache);
    const before = cache.atlas.glyphCount;
    // At most one cell per cluster: 'Hello' has four distinct letters,
    // and the two l's differ only if they fall on different phases.
    expect(before).toBeLessThanOrEqual(5);
    root.setProperty('padding', 37);
    node.setProperty('verticalAlign', 'bottom');
    layoutAndBuild(h, root, cache);
    // Moving a run by a whole number of pixels re-uses every cell: a
    // cell's pixels depend on the cluster, the font, the colour and the
    // subpixel phase, and none of those moved.
    expect(cache.atlas.glyphCount).toBe(before);
  });

  it('paints text above earlier siblings and below later ones', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Box);
    const label = box(h, 'label', { width: 100, height: 30, text: 'Under', fontSize: 14 });
    const cover = box(h, 'cover', { width: 100, height: 30, backgroundColor: '#fff' });
    h.graph.appendChild(root, label);
    h.graph.appendChild(root, cover);
    const list = layoutAndBuild(h, root);
    // Text is a command in the ordered list, not a pass after all fills:
    // the covering box's fill comes after it.
    expect(list.commands.map(c => c.kind)).toEqual([CommandKind.Glyphs, CommandKind.Primitives]);
  });
});

describe('buildRenderList scrolling', () => {
  it('translates scrolled children by the scroll offset', () => {
    const h = new RenderHarness();
    const scroll = h.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 100);
    scroll.setProperty('scrollY', 30);
    const child = box(h, 'child', { width: 200, height: 200, backgroundColor: '#aaa', flexShrink: 0 });
    h.graph.appendChild(scroll, child);
    h.layout(scroll, Constraints.loose(800, 600));
    const list = buildRenderList(scroll, h.engine, h.measurer, 800, 600, 1);
    const inst = readInstance(list, 0);
    expect(inst.transform[5]).toBe(-30);
  });

  it('keeps the scissor fixed at the scroll viewport while content scrolls', () => {
    const h = new RenderHarness();
    const scroll = h.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 100);
    scroll.setProperty('scrollY', 30);
    const child = box(h, 'child', { width: 200, height: 200, backgroundColor: '#aaa', flexShrink: 0 });
    h.graph.appendChild(scroll, child);
    h.layout(scroll, Constraints.loose(800, 600));
    const list = buildRenderList(scroll, h.engine, h.measurer, 800, 600, 1);
    expect(list.commands.length).toBeGreaterThan(0);
    expect(list.commands[0].scissor).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });
});

/**
 * Logical sizes and device pixel ratios that put the clip rect's
 * edges at awkward fractions of a physical pixel. The 1.3333333730697632
 * ratio is what a 4/3 browser zoom actually reports: a float32 value a
 * hair above 4/3, so `logical * dpr` lands just past an integer for
 * most sizes.
 */
const FRACTIONAL_DPRS = [1, 1.25, 1.3333333730697632, 1.5, 1.7999999523162842, 2, 2.625, 3];

describe('buildRenderList scissor bounds', () => {
  /**
   * Every scissor rectangle must fit inside the attachment. WebGPU
   * treats one that does not as a validation error and discards the
   * whole command buffer, so a single overflowing rectangle blanks the
   * entire frame — every other draw in it included — with nothing
   * drawn and no error thrown on the calling side.
   */
  function assertWithinAttachment(logicalWidth: number, logicalHeight: number, dpr: number): void {
    const h = new RenderHarness(logicalWidth, logicalHeight, dpr);
    // A scroll view larger than the viewport clips to the viewport's
    // own edges, which is the case that overflows: the far edge lands
    // exactly on the attachment boundary.
    const scroll = h.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', logicalWidth + 200);
    scroll.setProperty('height', logicalHeight + 200);
    const child = box(h, 'child', {
      width: 40,
      height: 50,
      backgroundColor: '#aaa',
      text: 'label',
      flexShrink: 0
    });
    h.graph.appendChild(scroll, child);
    h.layout(scroll, Constraints.loose(logicalWidth, logicalHeight));

    const list = buildRenderList(scroll, h.engine, h.measurer, logicalWidth, logicalHeight, dpr);
    const maxX = toPhysicalPixels(logicalWidth, dpr);
    const maxY = toPhysicalPixels(logicalHeight, dpr);

    const rects = [viewportScissor(logicalWidth, logicalHeight, dpr), ...list.commands.map(command => command.scissor)];

    const where = `${logicalWidth}x${logicalHeight}@${dpr}`;
    for (const rect of rects) {
      if (rect === null) {
        continue;
      }
      expect(rect.x, where).toBeGreaterThanOrEqual(0);
      expect(rect.y, where).toBeGreaterThanOrEqual(0);
      expect(rect.width, where).toBeGreaterThan(0);
      expect(rect.height, where).toBeGreaterThan(0);
      expect(rect.x + rect.width, where).toBeLessThanOrEqual(maxX);
      expect(rect.y + rect.height, where).toBeLessThanOrEqual(maxY);
    }
  }

  it('keeps every scissor inside the attachment for fractional sizes and dprs', () => {
    for (const dpr of FRACTIONAL_DPRS) {
      for (let width = 800; width < 804; width += 0.25) {
        for (let height = 600; height < 604; height += 0.25) {
          assertWithinAttachment(width, height, dpr);
        }
      }
    }
  });

  it('sizes the full-viewport scissor exactly like the backing store', () => {
    // The two were derived by different roundings — Math.ceil here,
    // Math.round there — which is what made the viewport-wide scissor
    // one pixel too tall and threw away the frame.
    for (const dpr of FRACTIONAL_DPRS) {
      for (let size = 700; size < 704; size += 0.125) {
        const host = { width: 0, height: 0, getContext: () => null };
        const surface = new WebGPUSurface(host);
        surface.setLogicalSize(size, size, dpr);
        expect(viewportScissor(size, size, dpr), `${size}@${dpr}`).toEqual({
          x: 0,
          y: 0,
          width: host.width,
          height: host.height
        });
      }
    }
  });
});

describe('buildRenderList fragments', () => {
  it('draws children that live under a Fragment', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const parent = box(h, 'parent', { width: 200, height: 200 });
    h.graph.appendChild(root, parent);
    const fragment = h.createNode('fragment', UiNodeType.Fragment);
    h.graph.appendChild(parent, fragment);
    const child = box(h, 'child', { width: 50, height: 50, backgroundColor: '#f00' });
    h.graph.appendChild(fragment, child);
    const list = layoutAndBuild(h, root);
    expect(list.instanceCount).toBe(1);
    expect(screenBox(list, 0)).toEqual({ x: 0, y: 0, width: 50, height: 50 });
  });

  it('draws nested fragments in tree order', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const outer = h.createNode('outer', UiNodeType.Fragment);
    const inner = h.createNode('inner', UiNodeType.Fragment);
    const a = box(h, 'a', { width: 50, height: 50, backgroundColor: '#f00' });
    const b = box(h, 'b', { width: 50, height: 50, backgroundColor: '#0f0' });
    h.graph.appendChild(root, outer);
    h.graph.appendChild(outer, inner);
    h.graph.appendChild(inner, a);
    h.graph.appendChild(outer, b);
    const list = layoutAndBuild(h, root);
    expect(list.instanceCount).toBe(2);
    expect(readInstance(list, 0).color.r).toBe(1);
    expect(readInstance(list, 1).color.g).toBe(1);
  });
});

describe('buildRenderList images', () => {
  it('emits an image command between the background and the border', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const image = { width: 100, height: 50 } as ImageBitmap;
    const node = box(h, 'node', {
      width: 100,
      height: 100,
      backgroundColor: '#eee',
      borderWidth: 1,
      borderColor: '#000',
      image,
      objectFit: 'contain'
    });
    h.graph.appendChild(root, node);
    const list = layoutAndBuild(h, root);
    expect(list.commands.map(c => c.kind)).toEqual([CommandKind.Primitives, CommandKind.Image, CommandKind.Primitives]);
    const command = list.commands[1] as ImageCommand;
    expect(command.source).toBe(image);
    // contain: 100x50 into 100x100 sits at y = 25.
    const offset = command.instance * TEXTURED_STRIDE_FLOATS;
    expect(Array.from(list.texturedData.slice(offset, offset + 4))).toEqual([0, 25, 100, 50]);
  });
});

describe('buildRenderList culling', () => {
  it('skips subtrees entirely outside the viewport', () => {
    const h = new RenderHarness(200, 100);
    const root = h.graph.root;
    const visible = box(h, 'visible', { width: 50, height: 50, backgroundColor: '#f00' });
    const offscreen = box(h, 'offscreen', {
      width: 50,
      height: 50,
      backgroundColor: '#0f0',
      position: 'absolute',
      left: 500,
      top: 500
    });
    const grandchild = box(h, 'grandchild', { width: 10, height: 10, backgroundColor: '#00f' });
    h.graph.appendChild(offscreen, grandchild);
    h.graph.appendChild(root, visible);
    h.graph.appendChild(root, offscreen);
    h.layout(root, Constraints.tight(200, 100));
    const list = buildRenderList(root, h.engine, h.measurer, 200, 100, 1);
    expect(list.instanceCount).toBe(1);
  });

  it('keeps the instance count proportional to the visible window of a long list', () => {
    const h = new RenderHarness(200, 100);
    const scroll = h.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 100);
    for (let i = 0; i < 2000; i++) {
      h.graph.appendChild(
        scroll,
        box(h, `row${i}`, { width: 200, height: 20, backgroundColor: '#ccc', flexShrink: 0 })
      );
    }
    for (const scrollY of [0, 10_000, 39_900]) {
      scroll.setProperty('scrollY', scrollY);
      h.layout(scroll, Constraints.loose(200, 100));
      const list = buildRenderList(scroll, h.engine, h.measurer, 200, 100, 1);
      expect(list.instanceCount, `scrollY ${scrollY}`).toBeLessThanOrEqual(7);
      expect(list.instanceCount, `scrollY ${scrollY}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('does not cull under a transform, where records no longer say where pixels land', () => {
    const h = new RenderHarness(200, 100);
    const root = h.graph.root;
    const moved = box(h, 'moved', {
      width: 50,
      height: 50,
      position: 'absolute',
      left: 500,
      top: 0,
      transform: { x: -500 }
    });
    const child = box(h, 'child', { width: 50, height: 50, backgroundColor: '#f00' });
    h.graph.appendChild(moved, child);
    h.graph.appendChild(root, moved);
    h.layout(root, Constraints.tight(200, 100));
    const list = buildRenderList(root, h.engine, h.measurer, 200, 100, 1);
    // The transformed parent itself is tested against its record and
    // culled the way Canvas2D culls it; this pins that its children
    // are not culled once inside the transform.
    expect(list.instanceCount).toBe(0);
    moved.setProperty('left', 150);
    h.layout(root, Constraints.tight(200, 100));
    const inside = buildRenderList(root, h.engine, h.measurer, 200, 100, 1);
    expect(inside.instanceCount).toBe(1);
  });
});

describe('buildRenderList rounded clipping', () => {
  it('hands descendants the innermost rounded clip through the chain', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    root.setProperty('padding', 10);
    const card = box(h, 'card', {
      width: 100,
      height: 60,
      overflow: 'hidden',
      borderRadius: 8,
      backgroundColor: '#eee'
    });
    const spill = box(h, 'spill', { width: 300, height: 300, backgroundColor: '#f00' });
    h.graph.appendChild(card, spill);
    h.graph.appendChild(root, card);
    const list = layoutAndBuild(h, root);
    // The card's own background is clipped by its ancestors only.
    expect(readInstance(list, 0).clipIndex).toBe(-1);
    const spillInstance = readInstance(list, 1);
    expect(spillInstance.clipIndex).toBe(0);
    expect(list.clipCount).toBe(1);
    expect(readClip(list, 0)).toEqual({
      x: 10,
      y: 10,
      width: 100,
      height: 60,
      radius: 8,
      parent: -1,
      inverse: [1, 0, 0, 1, 0, 0]
    });
    // The scissor still does the rectangular part.
    expect(primitiveCommands(list).at(-1)!.scissor).toEqual({ x: 10, y: 10, width: 100, height: 60 });
  });

  it('leaves instances unclipped when no rounded ancestor clips', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const card = box(h, 'card', { width: 100, height: 60, overflow: 'hidden' });
    const spill = box(h, 'spill', { width: 300, height: 300, backgroundColor: '#f00' });
    h.graph.appendChild(card, spill);
    h.graph.appendChild(root, card);
    const list = layoutAndBuild(h, root);
    expect(readInstance(list, 0).clipIndex).toBe(-1);
    expect(list.clipCount).toBe(0);
  });

  it('chains nested rounded clips so both apply', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const outer = box(h, 'outer', { width: 200, height: 200, overflow: 'hidden', borderRadius: 24 });
    const inner = box(h, 'inner', {
      width: 100,
      height: 100,
      overflow: 'hidden',
      borderRadius: 8,
      backgroundColor: '#eee'
    });
    const spill = box(h, 'spill', { width: 300, height: 300, backgroundColor: '#f00' });
    h.graph.appendChild(inner, spill);
    h.graph.appendChild(outer, inner);
    h.graph.appendChild(root, outer);
    const list = layoutAndBuild(h, root);
    expect(list.clipCount).toBe(2);
    // The inner card's background sits under the outer clip; its child
    // under the inner clip, whose parent is the outer.
    expect(readInstance(list, 0).clipIndex).toBe(0);
    expect(readInstance(list, 1).clipIndex).toBe(1);
    expect(readClip(list, 0)).toMatchObject({ radius: 24, parent: -1 });
    expect(readClip(list, 1)).toMatchObject({ radius: 8, parent: 0 });
  });

  it('inverts a scrolled and translated clip so the shader can test screen pixels', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    root.setProperty('padding', 20);
    const card = box(h, 'card', { width: 100, height: 60, overflow: 'scroll', borderRadius: 8, scrollY: 30 });
    const spill = box(h, 'spill', { width: 100, height: 300, backgroundColor: '#f00', flexShrink: 0 });
    h.graph.appendChild(card, spill);
    h.graph.appendChild(root, card);
    const list = layoutAndBuild(h, root);
    const inst = readInstance(list, 0);
    // The content is scrolled (drawn 30 up), the clip is not: its
    // inverse maps the screen back into the card's unscrolled space.
    expect(inst.transform[5]).toBe(-30);
    expect(readClip(list, inst.clipIndex)).toMatchObject({ x: 20, y: 20, width: 100, height: 60, radius: 8 });
    expect(readClip(list, inst.clipIndex).inverse).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('inverts a scaled ancestor so the clip is tested in its own space', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const card = box(h, 'card', {
      width: 100,
      height: 60,
      overflow: 'hidden',
      borderRadius: 8,
      transform: { scaleX: 2 }
    });
    const spill = box(h, 'spill', { width: 300, height: 300, backgroundColor: '#f00' });
    h.graph.appendChild(card, spill);
    h.graph.appendChild(root, card);
    const list = layoutAndBuild(h, root);
    const clip = readClip(list, 0);
    // Screen x = 2·local x, so the inverse halves it.
    expect(clip.inverse[0]).toBe(0.5);
    expect(clip.inverse[3]).toBe(1);
  });
});

describe('buildRenderList scrollbars and sticky', () => {
  it('places the scrollbar thumb at its own geometry, not the node origin', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    root.setProperty('padding', 10);
    const list = h.createNode('list', UiNodeType.Column);
    list.setProperty('width', 200);
    list.setProperty('height', 100);
    list.setProperty('overflow', 'scroll');
    list.setProperty('scrollY', 50);
    const tall = box(h, 'tall', { width: 20, height: 400, flexShrink: 0 });
    h.graph.appendChild(list, tall);
    h.graph.appendChild(root, list);
    h.layout(root);
    const until = h.record(list).scrollbarVisibleUntil;
    const rendered = buildRenderList(root, h.engine, h.measurer, 800, 600, 1, until - 1000);
    expect(rendered.instanceCount).toBe(1);
    const thumb = screenBox(rendered, 0);
    // Along the right edge of the 200-wide list at x = 10, below its top.
    expect(thumb.x).toBeGreaterThan(200);
    expect(thumb.x + thumb.width).toBeLessThanOrEqual(210);
    expect(thumb.y).toBeGreaterThan(10);
  });

  it('shifts a sticky node and its children by the sticky offset', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const scroll = h.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 100);
    scroll.setProperty('scrollY', 50);
    const header = box(h, 'header', {
      width: 200,
      height: 20,
      backgroundColor: '#f00',
      position: 'sticky',
      top: 0,
      flexShrink: 0
    });
    const body = box(h, 'body', { width: 200, height: 400, backgroundColor: '#0f0', flexShrink: 0 });
    h.graph.appendChild(scroll, header);
    h.graph.appendChild(scroll, body);
    h.graph.appendChild(root, scroll);
    h.layout(root);
    const list = layoutAndBuild(h, root);
    expect(h.record(header).stickyOffsetY).toBe(50);
    // Sticky nodes paint above their siblings, so find them by colour.
    const boxes = [0, 1].map(i => ({ ...screenBox(list, i), red: readInstance(list, i).color.r === 1 }));
    const headerBox = boxes.find(b => b.red)!;
    const bodyBox = boxes.find(b => !b.red)!;
    // Scrolled 50 up, stuck 50 down: the header stays at the top.
    expect(headerBox).toMatchObject({ x: 0, y: 0 });
    expect(bodyBox).toMatchObject({ y: -30 });
  });
});

describe('buildRenderList overlay', () => {
  it('appends inspector shapes after the scene: fills, inside-band strokes and a label', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    h.graph.appendChild(root, box(h, 'a', { width: 50, height: 50, backgroundColor: '#f00' }));
    h.layout(root);
    const list = buildRenderList(root, h.engine, h.measurer, 800, 600, 1, Number.MAX_SAFE_INTEGER, [
      { kind: 'fill', x: 10, y: 20, width: 30, height: 40, color: 'rgba(229, 83, 75, 0.35)' },
      { kind: 'stroke', x: 10, y: 20, width: 30, height: 40, color: 'rgba(76, 141, 255, 0.95)', lineWidth: 2 },
      {
        kind: 'label',
        box: { x: 10, y: 20, width: 30, height: 40 },
        text: "box 'a' 50×50",
        font: '10px monospace',
        fontSize: 10,
        fontFamily: 'monospace',
        textColor: '#e6edf3',
        background: 'rgba(13, 17, 23, 0.92)',
        height: 16
      }
    ]);
    // Scene fill, then overlay fill, stroke and label background; then the label text.
    expect(list.instanceCount).toBe(4);
    const fill = readInstance(list, 1);
    expect(screenBox(list, 1)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(fill.kind).toBe(PrimitiveKind.Fill);
    expect(fill.color.a).toBeCloseTo(0.35);
    expect(fill.clipIndex).toBe(-1);
    const stroke = readInstance(list, 2);
    expect(stroke.kind).toBe(PrimitiveKind.Border);
    expect(stroke.borderWidth).toBe(2);
    // The label sits above its box (y = 20 - 16), with 4px side padding.
    const label = screenBox(list, 3);
    expect(label.y).toBe(4);
    expect(label.x).toBe(10);
    const text = textRuns(list);
    expect(text).toHaveLength(1);
    expect(text[0].text).toBe("box 'a' 50×50");
    expect(list.commands.map(c => c.kind)).toEqual([
      CommandKind.Primitives,
      CommandKind.Primitives,
      CommandKind.Glyphs
    ]);
  });
});
