import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../../graph/UiNodeType';
import type { UiNode } from '../../graph/UiNode';
import { Constraints } from '../../layout/LayoutTypes';
import { callArgs, callNames, RenderHarness, savedDepth } from '../RenderTestUtils';

function box(harness: RenderHarness, id: string, props: Record<string, unknown>): UiNode {
  const node = harness.createNode(id, UiNodeType.Box);
  for (const [key, value] of Object.entries(props)) {
    node.setProperty(key, value);
  }
  return node;
}

describe('Canvas2DRenderer basic rendering', () => {
  it('renders nothing but the clear on an empty tree', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    h.layout(root);
    h.render(root);
    expect(callNames(h.context)).toEqual(['setTransform', 'clearRect']);
  });

  it('fills a single rectangle with its background color', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const node = box(h, 'box', { width: 100, height: 50, backgroundColor: '#f00' });
    h.append(root, node);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'fillRect')).toEqual([[0, 0, 100, 50]]);
    expect(callArgs(h.context, 'set:fillStyle')).toEqual(['#f00']);
  });

  it('honors padding from layout output', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('padding', 10);
    const node = box(h, 'box', { width: 100, height: 50, backgroundColor: '#f00' });
    h.append(root, node);
    h.layout(root);
    expect(h.box(node)).toEqual({ x: 10, y: 10, width: 100, height: 50 });
    h.render(root);
    expect(callArgs(h.context, 'fillRect')).toEqual([[10, 10, 100, 50]]);
  });

  it('renders multiple children in tree order', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const a = box(h, 'a', { width: 50, height: 50, backgroundColor: '#f00' });
    const b = box(h, 'b', { width: 50, height: 50, backgroundColor: '#0f0' });
    const c = box(h, 'c', { width: 50, height: 50, backgroundColor: '#00f' });
    h.append(root, a, b, c);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'fillRect')).toEqual([
      [0, 0, 50, 50],
      [0, 50, 50, 50],
      [0, 100, 50, 50]
    ]);
    expect(callArgs(h.context, 'set:fillStyle')).toEqual(['#f00', '#0f0', '#00f']);
  });

  it('renders nested children at absolute coordinates after their parent', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('padding', 10);
    const outer = box(h, 'outer', { width: 100, height: 100, backgroundColor: '#f00' });
    const inner = box(h, 'inner', { width: 50, height: 50, backgroundColor: '#00f' });
    h.append(outer, inner);
    h.append(root, outer);
    h.layout(root);
    h.render(root);
    expect(h.box(inner)).toEqual({ x: 10, y: 10, width: 50, height: 50 });
    expect(callArgs(h.context, 'fillRect')).toEqual([
      [10, 10, 100, 100],
      [10, 10, 50, 50]
    ]);
  });

  it('leaves transparent nodes unpainted', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const node = box(h, 'box', { width: 100, height: 50 });
    h.append(root, node);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'fillRect')).toEqual([]);
  });
});

describe('Canvas2DRenderer colors and borders', () => {
  it('strokes a border with the configured color and width', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const node = box(h, 'box', { width: 60, height: 40, borderWidth: 2, borderColor: '#00f' });
    h.append(root, node);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'strokeRect')).toEqual([[0, 0, 60, 40]]);
    expect(callArgs(h.context, 'set:strokeStyle')).toEqual(['#00f']);
    expect(callArgs(h.context, 'set:lineWidth')).toEqual([2]);
  });

  it('fills a rounded rectangle through a path when radius is set', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const node = box(h, 'box', { width: 40, height: 20, backgroundColor: '#f00', borderRadius: 8 });
    h.append(root, node);
    h.layout(root);
    h.render(root);
    const names = callNames(h.context);
    expect(names).toEqual([
      'setTransform',
      'clearRect',
      'set:fillStyle',
      'beginPath',
      'moveTo',
      'arcTo',
      'arcTo',
      'arcTo',
      'arcTo',
      'closePath',
      'fill'
    ]);
    expect(callArgs(h.context, 'moveTo')).toEqual([[8, 0]]);
  });

  it('clamps border radius to half the smaller dimension', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const node = box(h, 'box', { width: 40, height: 20, backgroundColor: '#f00', borderRadius: 100 });
    h.append(root, node);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'moveTo')).toEqual([[10, 0]]);
  });

  it('strokes a rounded border through a path', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const node = box(h, 'box', { width: 40, height: 20, borderWidth: 2, borderColor: '#000', borderRadius: 4 });
    h.append(root, node);
    h.layout(root);
    h.render(root);
    const names = callNames(h.context);
    expect(names).toContain('set:strokeStyle');
    expect(names).toContain('set:lineJoin');
    expect(names).toContain('moveTo');
    expect(names).toContain('stroke');
    expect(callArgs(h.context, 'set:lineJoin')).toEqual(['round']);
    expect(callArgs(h.context, 'set:lineWidth')).toEqual([2]);
  });

  it('skips borders without a width', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const node = box(h, 'box', { width: 60, height: 40, borderColor: '#00f' });
    h.append(root, node);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'strokeRect')).toEqual([]);
  });
});

