import { describe, expect, it } from 'vitest';

import { rgba } from '../properties/UiColor';
import { lightTheme, themesEqual } from './UiTheme';
import { defineThemeExtension, hasThemeExtension, themeExtension, withThemeExtension } from './UiThemeExtension';

const brand = defineThemeExtension({
  name: 'brand',
  defaults: { linen: rgba(0.75, 0.6, 0.43), chalk: rgba(0.97, 0.95, 0.92) }
});

const music = defineThemeExtension({
  name: 'music',
  defaults: { nowPlaying: rgba(0.29, 0.33, 0.85) }
});

describe('theme extensions', () => {
  it('gives back the declared defaults for a theme that carries none', () => {
    expect(themeExtension(lightTheme, brand)).toBe(brand.defaults);
    expect(hasThemeExtension(lightTheme, brand)).toBe(false);
  });

  it('carries a token group without changing the theme it came from', () => {
    const themed = withThemeExtension(lightTheme, brand, { linen: rgba(1, 0, 0), chalk: rgba(0, 1, 0) });
    expect(themeExtension(themed, brand).linen).toEqual(rgba(1, 0, 0));
    expect(hasThemeExtension(themed, brand)).toBe(true);
    expect(hasThemeExtension(lightTheme, brand)).toBe(false);
  });

  it('carries two groups at once, each read by its own extension', () => {
    const themed = withThemeExtension(withThemeExtension(lightTheme, brand, brand.defaults), music, music.defaults);
    expect(themeExtension(themed, brand)).toBe(brand.defaults);
    expect(themeExtension(themed, music)).toBe(music.defaults);
  });

  it('two extensions of the same name do not collide', () => {
    const other = defineThemeExtension({ name: 'brand', defaults: { linen: rgba(0, 0, 1) } });
    const themed = withThemeExtension(lightTheme, brand, brand.defaults);
    expect(themeExtension(themed, other)).toBe(other.defaults);
  });
});

describe('themesEqual with extensions', () => {
  it('an added group makes the themes differ', () => {
    const themed = withThemeExtension(lightTheme, brand, brand.defaults);
    expect(themesEqual(lightTheme, themed)).toBe(false);
  });

  it('the same tokens under the same extension are equal', () => {
    const one = withThemeExtension(lightTheme, brand, { linen: rgba(1, 0, 0), chalk: rgba(0, 1, 0) });
    const two = withThemeExtension(lightTheme, brand, { linen: rgba(1, 0, 0), chalk: rgba(0, 1, 0) });
    expect(themesEqual(one, two)).toBe(true);
  });

  it('a changed token invalidates without themesEqual naming the group', () => {
    const one = withThemeExtension(lightTheme, brand, { linen: rgba(1, 0, 0), chalk: rgba(0, 1, 0) });
    const two = withThemeExtension(lightTheme, brand, { linen: rgba(1, 0, 0), chalk: rgba(0, 0, 1) });
    expect(themesEqual(one, two)).toBe(false);
  });

  it('uses the comparison the extension declared', () => {
    const loose = defineThemeExtension({
      name: 'loose',
      defaults: { size: 1 },
      equals: () => true
    });
    const one = withThemeExtension(lightTheme, loose, { size: 1 });
    const two = withThemeExtension(lightTheme, loose, { size: 99 });
    expect(themesEqual(one, two)).toBe(true);
  });
});
