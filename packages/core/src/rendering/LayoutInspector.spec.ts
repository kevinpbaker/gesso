import { describe, expect, it } from 'vitest';

import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { LayoutHarness } from '../layout/LayoutTestUtils';
import { Constraints } from '../layout/LayoutTypes';
import { UiFrame } from '../scheduler/UiFrame';
import { INSPECTOR_HEAT_MS, INSPECTOR_HOT_MS, LayoutInspector } from './LayoutInspector';
import { RecordingCanvasContext } from './RenderTestUtils';

/**
 * The layout inspector (roadmap L8) paints two things over a frame: the
 * hovered node's boxes and a heatmap of what the recent layout passes
 * measured. These specs drive it against the real engine and a
 * recording context, and check that it draws where the records say.
 */
describe('LayoutInspector', () => {
  const VIEWPORT = Constraints.loose(400, 300);

  function node(h: LayoutHarness, id: string, type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const created = h.createNode(id, type);
    for (const [name, value] of Object.entries(props)) {
      created.setProperty(name, value);
    }
    return created;
  }

  function scene() {
    const h = new LayoutHarness();
    const page = node(h, 'page', UiNodeType.Column, { padding: 10 });
    const card = node(h, 'card', UiNodeType.Box, { width: 100, height: 50, padding: 5, marginTop: 8 });
    const label = node(h, 'label', UiNodeType.Text, { text: 'hi' });
    const scroller = node(h, 'scroller', UiNodeType.ScrollView, { height: 40 });
    const tall = node(h, 'tall', UiNodeType.Box, { height: 30 });
    const below = node(h, 'below', UiNodeType.Box, { height: 30 });
    h.append(card, label);
    h.append(scroller, tall, below);
    h.append(page, card, scroller);
    h.layout(page, VIEWPORT);
    return { h, page, card, label, scroller, tall, below };
  }

  function rects(ctx: RecordingCanvasContext, name: 'fillRect' | 'strokeRect'): number[][] {
    return ctx.calls.filter(call => call.name === name).map(call => call.args as number[]);
  }

  it('is off by default and paints nothing while off', () => {
    const { h } = scene();
    const inspector = new LayoutInspector(h.engine);
    const ctx = new RecordingCanvasContext();

    expect(inspector.isEnabled).toBe(false);
    expect(h.engine.trace).toBe(false);
    expect(inspector.paint(ctx, 0)).toBeUndefined();
    expect(ctx.calls).toHaveLength(0);
  });

  it('turns the engine trace on with it, and off again', () => {
    const { h } = scene();
    const inspector = new LayoutInspector(h.engine);

    inspector.setEnabled(true);
    expect(h.engine.trace).toBe(true);
    inspector.setEnabled(false);
    expect(h.engine.trace).toBe(false);
  });

  it('paints margin, padding and content strips and an outline for the hovered node', () => {
    const { h, card } = scene();
    const inspector = new LayoutInspector(h.engine);
    inspector.setEnabled(true);
    expect(inspector.setHovered(card)).toBe(true);
    expect(inspector.setHovered(card)).toBe(false);
    const ctx = new RecordingCanvasContext();

    inspector.paint(ctx, 0);

    // Card: 100×50 at (10, 18) — the page's padding plus the top margin.
    const fills = rects(ctx, 'fillRect');
    expect(fills).toContainEqual([10, 10, 100, 8]); // top margin strip
    expect(fills).toContainEqual([10, 18, 100, 5]); // top padding strip
    expect(fills).toContainEqual([15, 23, 90, 40]); // content box
    expect(rects(ctx, 'strokeRect')).toContainEqual([10.5, 18.5, 99, 49]); // border box
    const label = ctx.calls.find(call => call.name === 'fillText');
    expect(label?.args[0]).toBe("box 'card' 100×50");
  });

  it('outlines the relayout root a change to the hovered node is laid out from', () => {
    const { h, tall, scroller } = scene();
    const inspector = new LayoutInspector(h.engine);
    inspector.setEnabled(true);
    inspector.setHovered(tall);
    const ctx = new RecordingCanvasContext();

    inspector.paint(ctx, 0);

    const root = h.engine.explain(tall).relayout.root;
    expect(root).toBe(scroller);
    const box = h.engine.visibleBox(scroller);
    expect(rects(ctx, 'strokeRect')).toContainEqual([box.x + 1, box.y + 1, box.width - 2, box.height - 2]);
  });

  it('records the nodes a layout pass measured: leaves filled, containers outlined', () => {
    const { h, label, card } = scene();
    const inspector = new LayoutInspector(h.engine);
    inspector.setEnabled(true);

    label.setProperty('text', 'hello');
    h.engine.layoutForFrame(new UiFrame(1, 0, new Map([[label, DirtyFlags.Layout]])), VIEWPORT);
    inspector.recordLayout(1000);

    expect(inspector.heatCount).toBeGreaterThan(0);
    expect(h.engine.stats.measuredNodes).toContain(label);
    const ctx = new RecordingCanvasContext();
    // Hot right after the pass; the next change is the hot→warm step.
    expect(inspector.paint(ctx, 1100)).toBe(INSPECTOR_HOT_MS - 100);
    const labelBox = h.engine.visibleBox(label);
    expect(rects(ctx, 'fillRect')).toEqual([[labelBox.x, labelBox.y, labelBox.width, labelBox.height]]);
    // The card is the relayout root, so it was re-measured and is warm
    // too — but it has children, so it is only outlined: filling every
    // container measured would tint the page and hide the leaf.
    const cardBox = h.engine.visibleBox(card);
    expect(rects(ctx, 'strokeRect')).toContainEqual([
      cardBox.x + 0.5,
      cardBox.y + 0.5,
      cardBox.width - 1,
      cardBox.height - 1
    ]);
    expect(rects(ctx, 'strokeRect')).toHaveLength(2);
    expect(ctx.calls.filter(call => call.name === 'set:fillStyle').map(call => call.args[0])).toEqual([
      'rgba(229, 83, 75, 0.35)'
    ]);

    // Warm: dimmer, and the next change is the expiry.
    const warm = new RecordingCanvasContext();
    expect(inspector.paint(warm, 1000 + INSPECTOR_HOT_MS)).toBe(INSPECTOR_HEAT_MS - INSPECTOR_HOT_MS);
    expect(warm.calls.filter(call => call.name === 'set:fillStyle').map(call => call.args[0])).toEqual([
      'rgba(229, 83, 75, 0.14)'
    ]);

    // Past the heat window nothing is left to paint.
    const later = new RecordingCanvasContext();
    expect(inspector.paint(later, 1000 + INSPECTOR_HEAT_MS)).toBeUndefined();
    expect(inspector.heatCount).toBe(0);
    expect(later.calls).toHaveLength(0);
  });

  it('does not change what it paints between steps, so a re-measured node cannot pulse', () => {
    const { h, label } = scene();
    const inspector = new LayoutInspector(h.engine);
    inspector.setEnabled(true);
    label.setProperty('text', 'hello');
    h.engine.layoutForFrame(new UiFrame(1, 0, new Map([[label, DirtyFlags.Layout]])), VIEWPORT);
    inspector.recordLayout(0);

    const a = new RecordingCanvasContext();
    const b = new RecordingCanvasContext();
    inspector.paint(a, 10);
    inspector.paint(b, INSPECTOR_HOT_MS - 10);
    expect(b.calls).toEqual(a.calls);
  });

  it('clips heat to the scroll container a node sits in', () => {
    const { h, scroller, below } = scene();
    const inspector = new LayoutInspector(h.engine);
    inspector.setEnabled(true);
    // Scroll so the second row is half hidden below the 40px viewport.
    scroller.setProperty('scrollY', 5);
    h.engine.layoutForFrame(new UiFrame(1, 0, new Map([[scroller, DirtyFlags.Transform]])), VIEWPORT);
    below.setProperty('height', 32);
    h.engine.layoutForFrame(new UiFrame(2, 0, new Map([[below, DirtyFlags.Layout]])), VIEWPORT);
    inspector.recordLayout(0);
    const ctx = new RecordingCanvasContext();

    inspector.paint(ctx, 1);

    const view = h.engine.visibleBox(scroller);
    const full = h.engine.visibleBox(below);
    expect(full.y + full.height).toBeGreaterThan(view.y + view.height);
    const painted = rects(ctx, 'fillRect').find(rect => rect[1] === full.y);
    expect(painted).toBeDefined();
    expect(painted![1] + painted![3]).toBe(view.y + view.height);
  });

  it('explains the hovered node and clears everything when disabled', () => {
    const { h, card } = scene();
    const inspector = new LayoutInspector(h.engine);
    inspector.setEnabled(true);
    expect(inspector.explainHoveredText()).toBeNull();

    inspector.setHovered(card);
    expect(inspector.explainHovered()?.node).toBe(card);
    expect(inspector.explainHoveredText()).toMatch(/^box 'card' — 100 × 50 at \(10, 18\)/);

    inspector.setEnabled(false);
    expect(inspector.hoveredNode).toBeNull();
    expect(inspector.heatCount).toBe(0);
  });
});
