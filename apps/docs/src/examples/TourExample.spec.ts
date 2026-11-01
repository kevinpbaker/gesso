import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';

import { ToolbarTour } from './TourExample';

/**
 * The page says the tour is shown from the start, walks its three
 * steps, ends with Done and starts again from the button; this checks
 * that, as the example is written.
 */
describe('the docs tour example', () => {
  it('walks its steps, ends, and starts again', () => {
    const ui = renderTest(createComponent(ToolbarTour, {}), { width: 480, height: 320 });
    ui.frame();
    expect(ui.getByRole('dialog', { name: 'Write a message' })).toBeDefined();

    for (const next of ['Next', 'Next', 'Done']) {
      ui.fireEvent.click(ui.getByRole('button', { name: next }));
      ui.frame();
    }
    expect(ui.queryByRole('dialog')).toBeNull();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Take the tour' }));
    ui.frame();
    expect(ui.getByRole('dialog', { name: 'Write a message' })).toBeDefined();
  });
});
