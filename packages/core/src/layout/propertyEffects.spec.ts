import { describe, expect, it } from 'vitest';

import { DirtyFlags } from '../graph/DirtyFlags';
import { propertyEffects } from '../properties/UiPropertyRegistry';

describe('propertyEffects', () => {
  it('classifies sizing properties as layout', () => {
    for (const property of ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight']) {
      expect(propertyEffects(property)).toBe(DirtyFlags.Layout);
    }
  });

  it('classifies flex properties as layout', () => {
    for (const property of ['flexGrow', 'flexShrink', 'flexBasis', 'gap', 'x', 'y', 'selfX', 'selfY']) {
      expect(propertyEffects(property)).toBe(DirtyFlags.Layout);
    }
  });

  it('classifies spacing properties as layout', () => {
    for (const property of [
      'padding',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'margin',
      'marginTop',
      'marginRight',
      'marginBottom',
      'marginLeft'
    ]) {
      expect(propertyEffects(property)).toBe(DirtyFlags.Layout);
    }
  });

  it('classifies text as content and layout', () => {
    expect(propertyEffects('text')).toBe(DirtyFlags.Content | DirtyFlags.Layout);
  });

  it('classifies typography as layout and paint', () => {
    for (const property of ['fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing']) {
      expect(propertyEffects(property)).toBe(DirtyFlags.Layout | DirtyFlags.Paint);
    }
  });

  it('classifies scroll offsets as transform', () => {
    expect(propertyEffects('scrollX')).toBe(DirtyFlags.Transform);
    expect(propertyEffects('scrollY')).toBe(DirtyFlags.Transform);
  });

  it('classifies paint-only properties as paint', () => {
    for (const property of ['color', 'backgroundColor', 'opacity', 'visible']) {
      expect(propertyEffects(property)).toBe(DirtyFlags.Paint);
    }
  });

  it('classifies environment provider properties as environment dirty', () => {
    expect(propertyEffects('theme')).toBe(DirtyFlags.Environment);
    expect(propertyEffects('textStyle')).toBe(DirtyFlags.Environment);
    expect(propertyEffects('contentColor')).toBe(DirtyFlags.Environment);
  });

  it('keeps unknown properties generic', () => {
    expect(propertyEffects('customThing')).toBe(DirtyFlags.Properties);
  });
});
