import { describe, expect, it } from 'vitest';

import { Button, Column, colorToHex, darkColors, darkTheme, lightTheme, rgb8, type UiTheme } from 'gesso-core';
import { mountRuntime } from '../app/RuntimeTestUtils';
import type { ThemeTokens } from './tokens';
import { uiSurface, type UiHost } from './ui';

/**
 * `tokens_view` on a real runtime: the theme the screen is drawn with,
 * read where the application set it and where a part of the screen
 * set its own.
 */

const orange = rgb8(255, 85, 0);
const brand: UiTheme = { ...lightTheme, colors: { ...lightTheme.colors, primary: orange } };

function screen(withTheme = true) {
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
    ...(withTheme ? { theme: (at?: string) => mounted.runtime.themeAt(at) } : {})
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
    expect(result.content[0]!.text).toContain("The theme in force at the application's outermost content.");
    expect(result.content[0]!.text).toContain(`  primary ${colorToHex(orange)}`);
    expect(result.content[0]!.text).toContain('borderRadius takes the name');
  });

  it('reads the theme where a control is, when part of the screen has its own', async () => {
    const result = await screen().call('tokens_view', { role: 'button', name: 'In the dark' });
    const tokens = result.structuredContent as unknown as ThemeTokens;

    expect(result.isError).toBe(false);
    expect(tokens.colors.background).toBe(colorToHex(darkColors.background));
    expect(result.content[0]!.text).toContain('The theme in force at button "In the dark".');
  });

  it('says so when the control named is not on the screen', async () => {
    const result = await screen().call('tokens_view', { role: 'button', name: 'Nowhere' });
    expect(result.isError).toBe(true);
  });

  it('says so when the host cannot report a theme', async () => {
    const result = await screen(false).call('tokens_view', {});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe('This application does not report its theme to agents.');
  });
});
