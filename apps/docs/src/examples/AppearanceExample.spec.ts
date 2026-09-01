import { describe, expect, it } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Appearance } from './AppearanceExample';

/**
 * The example on the appearance page, asserted on the same file the
 * page shows and the canvas runs.
 */
describe('the docs appearance example', () => {
  it('follows the appearance the shell reports', () => {
    const ui = renderTest(createComponent(Appearance, {}), { width: 420, height: 240 });

    expect(ui.getByText('Light')).toBeDefined();

    // What the shell does when the page's theme toggle is used.
    ui.runtime.setColorScheme('dark');
    ui.frame();

    expect(ui.getByText('Dark')).toBeDefined();
  });
});
