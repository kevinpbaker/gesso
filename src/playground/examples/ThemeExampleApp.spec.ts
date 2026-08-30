import { describe, expect, it } from 'vitest';

import { colorToHex } from '../../ui/properties/UiColor';
import { AppearanceApp, buildTheme, isDark, specOf, type ThemeSpec } from './ThemeExampleApp';

const BASE: ThemeSpec = { palette: 'daylight', accent: 'blue', corners: 'soft', textSize: 'regular' };

/** The latest value of an observable, read synchronously. */
function latest<T>(observable: { subscribe(next: (value: T) => void): { unsubscribe(): void } }): T {
  let value!: T;
  observable.subscribe(next => (value = next)).unsubscribe();
  return value;
}

describe('theme example', () => {
  it('paints the accent as the palette primary', () => {
    expect(colorToHex(buildTheme(BASE).colors.primary)).toBe(
      colorToHex(buildTheme({ ...BASE, palette: 'midnight' }).colors.primary)
    );
    expect(colorToHex(buildTheme({ ...BASE, accent: 'rose' }).colors.primary)).not.toBe(
      colorToHex(buildTheme(BASE).colors.primary)
    );
  });

  it('squares every radius but the pill at the sharp setting', () => {
    const sharp = buildTheme({ ...BASE, corners: 'sharp' }).shapes;
    const round = buildTheme({ ...BASE, corners: 'round' }).shapes;
    expect(sharp.medium).toBe(0);
    expect(sharp.large).toBe(0);
    expect(sharp.full).toBe(round.full);
    expect(round.medium).toBeGreaterThan(buildTheme(BASE).shapes.medium);
  });

  it('scales the whole type scale together', () => {
    const small = buildTheme({ ...BASE, textSize: 'small' }).typography;
    const large = buildTheme({ ...BASE, textSize: 'large' }).typography;
    expect(large.body.fontSize).toBeGreaterThan(small.body.fontSize);
    expect(large.headline.fontSize).toBeGreaterThan(small.headline.fontSize);
    expect(large.body.lineHeight).toBeGreaterThan(large.body.fontSize);
  });

  it('carries the palette text colors in the type scale', () => {
    const light = buildTheme(BASE);
    const dark = buildTheme({ ...BASE, palette: 'midnight' });
    expect(colorToHex(light.typography.body.color)).toBe(colorToHex(light.colors.text));
    expect(colorToHex(light.typography.label.color)).toBe(colorToHex(light.colors.textMuted));
    expect(colorToHex(dark.typography.body.color)).not.toBe(colorToHex(light.typography.body.color));
  });

  it('follows the selections through the published choices', () => {
    // The theme is not published — it is rebuilt on the render side
    // from these four strings, so this is what actually crosses.
    const app = new AppearanceApp();
    const themes: string[] = [];
    app.view.subscribe(view => themes.push(colorToHex(buildTheme(specOf(view)).colors.primary)));

    app.setAccent('emerald');
    expect(themes.length).toBe(2);
    expect(themes[1]).not.toBe(themes[0]);
    expect(themes[1]).toBe(colorToHex(buildTheme({ ...BASE, accent: 'emerald' }).colors.primary));
  });

  it('keeps every choice but the mode in the contrast theme', () => {
    const app = new AppearanceApp();
    app.setPalette('midnight');
    app.setCorners('round');

    const view = latest(app.view);
    expect(view.dark).toBe(true);
    expect(isDark(app.palette.value)).toBe(true);

    const contrast = buildTheme({ ...specOf(view), palette: view.dark ? 'daylight' : 'midnight' });
    expect(contrast.shapes.medium).toBe(buildTheme({ ...BASE, corners: 'round' }).shapes.medium);
    expect(colorToHex(contrast.colors.background)).toBe(colorToHex(buildTheme(BASE).colors.background));
  });
});