describe('Canvas2DRenderer opacity', () => {
  it('applies node opacity through globalAlpha with balanced saves', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const node = box(h, 'box', { width: 50, height: 50, backgroundColor: '#f00', opacity: 0.5 });
    h.append(root, node);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'set:globalAlpha')).toEqual([0.5]);
    const calls = h.context.calls;
    const saveIndex = calls.findIndex(call => call.name === 'save');
    const restoreIndex = calls.findIndex(call => call.name === 'restore');
    expect(saveIndex).toBeGreaterThan(-1);
    expect(restoreIndex).toBeGreaterThan(saveIndex);
    expect(savedDepth(h.context)).toBe(0);
  });

  it('multiplies nested opacities', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const parent = box(h, 'parent', { width: 100, height: 100, opacity: 0.5 });
    const child = box(h, 'child', { width: 50, height: 50, backgroundColor: '#f00', opacity: 0.5 });
    h.append(parent, child);
    h.append(root, parent);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'set:globalAlpha')).toEqual([0.5, 0.25]);
  });

  it('skips an entirely transparent subtree', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const parent = box(h, 'parent', { width: 100, height: 100, opacity: 0 });
    const child = box(h, 'child', { width: 50, height: 50, backgroundColor: '#f00' });
    h.append(parent, child);
    h.append(root, parent);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'fillRect')).toEqual([]);
  });
});

describe('Canvas2DRenderer paint order', () => {
  it('paints background, then border, then children, then text', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const outer = box(h, 'outer', {
      width: 100,
      height: 80,
      backgroundColor: '#f00',
      borderWidth: 2,
      borderColor: '#0f0',
      text: 'T',
      fontSize: 10
    });
    const child = box(h, 'child', { width: 50, height: 50, backgroundColor: '#00f' });
    h.append(outer, child);
    h.append(root, outer);
    h.layout(root);
    h.render(root);

    const sequence = h.context.calls
      .filter(call => ['fillRect', 'strokeRect', 'fillText'].includes(call.name))
      .map(call => call.name);
    expect(sequence).toEqual(['fillRect', 'strokeRect', 'fillRect', 'fillText']);
    expect(callArgs(h.context, 'fillRect')).toEqual([
      [0, 0, 100, 80],
      [0, 0, 50, 50]
    ]);
    expect(callArgs(h.context, 'fillText')).toEqual([['T', 0, 0, 100]]);
  });
});

