import { describe, expect, it } from 'vitest';

import { Button, Column, colorToHex, darkColors, darkTheme, lightTheme, rgb8, type UiTheme } from 'gesso-core';
import { mountRuntime } from '../app/RuntimeTestUtils';
import { resultText } from './AgentSurface';
import type { DesignThemes } from './designedTheme';
import type { ThemeTokens } from './tokens';
import { uiSurface, type UiHost } from './ui';

/**
 * `tokens_view` on a real runtime: the theme the screen is drawn with,
 * read where the application set it and where a part of the screen
 * set its own.
 */

const orange = rgb8(255, 85, 0);
const brand: UiTheme = { ...lightTheme, colors: { ...lightTheme.colors, primary: orange } };

function screen(withTheme = true, designThemes?: () => DesignThemes) {
  // The application's theme sits on a wrapper below the runtime's own
  // root, as an application's usually does, and one panel is dark.
  const mounted = mountRuntime(
    Column(
      { theme: brand },
      Column(Button({ text: 'Save' }), Column({ theme: darkTheme }, Button({ text: 'In the dark' })))
    )
  );
  mounted.frame(0);
  const host: UiHost = {
    semanticsTree: () => mounted.runtime.semanticsTree(),
    focusedNodeId: () => mounted.runtime.focusedNodeId(),
    applySemanticsAction: action => mounted.runtime.applySemanticsAction(action),
    key: () => {},
    flush: () => mounted.frame(),
    ...(withTheme ? { theme: (at?: string) => mounted.runtime.themeAt(at) } : {}),
    ...(designThemes === undefined ? {} : { designThemes })
  };
  return uiSurface(() => host, { quietMs: 1, settleMs: 100 });
}

describe('tokens_view', () => {
  it("reads the theme the application's content is drawn with, by name and value", async () => {
    const result = await screen().call('tokens_view', {});
    const tokens = result.structuredContent as unknown as ThemeTokens;

    expect(result.isError).toBe(false);
    expect(tokens.colors.primary).toBe(colorToHex(orange));
    expect(tokens.typography.title?.fontSize).toBe(lightTheme.typography.title.fontSize);
    expect(tokens.shapes.medium).toBe(8);
    expect(resultText(result)).toContain("The theme in force at the application's outermost content.");
    expect(resultText(result)).toContain(`  primary ${colorToHex(orange)}`);
    expect(resultText(result)).toContain('borderRadius takes the name');
    expect(tokens.units).toEqual({ pixelsPerInch: 96, rootFontSize: 16 });
    expect(resultText(result)).toContain('1in = 96px, 1pt = 1.333px, 1mm = 3.78px, 1rem = 16px');
  });

  it('reads the theme where a control is, when part of the screen has its own', async () => {
    const result = await screen().call('tokens_view', { role: 'button', name: 'In the dark' });
    const tokens = result.structuredContent as unknown as ThemeTokens;

    expect(result.isError).toBe(false);
    expect(tokens.colors.background).toBe(colorToHex(darkColors.background));
    expect(resultText(result)).toContain('The theme in force at button "In the dark".');
  });

  it('reads the theme being designed in, where the application designs in themes of its own', async () => {
    // A design editor: drawn in its own theme, designing a project in another.
    const project: UiTheme = { ...lightTheme, colors: { ...lightTheme.colors, primary: rgb8(0, 128, 96) } };
    const projectDark: UiTheme = { ...darkTheme, colors: { ...darkTheme.colors, primary: rgb8(0, 200, 150) } };
    const surface = screen(true, () => ({ light: project, dark: projectDark }));

    const light = await surface.call('tokens_view', {});
    const dark = await surface.call('tokens_view', { theme: 'dark' });
    const own = await surface.call('tokens_view', { theme: 'app' });

    expect((light.structuredContent as unknown as ThemeTokens).colors.primary).toBe(colorToHex(rgb8(0, 128, 96)));
    expect(resultText(light)).toContain('The light theme being designed in. Write these names');
    expect((dark.structuredContent as unknown as ThemeTokens).colors.primary).toBe(colorToHex(rgb8(0, 200, 150)));
    expect((own.structuredContent as unknown as ThemeTokens).colors.primary).toBe(colorToHex(orange));
  });

  it('says so when the control named is not on the screen', async () => {
    const result = await screen().call('tokens_view', { role: 'button', name: 'Nowhere' });
    expect(result.isError).toBe(true);
  });

  it('says so when the host cannot report a theme', async () => {
    const result = await screen(false).call('tokens_view', {});
    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe('This application does not report its theme to agents.');
  });
});
