import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { setSelectionRange } from '../selection/UiSelectable';
import { setMatchRanges } from '../find/UiTextMatches';
import { RenderHarness, callArgs, callsOf } from './RenderTestUtils';
import {
  buildRenderList,
  CommandKind,
  INSTANCE_STRIDE_FLOATS,
  PrimitiveKind,
  textRuns
} from './webgpu/WebGPURenderData';

/**
 * Both backends draw a selected `Text` node the same way: the
 * highlight behind the glyphs, then the glyphs, unchanged. The harness
 * measures 0.6em per glyph, so a 14px font advances 8.4px per
 * character and a line is 16.8px tall.
 */
function scene(props: Record<string, unknown> = {}): { h: RenderHarness; root: UiNode; label: UiNode } {
  const h = new RenderHarness();
  const root = h.createNode('page', UiNodeType.Column);
  root.setProperty('x', 'start');
  const label = h.createNode('label', UiNodeType.Text);
  label.setProperty('text', 'abcd');
  for (const [key, value] of Object.entries(props)) {
    label.setProperty(key, value);
  }
  h.append(root, label);
  h.layout(root);
  return { h, root, label };
}

describe('Canvas2D text selection painting', () => {
  it('draws nothing behind unselected text', () => {
    const { h, root } = scene();
    h.renderer.render(root, { layout: h.engine, text: h.measurer, now: 0 });
    expect(callArgs(h.context, 'fillText')).toEqual([['abcd', 0, expect.any(Number)]]);
    expect(callsOf(h.context, 'fillRect')).toHaveLength(0);
  });

  it('fills the selected range behind the text', () => {
    const { h, root, label } = scene({ selectionColor: '#ff0012' });
    setSelectionRange(label, 1, 3);
    h.renderer.render(root, { layout: h.engine, text: h.measurer, now: 0 });

    const fills = callArgs(h.context, 'fillRect');
    expect(fills).toHaveLength(1);
    expect(fills[0][0]).toBeCloseTo(8.4, 5);
    expect(fills[0][2]).toBeCloseTo(16.8, 5);
    expect(callArgs(h.context, 'set:fillStyle')).toContain('#ff0012');
    // The text is drawn once, unchanged, over the highlight.
    expect(callArgs(h.context, 'fillText')).toEqual([['abcd', 0, expect.any(Number)]]);
    const names = h.context.calls.map(call => call.name);
    expect(names.indexOf('fillRect')).toBeLessThan(names.indexOf('fillText'));
  });

  it('follows the node into its padding, where the text is drawn', () => {
    const { h, root, label } = scene({ padding: 5 });
    setSelectionRange(label, 0, 1);
    h.renderer.render(root, { layout: h.engine, text: h.measurer, now: 0 });
    const fills = callArgs(h.context, 'fillRect');
    expect(fills[0][0]).toBe(5);
    expect(fills[0][1]).toBe(5);
  });

  it('leaves an out-of-range selection alone', () => {
    const { h, root, label } = scene();
    setSelectionRange(label, 9, 12);
    h.renderer.render(root, { layout: h.engine, text: h.measurer, now: 0 });
    expect(callsOf(h.context, 'fillRect')).toHaveLength(0);
  });
});

describe('Canvas2D find match painting', () => {
  it('fills every match, under the selection so the active one reads strongest', () => {
    const { h, root, label } = scene({ matchColor: '#00ff00', selectionColor: '#ff0012' });
    setMatchRanges(label, [
      { start: 0, end: 1 },
      { start: 2, end: 3 }
    ]);
    setSelectionRange(label, 0, 1);
    h.renderer.render(root, { layout: h.engine, text: h.measurer, now: 0 });

    const fills = callArgs(h.context, 'fillRect');
    // Two matches, then the selection over the first of them.
    expect(fills).toHaveLength(3);
    expect(fills[0][0]).toBe(0);
    expect(fills[1][0]).toBeCloseTo(16.8, 5);
    expect(fills[2][0]).toBe(0);
    const styles = callArgs(h.context, 'set:fillStyle') as unknown as string[];
    expect(styles.indexOf('#00ff00')).toBeLessThan(styles.indexOf('#ff0012'));
    expect(callArgs(h.context, 'fillText')).toEqual([['abcd', 0, expect.any(Number)]]);
  });

  it('draws matches with no selection at all', () => {
    const { h, root, label } = scene();
    setMatchRanges(label, [{ start: 1, end: 3 }]);
    h.renderer.render(root, { layout: h.engine, text: h.measurer, now: 0 });
    expect(callsOf(h.context, 'fillRect')).toHaveLength(1);
  });
});

describe('WebGPU text selection render list', () => {
  it('emits the highlight as a fill before the text run', () => {
    const { h, root, label } = scene();
    setSelectionRange(label, 1, 3);
    const list = buildRenderList(root, h.engine, h.measurer, 800, 600, 1, 0);

    expect(textRuns(list).map(run => run.text)).toEqual(['abcd']);
    const kinds = Array.from(
      { length: list.instanceCount },
      (_, i) => list.instanceData[i * INSTANCE_STRIDE_FLOATS + 11]
    );
    expect(kinds.filter(kind => kind === PrimitiveKind.Fill)).toHaveLength(1);
    expect(list.instanceData[0]).toBeCloseTo(8.4, 5);
    expect(list.instanceData[2]).toBeCloseTo(16.8, 5);
    expect(list.commands.map(command => command.kind)).toEqual([CommandKind.Primitives, CommandKind.Glyphs]);
  });

  it('emits find matches under the selection, in the same order as Canvas2D', () => {
    const { h, root, label } = scene();
    setMatchRanges(label, [
      { start: 0, end: 1 },
      { start: 2, end: 3 }
    ]);
    setSelectionRange(label, 0, 1);
    const list = buildRenderList(root, h.engine, h.measurer, 800, 600, 1, 0);

    const kinds = Array.from(
      { length: list.instanceCount },
      (_, i) => list.instanceData[i * INSTANCE_STRIDE_FLOATS + 11]
    );
    expect(kinds.filter(kind => kind === PrimitiveKind.Fill)).toHaveLength(3);
    expect(list.commands.map(command => command.kind)).toEqual([CommandKind.Primitives, CommandKind.Glyphs]);
  });

  it('emits only the text run when nothing is selected', () => {
    const { h, root } = scene();
    const list = buildRenderList(root, h.engine, h.measurer, 800, 600, 1, 0);
    expect(list.instanceCount).toBe(0);
    expect(list.commands.map(command => command.kind)).toEqual([CommandKind.Glyphs]);
  });
});