describe('Canvas2DRenderer scrolling and clipping', () => {
  function scrollHarness(scrollY: number) {
    const h = new RenderHarness();
    const scroll = h.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 100);
    scroll.setProperty('scrollY', scrollY);
    const a = box(h, 'a', { width: 40, height: 50, backgroundColor: '#aaa', flexShrink: 0 });
    const b = box(h, 'b', { width: 40, height: 50, backgroundColor: '#bbb', flexShrink: 0 });
    const c = box(h, 'c', { width: 40, height: 50, backgroundColor: '#ccc', flexShrink: 0 });
    h.append(scroll, a, b, c);
    h.layout(scroll, Constraints.loose(800, 600));
    return { h, scroll, a, b, c };
  }

  it('clips to the viewport and renders visible children at scroll zero', () => {
    const { h } = scrollHarness(0);
    h.render(h.graph.requireNode('scroll'));
    expect(callArgs(h.context, 'rect')).toEqual([[0, 0, 200, 100]]);
    expect(callArgs(h.context, 'clip').length).toBe(1);
    expect(callArgs(h.context, 'translate')).toEqual([[0, 0]]);
    expect(callArgs(h.context, 'fillRect')).toEqual([
      [0, 0, 40, 50],
      [0, 50, 40, 50]
    ]);
  });

  it('translates content while keeping child layout unchanged', () => {
    const { h } = scrollHarness(100);
    expect(h.box(h.graph.requireNode('a'))).toEqual({ x: 0, y: 0, width: 40, height: 50 });
    expect(h.box(h.graph.requireNode('b'))).toEqual({ x: 0, y: 50, width: 40, height: 50 });
    expect(h.box(h.graph.requireNode('c'))).toEqual({ x: 0, y: 100, width: 40, height: 50 });
    h.render(h.graph.requireNode('scroll'));
    // content height 150, viewport 100 → clamped to 50.
    expect(callArgs(h.context, 'translate')).toEqual([[0, -50]]);
    expect(callArgs(h.context, 'fillRect')).toEqual([
      [0, 50, 40, 50],
      [0, 100, 40, 50]
    ]);
  });

  it('clamps scroll offsets beyond the content edge', () => {
    const { h } = scrollHarness(500);
    h.render(h.graph.requireNode('scroll'));
    expect(callArgs(h.context, 'translate')).toEqual([[0, -50]]);
  });

  it('keeps partially visible children and culls fully outside ones', () => {
    const { h } = scrollHarness(40);
    h.render(h.graph.requireNode('scroll'));
    expect(callArgs(h.context, 'translate')).toEqual([[0, -40]]);
    expect(callArgs(h.context, 'fillRect')).toEqual([
      [0, 0, 40, 50],
      [0, 50, 40, 50],
      [0, 100, 40, 50]
    ]);
  });

  it('supports nested scroll containers', () => {
    const h = new RenderHarness();
    const outer = h.createNode('outer', UiNodeType.ScrollView);
    outer.setProperty('width', 300);
    outer.setProperty('height', 150);
    outer.setProperty('scrollY', 30);
    const inner = h.createNode('inner', UiNodeType.ScrollView);
    inner.setProperty('width', 100);
    inner.setProperty('height', 60);
    inner.setProperty('scrollY', 10);
    const g1 = box(h, 'g1', { width: 50, height: 100, backgroundColor: '#111' });
    const g2 = box(h, 'g2', { width: 50, height: 50, backgroundColor: '#222' });
    g1.setProperty('flexShrink', 0);
    g2.setProperty('flexShrink', 0);
    h.append(inner, g1, g2);
    // A tall sibling makes the outer content (60 + 160) overflow its 150
    // viewport so the outer scroll offset stays unclamped.
    const s = box(h, 's', { width: 50, height: 160, backgroundColor: '#333' });
    h.append(outer, inner, s);
    inner.setProperty('flexShrink', 0);
    s.setProperty('flexShrink', 0);
    h.layout(outer, Constraints.loose(800, 600));
    h.render(outer);

    expect(callArgs(h.context, 'rect')).toEqual([
      [0, 0, 300, 150],
      [0, 0, 100, 60]
    ]);
    expect(callArgs(h.context, 'translate')).toEqual([
      [0, -30],
      [0, -10]
    ]);
    // g2 sits at content y=100, outside the inner viewport window.
    expect(callArgs(h.context, 'fillRect')).toEqual([
      [0, 0, 50, 100],
      [0, 60, 50, 160]
    ]);
    expect(savedDepth(h.context)).toBe(0);
  });
});

describe('Canvas2DRenderer transforms', () => {
  it('translates around the node origin', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('padding', 10);
    const node = box(h, 'box', { width: 50, height: 50, backgroundColor: '#f00', transform: { x: 5, y: 3 } });
    h.append(root, node);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'translate')).toEqual([
      [15, 13],
      [-15, -13]
    ]);
    expect(callArgs(h.context, 'fillRect')).toEqual([[10, 10, 50, 50]]);
    expect(savedDepth(h.context)).toBe(0);
  });

  it('applies scale about the node origin', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('padding', 10);
    const node = box(h, 'box', { width: 50, height: 50, backgroundColor: '#f00', transform: { scaleX: 2 } });
    h.append(root, node);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'scale')).toEqual([[2, 1]]);
    expect(callArgs(h.context, 'translate')).toEqual([
      [10, 10],
      [-10, -10]
    ]);
  });

  it('applies rotation about the node origin', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('padding', 10);
    const node = box(h, 'box', { width: 50, height: 50, backgroundColor: '#f00', transform: { rotation: 0.5 } });
    h.append(root, node);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'rotate')).toEqual([[0.5]]);
  });

  it('composes nested transforms', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const outer = box(h, 'outer', { width: 100, height: 100, backgroundColor: '#f00', transform: { scaleX: 2 } });
    const inner = box(h, 'inner', { width: 50, height: 50, backgroundColor: '#00f', transform: { scaleY: 3 } });
    h.append(outer, inner);
    h.append(root, outer);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'scale')).toEqual([
      [2, 1],
      [1, 3]
    ]);
    expect(savedDepth(h.context)).toBe(0);
  });

  it('restores the transform before rendering siblings', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('padding', 10);
    const scaled = box(h, 'scaled', { width: 50, height: 50, backgroundColor: '#f00', transform: { scaleX: 2 } });
    const plain = box(h, 'plain', { width: 50, height: 50, backgroundColor: '#0f0' });
    h.append(root, scaled, plain);
    h.layout(root);
    h.render(root);
    const calls = h.context.calls;
    const plainStyle = calls.findIndex(call => call.name === 'set:fillStyle' && call.args[0] === '#0f0');
    expect(calls[plainStyle - 1].name).toBe('restore');
    expect(calls[plainStyle + 1].name).toBe('fillRect');
    expect(callArgs(h.context, 'fillRect')).toEqual([
      [10, 10, 50, 50],
      [10, 60, 50, 50]
    ]);
  });
});

