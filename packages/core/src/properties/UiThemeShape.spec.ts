import { describe, expect, it } from 'vitest';

import { defaultShapes, type UiShapeName } from '../environment/UiShapes';
import { lightTheme, themesEqual } from '../environment/UiTheme';
import { UiGraph } from '../graph/UiGraph';
import { UiNodeType } from '../graph/UiNodeType';
import { borderRadiusValuesEqual } from './UiBorderRadius';
import { resolveBorderRadiusValue } from './UiThemeShape';
import { createPaintState, resolvePaintState } from '../rendering/PaintState';

describe('theme shape tokens', () => {
  function themedNode(theme?: typeof lightTheme) {
    const graph = new UiGraph();
    const parent = graph.createNode('parent', UiNodeType.Box);
    if (theme !== undefined) {
      parent.setProperty('theme', theme);
    }
    graph.appendChild(graph.root, parent);
    const node = graph.createNode('node', UiNodeType.Box);
    graph.appendChild(parent, node);
    parent.environment = graph.buildNodeEnvironment(parent);
    node.environment = graph.buildNodeEnvironment(node);
    return node;
  }

  const uniform = (radius: number) => ({
    topLeft: radius,
    topRight: radius,
    bottomRight: radius,
    bottomLeft: radius
  });

  it('resolves a scale name against the inherited theme', () => {
    const node = themedNode();
    expect(resolveBorderRadiusValue(node, 'medium')).toEqual(uniform(defaultShapes.medium));
    expect(resolveBorderRadiusValue(node, 'full')).toEqual(uniform(defaultShapes.full));
  });

  it('follows a theme provider above it', () => {
    const square = { ...lightTheme, shapes: { ...defaultShapes, medium: 0 } };
    const round = { ...lightTheme, shapes: { ...defaultShapes, medium: 20 } };
    expect(resolveBorderRadiusValue(themedNode(square), 'medium')).toEqual(uniform(0));
    expect(resolveBorderRadiusValue(themedNode(round), 'medium')).toEqual(uniform(20));
  });

  it('resolves a step a custom scale added', () => {
    const theme = { ...lightTheme, shapes: { ...defaultShapes, control: 7 } as unknown as typeof defaultShapes };
    // Cast because `control` is exactly the case `UiShapeExtensions`
    // exists to declare, and a spec must not augment the module for
    // the whole project just to name one.
    expect(resolveBorderRadiusValue(themedNode(theme), 'control' as UiShapeName)).toEqual(uniform(7));
  });

  it('still accepts numbers and per-corner objects', () => {
    const node = themedNode();
    expect(resolveBorderRadiusValue(node, 12)).toEqual(uniform(12));
    expect(resolveBorderRadiusValue(node, { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 })).toEqual({
      topLeft: 1,
      topRight: 2,
      bottomRight: 3,
      bottomLeft: 4
    });
  });

  it('draws square for a name the scale does not carry', () => {
    // The quiet failure `resolveColorValue` already chose for a colour
    // name nothing matches: a theme missing a step must not take the
    // frame down.
    expect(resolveBorderRadiusValue(themedNode(), 'nonesuch' as UiShapeName)).toEqual(uniform(0));
  });

  it('reaches the paint state through resolvePaintState', () => {
    const node = themedNode();
    node.setProperty('borderRadius', 'large');
    expect(resolvePaintState(node, createPaintState()).borderRadius).toEqual(uniform(defaultShapes.large));
  });

  it('repaints at the new radius when the theme above it is swapped', () => {
    // The whole promise of a token: the element says `medium` once and
    // a provider changing above it is what moves the pixels.
    const graph = new UiGraph();
    const parent = graph.createNode('parent', UiNodeType.Box);
    const node = graph.createNode('node', UiNodeType.Box);
    graph.appendChild(graph.root, parent);
    graph.appendChild(parent, node);
    parent.setProperty('theme', { ...lightTheme, shapes: { ...defaultShapes, medium: 4 } });
    graph.propagateEnvironment(parent);
    graph.processEnvironmentDirty();
    node.setProperty('borderRadius', 'medium');
    expect(resolvePaintState(node, createPaintState()).borderRadius).toEqual(uniform(4));

    graph.clearDirty(node);
    parent.setProperty('theme', { ...lightTheme, shapes: { ...defaultShapes, medium: 18 } });
    graph.propagateEnvironment(parent);
    graph.processEnvironmentDirty();

    expect(node.isDirty()).toBe(true);
    expect(resolvePaintState(node, createPaintState()).borderRadius).toEqual(uniform(18));
  });

  describe('borderRadiusValuesEqual', () => {
    it('compares two names by name, not by what they resolve to', () => {
      // Both normalize to `none` without a theme, so a comparison that
      // normalized first would call these equal and nothing would
      // repaint when the token changed.
      expect(borderRadiusValuesEqual('small', 'large')).toBe(false);
      expect(borderRadiusValuesEqual('small', 'small')).toBe(true);
    });

    it('never equates a name with a literal', () => {
      expect(borderRadiusValuesEqual('none', 0)).toBe(false);
      expect(borderRadiusValuesEqual(0, 'none')).toBe(false);
    });

    it('still compares literals corner by corner', () => {
      expect(borderRadiusValuesEqual(8, uniform(8))).toBe(true);
      expect(borderRadiusValuesEqual(8, uniform(9))).toBe(false);
    });
  });

  describe('shapesEqual, over the scale keys', () => {
    it('sees a change to a step a custom scale added', () => {
      // Written-out key comparison was the bug `typographyEqual` had to
      // be rewritten to fix; a theme whose extra
      // step changed would otherwise never invalidate.
      const before = { ...lightTheme, shapes: { ...defaultShapes, control: 7 } as unknown as typeof defaultShapes };
      const after = { ...lightTheme, shapes: { ...defaultShapes, control: 9 } as unknown as typeof defaultShapes };
      expect(themesEqual(before, after)).toBe(false);
    });

    it('still sees two equal scales as equal', () => {
      const a = { ...lightTheme, shapes: { ...defaultShapes } };
      const b = { ...lightTheme, shapes: { ...defaultShapes } };
      expect(themesEqual(a, b)).toBe(true);
    });
  });
});
