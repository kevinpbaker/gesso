import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../../graph/UiNodeType';
import type { UiNode } from '../../graph/UiNode';
import { Constraints } from '../../layout/LayoutTypes';
import { RenderHarness } from '../RenderTestUtils';
import { buildRenderList, INSTANCE_STRIDE_FLOATS, PrimitiveKind } from './WebGPURenderData';

function box(h: RenderHarness, id: string, props: Record<string, unknown>): UiNode {
  const node = h.createNode(id, UiNodeType.Box);
  for (const [key, value] of Object.entries(props)) {
    node.setProperty(key, value);
  }
  return node;
}

function layoutAndBuild(h: RenderHarness, root: UiNode) {
  h.layout(root);
  return buildRenderList(root, h.engine, h.surface.logicalWidth, h.surface.logicalHeight, h.surface.dpr);
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
    ] as [number, number, number, number, number, number]
  };
}

describe('buildRenderList geometry', () => {
  it('emits nothing for an empty tree', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    h.layout(root);
    const list = buildRenderList(root, h.engine, h.surface.logicalWidth, h.surface.logicalHeight, h.surface.dpr);
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
    const first = buildRenderList(root, h.engine, 800, 600, 1);
    const second = buildRenderList(root, h.engine, 800, 600, 1);
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
    const list = buildRenderList(scroll, h.engine, 800, 600, 1);
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
    const list = buildRenderList(scroll, h.engine, 800, 600, 2);
    const command = list.commands[0];
    expect(command.scissor).toEqual({ x: 0, y: 0, width: 400, height: 200 });
  });
});

describe('buildRenderList transforms', () => {
  it('includes the layout position in the transform', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    root.setProperty('padding', 10);
    const node = box(h, 'box', { width: 50, height: 50, backgroundColor: '#f00' });
    h.graph.appendChild(root, node);
    const list = layoutAndBuild(h, root);
    const inst = readInstance(list, 0);
    expect(inst.transform[0]).toBe(1);
    expect(inst.transform[3]).toBe(1);
    expect(inst.transform[4]).toBe(10);
    expect(inst.transform[5]).toBe(10);
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

  it('does not double-count parent positions in nested transforms', () => {
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
    const outerTx = readInstance(list, 0).transform[4];
    const innerTx = readInstance(list, 1).transform[4];
    const outerTy = readInstance(list, 0).transform[5];
    const innerTy = readInstance(list, 1).transform[5];
    expect(outerTx).toBe(10);
    expect(outerTy).toBe(10);
    expect(innerTx).toBe(30);
    expect(innerTy).toBe(25);
  });
});

describe('buildRenderList text', () => {
  it('collects text items instead of emitting placeholder instances', () => {
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
    expect(list.textItems).toHaveLength(1);
    expect(list.textItems[0].text).toBe('Hello');
    expect(list.textItems[0].fontSize).toBe(14);
    expect(list.textItems[0].textColor).toBe('#123456');
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
    const list = buildRenderList(scroll, h.engine, 800, 600, 1);
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
    const list = buildRenderList(scroll, h.engine, 800, 600, 1);
    expect(list.commands.length).toBeGreaterThan(0);
    expect(list.commands[0].scissor).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });
});
