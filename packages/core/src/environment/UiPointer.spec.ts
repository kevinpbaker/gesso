import { describe, expect, it } from 'vitest';

import { lightTheme, themesEqual } from './UiTheme';
import { defineThemeExtension, themeExtension, withThemeExtension } from './UiThemeExtension';
import { withPointer } from './UiPointer';

const sizes = defineThemeExtension({ name: 'test.sizes', defaults: { field: 32 }, coarse: { field: 44 } });

describe('withPointer', () => {
  it("lays the theme's touch over it for a finger, and turns back to the very theme it came from", () => {
    const theme = {
      ...lightTheme,
      touch: { typography: { body: { ...lightTheme.typography.body, fontSize: 16 } }, spacing: { medium: 16 } }
    };
    const touch = withPointer(theme, 'coarse');
    expect(touch.pointer).toBe('coarse');
    expect(touch.typography.body.fontSize).toBe(16);
    expect(touch.typography.title).toBe(theme.typography.title);
    expect(touch.spacing.medium).toBe(16);
    expect(withPointer(touch, 'coarse')).toBe(touch);
    expect(withPointer(touch, 'fine')).toBe(theme);
    expect(themesEqual(theme, touch)).toBe(false);
  });

  it("gives a token group its touch values on a touch theme that does not carry it, and the theme's own where it does", () => {
    expect(themeExtension(lightTheme, sizes)).toEqual({ field: 32 });
    expect(themeExtension(withPointer(lightTheme, 'coarse'), sizes)).toEqual({ field: 44 });
    const own = withThemeExtension(lightTheme, sizes, { field: 40 });
    expect(themeExtension(withPointer(own, 'coarse'), sizes)).toEqual({ field: 40 });
    const ownTouch = {
      ...lightTheme,
      touch: { extensions: withThemeExtension(lightTheme, sizes, { field: 48 }).extensions }
    };
    expect(themeExtension(withPointer(ownTouch, 'coarse'), sizes)).toEqual({ field: 48 });
  });
});
