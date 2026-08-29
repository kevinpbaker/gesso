import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { CARET_BLINK_MS, editorFor } from '../editing/UiEditable';
import { RenderHarness, callArgs, callsOf } from './RenderTestUtils';
import {
  buildRenderList,
  CommandKind,
  INSTANCE_STRIDE_FLOATS,
  PrimitiveKind,
  textItems
} from './webgpu/WebGPURenderData';

/**
 * Both backends draw an editable the same way: selection boxes behind
 * the text, the text or its placeholder, the composition underline and
 * the caret. The harness measures 0.6em per glyph, so a 14px font
 * advances 8.4px per character.
 */

function editable(h: RenderHarness, props: Record<string, unknown>): UiNode {
  const node = h.createNode('field', UiNodeType.EditableText);
  for (const [key, value] of Object.entries(props)) {
    node.setProperty(key, value);
  }
  return node;
}

function scene(h: RenderHarness, props: Record<string, unknown>) {
  const root = h.createNode('page', UiNodeType.Column);
  root.setProperty('x', 'start');
  const field = editable(h, props);
  h.append(root, field);
  h.layout(root);
  return { root, field, model: editorFor(field) };
}

describe('Canvas2D editable painting', () => {
  it('draws the text and a caret only while focused, in the lit half of the blink', () => {
    const h = new RenderHarness();
    const { root, model } = scene(h, { value: 'abc' });
    model.select(2);
    h.renderer.render(root, { layout: h.engine, text: h.measurer, now: 0 });
    expect(callArgs(h.context, 'fillText')).toEqual([['abc', 0, expect.any(Number)]]);
    expect(callsOf(h.context, 'fillRect')).toHaveLength(0);

    model.focused = true;
    model.blinkOrigin = 1000;
    h.context.calls.length = 0;
    h.renderer.render(root, { layout: h.engine, text: h.measurer, now: 1000 });
    // The caret after two 8.4px glyphs, rounded to a pixel, one line tall.
    expect(callArgs(h.context, 'fillRect')).toEqual([[17, 0, 1, expect.closeTo(16.8, 5)]]);

    h.context.calls.length = 0;
    h.renderer.render(root, { layout: h.engine, text: h.measurer, now: 1000 + CARET_BLINK_MS + 1 });
    expect(callsOf(h.context, 'fillRect')).toHaveLength(0);
  });

  it('scrolls a field narrower than its line, under the clip of its own box', () => {
    const h = new RenderHarness();
    // Eight 8.4px glyphs in a 30px field, scrolled 20px along.
    const { root, model } = scene(h, { value: 'abcdefgh', width: 30, scrollX: 20 });
    model.focused = true;
    model.select(8);
    h.renderer.render(root, { layout: h.engine, text: h.measurer, now: model.blinkOrigin });
    expect(callArgs(h.context, 'fillText')).toEqual([['abcdefgh', -20, expect.any(Number)]]);
    // The caret is at the end of the text, inside the box rather than
    // past its right edge, and the box clips what runs off it.
    expect(callArgs(h.context, 'fillRect')).toEqual([[47, 0, 1, expect.closeTo(16.8, 5)]]);
    expect(callsOf(h.context, 'clip')).not.toHaveLength(0);
  });

  it('fills the selection behind the text instead of a caret', () => {
    const h = new RenderHarness();
    const { root, model } = scene(h, { value: 'abcd', selectionColor: '#ff0012' });
    model.focused = true;
    model.select(1, 3);
    h.renderer.render(root, { layout: h.engine, text: h.measurer, now: model.blinkOrigin });
    const fills = callArgs(h.context, 'fillRect');
    expect(fills).toHaveLength(1);
    expect(fills[0][0]).toBeCloseTo(8.4, 5);
    expect(fills[0][2]).toBeCloseTo(16.8, 5);
    const styles = callArgs(h.context, 'set:fillStyle') as unknown as string[];
    expect(styles).toContain('#ff0012');
    // Selection is painted before the text.
    const names = h.context.calls.map(call => call.name);
    expect(names.indexOf('fillRect')).toBeLessThan(names.indexOf('fillText'));
  });

  it('shows the placeholder, muted, while empty and still draws the caret', () => {
    const h = new RenderHarness();
    const { root, model } = scene(h, { value: '', placeholder: 'Name', placeholderColor: '#123456' });
    model.focused = true;
    h.renderer.render(root, { layout: h.engine, text: h.measurer, now: model.blinkOrigin });
    expect(callArgs(h.context, 'fillText')).toEqual([['Name', 0, expect.any(Number)]]);
    expect(callArgs(h.context, 'set:fillStyle')).toContain('#123456');
    expect(callArgs(h.context, 'fillRect')).toEqual([[0, 0, 1, expect.closeTo(16.8, 5)]]);
  });

  it('underlines the text an IME is composing and holds the caret steady', () => {
    const h = new RenderHarness();
    const { root, model } = scene(h, { value: 'a' });
    model.focused = true;
    model.select(1);
    model.updateComposition('ni', 2);
    h.renderer.render(root, { layout: h.engine, text: h.measurer, now: model.blinkOrigin + CARET_BLINK_MS + 1 });
    const fills = callArgs(h.context, 'fillRect');
    // The underline under 'ni' (from 8.4 to 25.2, one pixel tall) and the
    // caret, which does not blink during composition.
    expect(fills).toHaveLength(2);
    expect(fills[0][0]).toBeCloseTo(8.4, 5);
    expect(fills[0][2]).toBeCloseTo(16.8, 5);
    expect(fills[0][3]).toBe(1);
    expect(fills[1]).toEqual([25, 0, 1, expect.closeTo(16.8, 5)]);
  });
});

