import { describe, expect, it } from 'vitest';

import { UiGraph } from '../graph/UiGraph';
import { UiNodeType } from '../graph/UiNodeType';
import { resolveNumber, resolveProperty } from '../properties/UiPropertyResolver';
import { UiProperties } from '../properties/UiProperty';
import { lightTheme } from './UiTheme';
import { isTypographyRole } from './UiTypography';

/**
 * `textStyle="title"` as the idiom, rather than three numbers on the
 * element. The role is looked up in the theme the element is under, so
 * the same word is a different size under a different theme and
 * nothing on the element changes.
 */
describe('textStyle as a role', () => {
  it('recognises the roles the scale declares', () => {
    expect(isTypographyRole('title', lightTheme.typography)).toBe(true);
    expect(isTypographyRole('bodySmall', lightTheme.typography)).toBe(true);
    expect(isTypographyRole('caption', lightTheme.typography)).toBe(false);
  });

  it('resolves the size, weight and line height of the role', () => {
    const graph = new UiGraph();
    const node = graph.createNode('text', UiNodeType.Text);
    node.setProperty('textStyle', 'title');
    node.environment = graph.buildNodeEnvironment(node, null);
    expect(resolveNumber(node, 'fontSize')).toBe(lightTheme.typography.title.fontSize);
    expect(resolveProperty(node, UiProperties.fontWeight)).toBe(lightTheme.typography.title.fontWeight);
    expect(resolveNumber(node, 'lineHeight')).toBe(lightTheme.typography.title.lineHeight);
  });

  it('follows the theme the same element provides', () => {
    const bigTitle = {
      ...lightTheme,
      typography: { ...lightTheme.typography, title: { ...lightTheme.typography.title, fontSize: 44 } }
    };
    const graph = new UiGraph();
    const node = graph.createNode('text', UiNodeType.Text);
    node.setProperty('theme', bigTitle);
    node.setProperty('textStyle', 'title');
    node.environment = graph.buildNodeEnvironment(node, null);
    expect(resolveNumber(node, 'fontSize')).toBe(44);
  });

  it('cascades to the text below the element that named it', () => {
    const graph = new UiGraph();
    const container = graph.createNode('column', UiNodeType.Column);
    container.setProperty('textStyle', 'label');
    container.environment = graph.buildNodeEnvironment(container, null);
    const child = graph.createNode('text', UiNodeType.Text);
    child.environment = graph.buildNodeEnvironment(child, container);
    expect(resolveNumber(child, 'fontSize')).toBe(lightTheme.typography.label.fontSize);
    expect(resolveNumber(child, 'letterSpacing')).toBe(lightTheme.typography.label.letterSpacing);
  });

  it('resolves a role an application added to its own scale', () => {
    const withCaption = {
      ...lightTheme,
      typography: { ...lightTheme.typography, caption: { ...lightTheme.typography.label, fontSize: 9 } }
    };
    const graph = new UiGraph();
    const node = graph.createNode('text', UiNodeType.Text);
    node.setProperty('theme', withCaption);
    node.setProperty('textStyle', 'caption');
    node.environment = graph.buildNodeEnvironment(node, null);
    expect(resolveNumber(node, 'fontSize')).toBe(9);
  });

  it('leaves a name the scale does not carry alone', () => {
    const graph = new UiGraph();
    const parent = graph.createNode('column', UiNodeType.Column);
    parent.setProperty('textStyle', 'headline');
    parent.environment = graph.buildNodeEnvironment(parent, null);
    const node = graph.createNode('text', UiNodeType.Text);
    node.setProperty('textStyle', 'nosuchrole');
    node.environment = graph.buildNodeEnvironment(node, parent);
    expect(resolveNumber(node, 'fontSize')).toBe(lightTheme.typography.headline.fontSize);
  });

  it('still takes a style written out, for the case a role cannot say', () => {
    const graph = new UiGraph();
    const node = graph.createNode('text', UiNodeType.Text);
    node.setProperty('textStyle', { ...lightTheme.typography.body, fontSize: 13 });
    node.environment = graph.buildNodeEnvironment(node, null);
    expect(resolveNumber(node, 'fontSize')).toBe(13);
  });

  it('a property on the element still wins over the role', () => {
    const graph = new UiGraph();
    const node = graph.createNode('text', UiNodeType.Text);
    node.setProperty('textStyle', 'title');
    node.setProperty('fontSize', 11);
    node.environment = graph.buildNodeEnvironment(node, null);
    expect(resolveNumber(node, 'fontSize')).toBe(11);
  });
});