describe('Canvas2DRenderer text', () => {
  it('draws text with the resolved style and measured box', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('padding', 10);
    const text = h.createNode('text', UiNodeType.Text);
    text.setProperty('text', 'Hello');
    text.setProperty('fontSize', 14);
    h.append(root, text);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'set:font')).toEqual(['normal 14px sans-serif']);
    expect(callArgs(h.context, 'set:fillStyle')).toEqual(['#000']);
    expect(callArgs(h.context, 'set:textBaseline')).toEqual(['top']);
    expect(callArgs(h.context, 'fillText')).toEqual([['Hello', 10, 10, 42]]);
  });

  it('centers text within a wider box', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('padding', 10);
    const text = h.createNode('text', UiNodeType.Text);
    text.setProperty('text', 'Hello');
    text.setProperty('fontSize', 14);
    text.setProperty('width', 100);
    text.setProperty('textAlign', 'center');
    h.append(root, text);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'fillText')).toEqual([['Hello', 39, 10, 100]]);
  });

  it('aligns text vertically within the box', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    root.setProperty('padding', 10);
    const text = h.createNode('text', UiNodeType.Text);
    text.setProperty('text', 'Hello');
    text.setProperty('fontSize', 14);
    text.setProperty('width', 100);
    text.setProperty('height', 50);
    text.setProperty('verticalAlign', 'middle');
    h.append(root, text);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'fillText')).toEqual([['Hello', 10, 26.6, 100]]);
  });
});

describe('Canvas2DRenderer device pixel ratio', () => {
  it('clears physical pixels and scales the drawing transform', () => {
    const h = new RenderHarness(800, 600, 2);
    const root = h.createNode('app', UiNodeType.Column);
    const node = box(h, 'box', { width: 10, height: 10, backgroundColor: '#f00' });
    h.append(root, node);
    h.layout(root);
    h.render(root);
    const first = h.context.calls.slice(0, 3);
    expect(first.map(call => call.name)).toEqual(['setTransform', 'clearRect', 'setTransform']);
    expect(first[0].args).toEqual([1, 0, 0, 1, 0, 0]);
    expect(first[1].args).toEqual([0, 0, 1600, 1200]);
    expect(first[2].args).toEqual([2, 0, 0, 2, 0, 0]);
  });
});

describe('Canvas2DRenderer culling', () => {
  it('skips subtrees entirely outside the viewport', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const offscreen = box(h, 'offscreen', { width: 50, height: 50, backgroundColor: '#f00', marginTop: 700 });
    h.append(root, offscreen);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'fillRect')).toEqual([]);
  });

  it('skips invisible subtrees', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const hidden = box(h, 'hidden', { width: 100, height: 100, visible: false });
    const child = box(h, 'child', { width: 50, height: 50, backgroundColor: '#f00' });
    h.append(hidden, child);
    h.append(root, hidden);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'fillRect')).toEqual([]);
  });
});

describe('Canvas2DRenderer images', () => {
  it('draws an image into the box with object-fit', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const image = { width: 100, height: 50 } as ImageBitmap;
    const node = box(h, 'node', { width: 100, height: 100, image, objectFit: 'contain' });
    h.append(root, node);
    h.layout(root);
    h.render(root);
    const draws = callArgs(h.context, 'drawImage');
    expect(draws).toHaveLength(1);
    expect(draws[0][0]).toBe(image);
    expect(draws[0].slice(1)).toEqual([0, 25, 100, 50]);
  });

  it('draws nothing without an image', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const node = box(h, 'node', { width: 100, height: 100 });
    h.append(root, node);
    h.layout(root);
    h.render(root);
    expect(callArgs(h.context, 'drawImage')).toEqual([]);
  });
});