describe('WebGPU editable render list', () => {
  function build(h: RenderHarness, root: UiNode, now: number) {
    return buildRenderList(root, h.engine, h.measurer, 800, 600, 1, now);
  }

  it('emits the text run, selection fills and caret as primitives', () => {
    const h = new RenderHarness();
    const { root, model } = scene(h, { value: 'abcd' });
    model.focused = true;
    model.select(1, 3);
    const selected = build(h, root, model.blinkOrigin);
    expect(textItems(selected).map(item => item.lines.map(line => line.text))).toEqual([['abcd']]);
    const fills = Array.from(
      { length: selected.instanceCount },
      (_, i) => selected.instanceData[i * INSTANCE_STRIDE_FLOATS + 11]
    );
    expect(fills.filter(kind => kind === PrimitiveKind.Fill)).toHaveLength(1);
    expect(selected.instanceData[0]).toBeCloseTo(8.4, 5);
    expect(selected.instanceData[2]).toBeCloseTo(16.8, 5);
    // Selection before text, as Canvas2D paints them.
    expect(selected.commands.map(command => command.kind)).toEqual([CommandKind.Primitives, CommandKind.Text]);

    model.select(4);
    const caret = build(h, root, model.blinkOrigin);
    expect(caret.instanceCount).toBe(1);
    expect(caret.instanceData[0]).toBe(34);
    expect(caret.instanceData[2]).toBe(1);
    expect(caret.commands.map(command => command.kind)).toEqual([CommandKind.Text, CommandKind.Primitives]);
  });

  it('shifts a scrolled field by its own offset', () => {
    const h = new RenderHarness();
    const { root, model } = scene(h, { value: 'abcdefgh', width: 30, scrollX: 20 });
    model.focused = true;
    model.select(8);
    const list = build(h, root, model.blinkOrigin);
    expect(textItems(list).map(item => item.lines.map(line => line.text))).toEqual([['abcdefgh']]);
    expect(list.instanceCount).toBe(1);
    expect(list.instanceData[0]).toBe(47);
  });

  it('rasterises the placeholder in its own colour when the text is empty', () => {
    const h = new RenderHarness();
    const { root } = scene(h, { value: '', placeholder: 'Search', placeholderColor: '#12ab34' });
    const list = build(h, root, 0);
    const items = textItems(list);
    expect(items).toHaveLength(1);
    expect(items[0].lines[0].text).toBe('Search');
    expect(items[0].color).toBe('#12ab34');
    // An unfocused empty field draws nothing else.
    expect(list.instanceCount).toBe(0);
  });
});
