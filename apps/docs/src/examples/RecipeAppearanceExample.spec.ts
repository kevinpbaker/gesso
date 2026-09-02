import { describe, expect, it } from 'vitest';

import { darkTheme, lightTheme } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { AppearanceSetting } from './RecipeAppearanceExample';

const SIZE = { width: 440, height: 320 };

const mount = () => renderTest(createComponent(AppearanceSetting, {}), SIZE);

/** The theme the app's root is providing to everything below it. */
const providedTheme = (ui: Rendered) => ui.getByRole('main').properties.get('theme');

/** Moves the choice with the arrows, which is the group's own keyboard. */
function choose(ui: Rendered, steps: number): void {
  ui.fireEvent.focus(ui.getByRole('radiogroup', { name: 'Appearance' }));
  for (let index = 0; index < Math.abs(steps); index++) {
    ui.fireEvent.keyDown(steps > 0 ? 'ArrowDown' : 'ArrowUp');
  }
  ui.frame();
}

/**
 * Two inputs decide one answer, so the spec drives both: the signal
 * the shell reports, and the choice the reader makes. What it checks
 * is not only the sentence on screen but the theme the app's root is
 * actually providing, because that is what every colour below it
 * resolves against.
 */
describe('the docs appearance recipe', () => {
  it('offers three choices, and starts on the system', () => {
    const ui = mount();

    expect(ui.getByRole('radiogroup', { name: 'Appearance' })).toBeDefined();
    expect(ui.getAllByRole('radio')).toHaveLength(3);
    expect(ui.getByRole('radio', { name: 'Match the system' })).toHaveSemantics({
      role: 'radio',
      name: 'Match the system',
      states: ['checked']
    });
    expect(ui.getByText('Following the system, which reports light.')).toBeDefined();
    expect(providedTheme(ui)).toBe(lightTheme);
  });

  it('follows the platform while the choice is system', () => {
    const ui = mount();

    ui.runtime.setColorScheme('dark');
    ui.frame();

    expect(ui.getByText('Dark appearance')).toBeDefined();
    expect(ui.getByText('Following the system, which reports dark.')).toBeDefined();
    expect(providedTheme(ui)).toBe(darkTheme);
  });

  it('lets an explicit choice override the platform', () => {
    const ui = mount();

    ui.runtime.setColorScheme('dark');
    ui.frame();
    expect(providedTheme(ui)).toBe(darkTheme);

    // One step down the group: system, then light.
    choose(ui, 1);

    expect(ui.getByRole('radio', { name: 'Light' })).toHaveSemantics({
      role: 'radio',
      name: 'Light',
      states: ['checked']
    });
    expect(ui.getByText('Light appearance')).toBeDefined();
    expect(ui.getByText('Set to light, while the system reports dark.')).toBeDefined();
    expect(providedTheme(ui)).toBe(lightTheme);
  });

  it('ignores the platform changing under an explicit choice', () => {
    const ui = mount();

    // Two steps: light, then dark.
    choose(ui, 2);
    expect(providedTheme(ui)).toBe(darkTheme);

    ui.runtime.setColorScheme('light');
    ui.frame();

    // The shell said light and the app stayed dark, which is what
    // "an app with a setting of its own" has to mean.
    expect(providedTheme(ui)).toBe(darkTheme);
    expect(ui.getByText('Set to dark, while the system reports light.')).toBeDefined();
  });

  it('hands the question back to the platform when system is chosen again', () => {
    const ui = mount();

    choose(ui, 2);
    ui.runtime.setColorScheme('dark');
    ui.frame();
    expect(providedTheme(ui)).toBe(darkTheme);

    // Back up to system, with the platform now reporting light. A
    // choice that had been resolved to a colour at the moment it was
    // made could not answer this.
    choose(ui, -2);
    ui.runtime.setColorScheme('light');
    ui.frame();

    expect(providedTheme(ui)).toBe(lightTheme);
    expect(ui.getByText('Following the system, which reports light.')).toBeDefined();
  });

  it('provides a text style beside the theme, so unstyled text follows too', () => {
    const ui = mount();

    ui.runtime.setColorScheme('dark');
    ui.frame();

    // The palette answers a token; the type scale answers text that
    // names no colour at all. A root that provided only the theme
    // would leave that text painting the light theme's black.
    expect(ui.getByRole('main').properties.get('textStyle')).toEqual(darkTheme.typography.body);
  });
});
