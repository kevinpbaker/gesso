import { describe, expect, it } from 'vitest';

import { DirtyFlags } from '../graph/DirtyFlags';
import { defineProperty } from './UiPropertyDefinition';
import { findPropertyDefinition, getPropertyNames } from './UiPropertyRegistry';
import { UiProperties } from './UiProperty';
import { normalizeColor } from './UiColor';

describe('defineProperty', () => {
  it('creates a property with the given metadata', () => {
    const prop = defineProperty({
      name: 'opacity',
      defaultValue: 1,
      affects: DirtyFlags.Paint,
      inherited: false
    });
    expect(prop.name).toBe('opacity');
    expect(prop.defaultValue).toBe(1);
    expect(prop.affects).toBe(DirtyFlags.Paint);
    expect(prop.inherited).toBe(false);
    expect(prop.compare).toBeUndefined();
  });

  it('supports inherited properties', () => {
    const prop = defineProperty({
      name: 'color',
      defaultValue: undefined,
      affects: DirtyFlags.Paint,
      inherited: true,
      compare: (a, b) => normalizeColor(a) === normalizeColor(b)
    });
    expect(prop.inherited).toBe(true);
    expect(prop.compare).toBeDefined();
  });
});

describe('UiProperties registry', () => {
  it('exports definitions for core properties', () => {
    expect(UiProperties.opacity.name).toBe('opacity');
    expect(UiProperties.visible.name).toBe('visible');
    expect(UiProperties.backgroundColor.affects).toBe(DirtyFlags.Paint);
  });

  it('uses axis-relative alignment names', () => {
    expect(UiProperties.x.name).toBe('x');
    expect(UiProperties.y.name).toBe('y');
    expect(UiProperties.selfX.name).toBe('selfX');
    expect(UiProperties.selfY.name).toBe('selfY');
  });

  it('registers inherited text properties', () => {
    expect(UiProperties.color.inherited).toBe(true);
    expect(UiProperties.fontSize.inherited).toBe(true);
    expect(UiProperties.textAlign.inherited).toBe(true);
  });

  it('environment provider properties affect environment dirty flag', () => {
    expect(UiProperties.theme.affects).toBe(DirtyFlags.Environment);
    expect(UiProperties.textStyle.affects).toBe(DirtyFlags.Environment);
    expect(UiProperties.contentColor.affects).toBe(DirtyFlags.Environment);
  });
});

describe('UiPropertyRegistry', () => {
  it('lists all registered property names', () => {
    const names = getPropertyNames();
    expect(names.includes('opacity')).toBe(true);
    expect(names.includes('backgroundColor')).toBe(true);
    expect(names.includes('x')).toBe(true);
  });

  it('looks up definitions by name', () => {
    const def = findPropertyDefinition('opacity');
    expect(def).toBeDefined();
    expect(def?.defaultValue).toBe(1);
  });

  it('returns undefined for unknown properties', () => {
    expect(findPropertyDefinition('unknown')).toBeUndefined();
  });
});
