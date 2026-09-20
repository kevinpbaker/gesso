import { describe, expect, it } from 'vitest';

import { resolvePropertyByName, type UiColor } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Counter } from './CounterExample';
import { exampleRoot } from './ExampleRoot';

/**
 * The regression this file exists for.
 *
 * The counter sets no colour, so its caption takes the theme's. A root
 * that provided `theme` but not `textStyle` looked right, since the
 * canvas painted the dark background, while every line of text stayed the
 * default black, which on that background is invisible. Nothing failed;
 * it was only visible in a screenshot. So the assertion is on the
 * *resolved* colour of the text node, which is where the two roots
 * differ.
 */
const luminance = (color: UiColor): number => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;

describe('the themed root every example is mounted in', () => {
  it('gives text a colour that follows the appearance', () => {
    const ui = renderTest(exampleRoot(createComponent(Counter, { label: 'Clicks' })), { width: 400, height: 160 });

    const caption = ui.getByText('Clicks: 0');
    const light = resolvePropertyByName<UiColor>(caption, 'color');
    expect(light).toBeDefined();
    expect(luminance(light!)).toBeLessThan(0.5);

    ui.runtime.setColorScheme('dark');
    ui.frame();

    const dark = resolvePropertyByName<UiColor>(caption, 'color');
    expect(dark).toBeDefined();
    expect(luminance(dark!)).toBeGreaterThan(0.5);
  });
});
