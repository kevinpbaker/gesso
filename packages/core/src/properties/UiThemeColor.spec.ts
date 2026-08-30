import { describe, expect, it } from 'vitest';

import { darkTheme, lightTheme } from '../environment/UiTheme';
import { UiGraph } from '../graph/UiGraph';
import { UiNodeType } from '../graph/UiNodeType';
import { UiProperties } from './UiProperty';
import { colorValuesEqual, resolveColor } from './UiThemeColor';
import { createPaintState, resolvePaintState } from '../rendering/PaintState';

describe('theme color tokens', () => {
  function themedNode(theme: typeof lightTheme | undefined) {
    const graph = new UiGraph();
    const parent = graph.createNode('parent', UiNodeType.Box);
    if (theme !== undefined) {
      parent.setProperty('theme', theme);
    }
    graph.appendChild(graph.root, parent);
    const node = graph.createNode('node', UiNodeType.Text);
    graph.appendChild(parent, node);
    parent.environment = graph.buildNodeEnvironment(parent);
    node.environment = graph.buildNodeEnvironment(node);
    return node;
  }

  it('resolves a palette name against the inherited theme', () => {
    const node = themedNode(darkTheme);
    node.setProperty('color', 'primary');
    node.setProperty('backgroundColor', 'surface');
    expect(resolveColor(node, UiProperties.color)).toEqual(darkTheme.colors.primary);
    expect(resolveColor(node, UiProperties.backgroundColor)).toEqual(darkTheme.colors.surface);
  });

  it('falls back to the default theme when nothing provides one', () => {
    const node = themedNode(undefined);
    node.setProperty('borderColor', 'border');
    expect(resolveColor(node, UiProperties.borderColor)).toEqual(lightTheme.colors.border);
  });

  it('still accepts hex, named CSS colors and UiColor objects', () => {
    const node = themedNode(darkTheme);
    node.setProperty('color', '#ff0000');
    expect(resolveColor(node, UiProperties.color)).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    node.setProperty('color', 'blue');
    expect(resolveColor(node, UiProperties.color)).toEqual({ r: 0, g: 0, b: 1, a: 1 });
    node.setProperty('color', { r: 0.5, g: 0.5, b: 0.5, a: 1 });
    expect(resolveColor(node, UiProperties.color)).toEqual({ r: 0.5, g: 0.5, b: 0.5, a: 1 });
  });

  it('reaches the paint state through resolvePaintState', () => {
    const node = themedNode(darkTheme);
    node.setProperty('text', 'hello');
    node.setProperty('color', 'text');
    node.setProperty('backgroundColor', 'background');
    const state = resolvePaintState(node, createPaintState());
    expect(state.textColor).toEqual(darkTheme.colors.text);
    expect(state.backgroundColor).toEqual(darkTheme.colors.background);
  });

  describe('colorValuesEqual', () => {
    it('compares literal colors by channel', () => {
      expect(colorValuesEqual('#ff0000', { r: 1, g: 0, b: 0, a: 1 })).toBe(true);
      expect(colorValuesEqual('#ff0000', '#00ff00')).toBe(false);
      expect(colorValuesEqual(undefined, undefined)).toBe(true);
      expect(colorValuesEqual(undefined, '#fff')).toBe(false);
    });

    it('treats two different palette names as a change', () => {
      // Before tokens existed both names normalized to undefined and
      // compared equal, so switching 'primary' → 'secondary' would not
      // have repainted.
      expect(colorValuesEqual('primary', 'secondary')).toBe(false);
      expect(colorValuesEqual('primary', 'primary')).toBe(true);
      expect(colorValuesEqual('primary', '#ff0000')).toBe(false);
    });
  });
});
