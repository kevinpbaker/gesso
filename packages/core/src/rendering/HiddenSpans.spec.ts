import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { EditableLayout } from '../editing/EditableLayout';
import { editorFor } from '../editing/UiEditable';
import { createPaintState, resolvePaintState } from './PaintState';
import { RenderHarness, callArgs } from './RenderTestUtils';
import { buildRenderList, textRuns } from './webgpu/WebGPURenderData';

/**
 * Hidden runs: in the text, out of the picture.
 *
 * `**bold**` with its markers hidden is eight characters that draw as
 * four. The harness measures 0.6em per glyph, so at 14px a visible
 * character is 8.4px and the four bold ones are 33.6px whatever the
 * markers around them.
 */
const marked = [
  { text: '**', hidden: true },
  { text: 'bold', fontWeight: 700 },
  { text: '**', hidden: true },
  { text: ' text' }
];

function scene(h: RenderHarness, type: UiNodeType, props: Record<string, unknown>) {
  const root = h.createNode('page', UiNodeType.Column);
  root.setProperty('x', 'start');
  const node = h.createNode('paragraph', type);
  for (const [key, value] of Object.entries(props)) {
    node.setProperty(key, value);
  }
  h.append(root, node);
  h.layout(root);
  return { root, node };
}

function editableLayout(h: RenderHarness, field: UiNode): EditableLayout {
  const record = h.record(field);
  const box = { x: 0, y: 0, width: record.width, height: record.height };
  return new EditableLayout(editorFor(field), box, resolvePaintState(field, createPaintState()), h.measurer);
}

describe('hidden runs', () => {
  it('take no room in a text', () => {
    const h = new RenderHarness();
    const { node } = scene(h, UiNodeType.Text, { spans: marked });
    // 'bold text' is nine visible characters.
    expect(h.record(node).width).toBeCloseTo(9 * 8.4, 5);
  });

  it('take no room in an editable', () => {
    const h = new RenderHarness();
    const { node } = scene(h, UiNodeType.EditableText, { value: '**bold** text', spans: marked });
    expect(h.record(node).width).toBeCloseTo(9 * 8.4, 5);
  });

  it('are not drawn by Canvas2D', () => {
    const h = new RenderHarness();
    const { root } = scene(h, UiNodeType.EditableText, { value: '**bold** text', spans: marked });
    h.render(root);
    const drawn = callArgs(h.context, 'fillText');
    expect(drawn.map(call => call[0])).toEqual(['bold', ' text']);
    expect(drawn[0][1]).toBe(0);
    expect(drawn[1][1]).toBeCloseTo(4 * 8.4, 5);
  });

  it('are not drawn by WebGPU', () => {
    const h = new RenderHarness();
    const { root } = scene(h, UiNodeType.Text, { spans: marked });
    const list = buildRenderList(root, h.engine, h.measurer, 800, 600, 1, 0);
    expect(textRuns(list).map(run => run.text)).toEqual(['bold', ' text']);
  });

  it('place the caret by the visible text: both ends of a hidden run are at one x', () => {
    const h = new RenderHarness();
    const { node } = scene(h, UiNodeType.EditableText, { value: '**bold** text', spans: marked });
    const layout = editableLayout(h, node);
    expect(layout.caretRect(0).x).toBe(0);
    expect(layout.caretRect(2).x).toBe(0);
    expect(layout.caretRect(3).x).toBeCloseTo(8.4, 5);
    expect(layout.caretRect(6).x).toBeCloseTo(4 * 8.4, 5);
    expect(layout.caretRect(8).x).toBeCloseTo(4 * 8.4, 5);
    expect(layout.caretRect(9).x).toBeCloseTo(5 * 8.4, 5);
  });

  it('measure a caret after a run in that run’s font', () => {
    // Not about hiding, but what hiding rests on: geometry measured run
    // by run. A run at twice the size puts the caret twice as far along.
    const h = new RenderHarness();
    const { node } = scene(h, UiNodeType.EditableText, {
      value: 'abcd',
      spans: [{ text: 'ab', fontSize: 28 }, { text: 'cd' }]
    });
    const layout = editableLayout(h, node);
    expect(layout.caretRect(2).x).toBeCloseTo(2 * 16.8, 5);
    expect(layout.caretRect(3).x).toBeCloseTo(2 * 16.8 + 8.4, 5);
  });

  it('are left out of the selection highlight', () => {
    const h = new RenderHarness();
    const { node } = scene(h, UiNodeType.EditableText, { value: '**bold** text', spans: marked });
    const layout = editableLayout(h, node);
    const boxes = layout.selectionBoxes({ start: 0, end: 8 });
    expect(boxes).toHaveLength(1);
    expect(boxes[0].x).toBe(0);
    expect(boxes[0].width).toBeCloseTo(4 * 8.4, 5);
    // A selection of nothing but hidden text has nothing to highlight.
    expect(layout.selectionBoxes({ start: 6, end: 8 })).toEqual([]);
  });

  it('resolve a press to the side of the hidden run it lands on', () => {
    const h = new RenderHarness();
    const { node } = scene(h, UiNodeType.EditableText, { value: '**bold** text', spans: marked });
    const layout = editableLayout(h, node);
    const end = 4 * 8.4;
    // Just before the boundary the closing markers sit at: before them.
    expect(layout.offsetAt(end - 1, 5)).toBe(6);
    // Just past it: after them.
    expect(layout.offsetAt(end + 1, 5)).toBe(8);
    // The paragraph's start: before the opening markers.
    expect(layout.offsetAt(0, 5)).toBe(0);
    expect(layout.offsetAt(1, 5)).toBe(2);
  });

  it('do not wrap a line by their width', () => {
    const h = new RenderHarness();
    // Nine visible characters fit 80px (75.6px); thirteen would not (109.2px).
    const root = h.createNode('page', UiNodeType.Column);
    root.setProperty('x', 'start');
    const node = h.createNode('paragraph', UiNodeType.Text);
    node.setProperty('spans', marked);
    node.setProperty('width', 80);
    h.append(root, node);
    h.layout(root);
    const list = buildRenderList(root, h.engine, h.measurer, 800, 600, 1, 0);
    expect(new Set(textRuns(list).map(run => run.y)).size).toBe(1);
  });
});
