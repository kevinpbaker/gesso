import { describe, expect, it } from 'vitest';

import { defaultTypography } from '../environment/UiTypography';
import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { LayoutEngine } from '../layout/LayoutEngine';
import { Constraints } from '../layout/LayoutTypes';
import { CharacterCountTextMeasurer } from '../layout/TextMeasurer';
import { createPaintState, resolvePaintState } from '../rendering/PaintState';
import { resolveFont, resolveFontInto } from './UiTextFont';

/**
 * Layout and paint must agree on the font, or text is measured in one
 * line box and drawn in another. The keypad digits in the sign-in
 * example sat 5px high because paint inherited the default style's
 * 16.8px line height while layout used 22 × 1.2.
 */
describe('resolveFont', () => {
  function tree(parentProps: Record<string, unknown>, textProps: Record<string, unknown>) {
    const graph = new UiGraph();
    const parent = graph.createNode('parent', UiNodeType.Column);
    for (const [name, value] of Object.entries(parentProps)) {
      parent.setProperty(name, value);
    }
    graph.appendChild(graph.root, parent);
    const text = graph.createNode('text', UiNodeType.Text);
    text.setProperty('text', 'Hello');
    for (const [name, value] of Object.entries(textProps)) {
      text.setProperty(name, value);
    }
    graph.appendChild(parent, text);
    parent.environment = graph.buildNodeEnvironment(parent);
    text.environment = graph.buildNodeEnvironment(text);
    return { graph, parent, text };
  }

  it('gives a node with its own font size a normal line height for that size', () => {
    const { text } = tree({}, { fontSize: 22 });
    const font = resolveFont(text);
    expect(font.fontSize).toBe(22);
    expect(font.lineHeight).toBeCloseTo(26.4);
    // Small text is the mirror case: 16.8 would have drawn it low.
    expect(resolveFont(tree({}, { fontSize: 12 }).text).lineHeight).toBeCloseTo(14.4);
  });

  it('takes an inherited text style whole: its size and its line height together', () => {
    const { text } = tree({ textStyle: defaultTypography.headline }, {});
    const font = resolveFont(text);
    expect(font.fontSize).toBe(defaultTypography.headline.fontSize);
    expect(font.lineHeight).toBe(defaultTypography.headline.lineHeight);
    expect(font.fontWeight).toBe(defaultTypography.headline.fontWeight);
  });

  it('lets an explicit lineHeight win over both', () => {
    expect(resolveFont(tree({}, { fontSize: 22, lineHeight: 22 }).text).lineHeight).toBe(22);
    expect(resolveFont(tree({ textStyle: defaultTypography.headline }, { lineHeight: 40 }).text).lineHeight).toBe(40);
  });

  it('uses the default style when nothing is set', () => {
    const font = resolveFont(tree({}, {}).text);
    expect(font.fontSize).toBe(14);
    expect(font.lineHeight).toBeCloseTo(16.8);
    expect(font.fontFamily).toBe('sans-serif');
  });

  it('measures and paints a text node with the same line box', () => {
    const { parent, text } = tree({ textStyle: defaultTypography.headline }, { fontSize: 22 });
    const engine = new LayoutEngine(new CharacterCountTextMeasurer());
    engine.layout(parent as UiNode, Constraints.loose(400, 400));
    const laidOutHeight = engine.recordFor(text)!.height;
    const painted = resolvePaintState(text, createPaintState());
    expect(laidOutHeight).toBeCloseTo(painted.lineHeight);
    expect(painted.lineHeight).toBeCloseTo(26.4);
    expect(painted.fontFamily).toBe(defaultTypography.headline.fontFamily);
  });

  /**
   * Paint resolves into the scratch it already owns rather than into a
   * record it allocates per node per frame, so the two entry points
   * have to fill the same five fields the same way.
   */
  it('writes the same font into a caller-owned target', () => {
    const { text } = tree({ textStyle: defaultTypography.headline }, { fontSize: 22, letterSpacing: 1.5 });
    const target = { fontSize: 0, fontFamily: '', fontWeight: '' as string | number, lineHeight: 0, letterSpacing: 0 };
    resolveFontInto(text, target);
    expect(target).toEqual({ ...resolveFont(text) });
  });
});
