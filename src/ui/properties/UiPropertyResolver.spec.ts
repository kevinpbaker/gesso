import { describe, expect, it } from 'vitest';

import { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { UiEnvironment } from '../environment/UiEnvironment';
import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import { resolveProperty, resolvePropertyByName, resolveNumber, resolveString } from './UiPropertyResolver';
import { UiProperties } from './UiProperty';
import { rgba } from './UiColor';

describe('resolveProperty', () => {
  it('resolves direct values from a node', () => {
    const node = new UiNode('a', UiNodeType.Box);
    node.setProperty('opacity', 0.5);
    expect(resolveProperty(node, UiProperties.opacity)).toBe(0.5);
  });

  it('falls back to defaults for unset properties', () => {
    const node = new UiNode('a', UiNodeType.Box);
    expect(resolveProperty(node, UiProperties.opacity)).toBe(1);
    expect(resolveProperty(node, UiProperties.visible)).toBe(true);
  });

  it('resolves inherited values from the scoped environment', () => {
    const environment = new UiEnvironment(null).set(UiEnvironmentKeys.textStyle, {
      color: { r: 1, g: 0, b: 0, a: 1 },
      fontFamily: 'sans-serif',
      fontSize: 16,
      fontWeight: 'normal',
      lineHeight: 19.2,
      letterSpacing: 0,
      textAlign: 'left',
      textDirection: 'ltr'
    });
    const child = new UiNode('child', UiNodeType.Text);
    child.environment = environment;
    expect(resolveProperty(child, UiProperties.color)).toEqual(rgba(1, 0, 0));
  });

  it('prefers a local value over an inherited value', () => {
    const node = new UiNode('a', UiNodeType.Text);
    const environment = new UiEnvironment(null).set(UiEnvironmentKeys.textStyle, {
      color: { r: 1, g: 0, b: 0, a: 1 },
      fontFamily: 'sans-serif',
      fontSize: 16,
      fontWeight: 'normal',
      lineHeight: 19.2,
      letterSpacing: 0,
      textAlign: 'left',
      textDirection: 'ltr'
    });
    node.environment = environment;
    node.setProperty('color', '#00f');
    expect(resolveProperty(node, UiProperties.color)).toBe('#00f');
  });
});

describe('resolvePropertyByName', () => {
  it('is a shorthand for resolving a property by name', () => {
    const node = new UiNode('a', UiNodeType.Box);
    node.setProperty('opacity', 0.25);
    expect(resolvePropertyByName(node, 'opacity')).toBe(0.25);
  });

  it('returns undefined for unknown properties', () => {
    const node = new UiNode('a', UiNodeType.Box);
    expect(resolvePropertyByName(node, 'unknown')).toBeUndefined();
  });
});

describe('resolveNumber', () => {
  it('returns a finite numeric value', () => {
    const node = new UiNode('a', UiNodeType.Box);
    node.setProperty('opacity', 0.5);
    expect(resolveNumber(node, 'opacity')).toBe(0.5);
  });

  it('returns the default value when no numeric value is set', () => {
    const node = new UiNode('a', UiNodeType.Box);
    expect(resolveNumber(node, 'opacity')).toBe(1);
  });
});

describe('resolveString', () => {
  it('returns a non-empty string value', () => {
    const node = new UiNode('a', UiNodeType.Box);
    node.setProperty('x', 'center');
    expect(resolveString(node, 'x')).toBe('center');
  });

  it('returns undefined for empty strings', () => {
    const node = new UiNode('a', UiNodeType.Box);
    expect(resolveString(node, 'x')).toBeUndefined();
  });
});
