import { describe, expect, it } from 'vitest';

import { createPaintState, resolvePaintState, UiEnvironmentKeys, type UiNode } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { APP_THEMES, SCOPED_THEME, Themes, type DocsColors } from './ThemesExample';

const INHERITED = 'This card takes the palette provided above it.';
const SCOPED = 'This card provides a palette for itself.';

/** The theme a node resolves against, which is the nearest one provided above it. */
const themeOf = (node: UiNode) => node.environment!.get(UiEnvironmentKeys.theme);

/** What the renderer would paint for a node, tokens already resolved. */
const paint = (node: UiNode) => resolvePaintState(node, createPaintState());

const harbour = APP_THEMES[0]!.theme;
const ember = APP_THEMES[1]!.theme;

/**
 * The page's claims, in the order it makes them: a value provided at one
 * node is inherited below it, a nearer provider wins for its own
 * subtree, and swapping the provided value moves what depends on it
 * without rebuilding anything.
 */
describe('the docs themes example', () => {
  it('inherits the theme provided above it, and paints tokens from it', () => {
    const ui = renderTest(createComponent(Themes, {}), { width: 560, height: 300 });
    const caption = ui.getByText(INHERITED);
    const card = caption.parent!;

    // The identical object, not an equal one: the environment carries
    // the value, it does not copy it.
    expect(themeOf(caption)).toBe(harbour);

    // And a token names an entry of that palette, including
    // `accentSoft`, which no shipped palette has.
    expect(paint(card).backgroundColor).toEqual(harbour.colors.surface);
    expect(paint(caption).textColor).toEqual(harbour.typography.body.color);

    // Both cards carry one, and this is the inherited card's.
    const pill = ui.getAllByText('accentSoft')[0]!.parent!;
    expect(paint(pill).backgroundColor).toEqual((harbour.colors as DocsColors).accentSoft);
  });

  it('moves everything that depends on the theme when the provided value changes', () => {
    const ui = renderTest(createComponent(Themes, {}), { width: 560, height: 300 });
    const caption = ui.getByText(INHERITED);
    const card = caption.parent!;
    const before = paint(card).backgroundColor;

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    // The same nodes: swapping a theme writes properties, it does not
    // rebuild the tree.
    expect(ui.getByText(INHERITED)).toBe(caption);
    expect(themeOf(caption)).toBe(ember);
    expect(paint(card).backgroundColor).toEqual(ember.colors.surface);
    expect(paint(card).backgroundColor).not.toEqual(before);

    // The caption names no colour at all, so it followed the type scale
    // the new theme carries.
    expect(paint(caption).textColor).toEqual(ember.typography.body.color);
  });

  it('lets a nearer provider win, and leaves it alone when the outer one changes', () => {
    const ui = renderTest(createComponent(Themes, {}), { width: 560, height: 300 });
    const scoped = ui.getByText(SCOPED);

    expect(themeOf(scoped)).toBe(SCOPED_THEME);
    expect(themeOf(scoped)).not.toBe(themeOf(ui.getByText(INHERITED)));

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    expect(themeOf(scoped)).toBe(SCOPED_THEME);
    expect(paint(scoped.parent!).backgroundColor).toEqual(SCOPED_THEME.colors.surface);
  });
});
