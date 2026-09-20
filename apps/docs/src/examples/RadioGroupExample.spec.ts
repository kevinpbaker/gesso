import { describe, expect, it } from 'vitest';

import type { UiNode } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Shipping } from './RadioGroupExample';

const mount = () => renderTest(createComponent(Shipping, {}), { width: 420, height: 320 });

/** The option a screen reader would report as chosen, across both groups. */
function chosen(ui: Rendered): string[] {
  return ui
    .getAllByRole('radio')
    .filter((node: UiNode) => (ui.getSemantics(node).states ?? []).includes('checked'))
    .map((node: UiNode) => ui.getSemantics(node).label ?? '');
}

/**
 * The page claims the group is one tab stop whose arrows move the
 * choice, that they wrap and step over a disabled option, that Home and
 * End go to the ends, and that a controlled group moves only when the
 * application writes the value back. Each is a test, driven through the
 * keys the keyboard table names.
 */
describe('the docs radio group example', () => {
  it('announces two groups and every option in them', () => {
    const ui = mount();

    expect(ui.getByRole('radiogroup', { name: 'Delivery' })).toHaveSemantics({ role: 'radiogroup' });
    expect(ui.getByRole('radiogroup', { name: 'Billing period' })).toHaveSemantics({ role: 'radiogroup' });

    // The options are `radio`, in document order, and the chosen one in
    // each group is the one carrying `checked`.
    expect(ui.getAllByRole('radio').map(node => ui.getSemantics(node).label)).toEqual([
      'Standard, five days',
      'Express, two days',
      'Same-day courier',
      'Monthly',
      'Yearly',
      'Every two years'
    ]);
    expect(chosen(ui)).toEqual(['Standard, five days', 'Monthly']);
  });

  it('moves the choice with the arrows, and stops where the application says no', () => {
    const ui = mount();

    ui.fireEvent.focus(ui.getByRole('radiogroup', { name: 'Delivery' }));
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();

    expect(chosen(ui)).toEqual(['Express, two days', 'Monthly']);

    // The next step reaches the courier, the handler declines to write
    // it, and a controlled group shows only what was written.
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();

    expect(chosen(ui)).toEqual(['Express, two days', 'Monthly']);
    expect(ui.getByText('No courier reaches your address')).toBeDefined();

    ui.fireEvent.keyDown('ArrowUp');
    ui.frame();

    expect(chosen(ui)).toEqual(['Standard, five days', 'Monthly']);
  });

  it('wraps, steps over the disabled option, and answers Home and End', () => {
    const ui = mount();

    ui.fireEvent.focus(ui.getByRole('radiogroup', { name: 'Billing period' }));
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();

    expect(chosen(ui)).toEqual(['Standard, five days', 'Yearly']);

    // Every two years is disabled, so the next step is not it: the
    // choice wraps to the top of the group instead.
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();

    expect(chosen(ui)).toEqual(['Standard, five days', 'Monthly']);

    // End is the last option that can be chosen, not the last one drawn.
    ui.fireEvent.keyDown('End');
    ui.frame();

    expect(chosen(ui)).toEqual(['Standard, five days', 'Yearly']);

    ui.fireEvent.keyDown('Home');
    ui.frame();

    expect(chosen(ui)).toEqual(['Standard, five days', 'Monthly']);

    ui.fireEvent.keyDown('ArrowLeft');
    ui.frame();

    expect(chosen(ui)).toEqual(['Standard, five days', 'Yearly']);
  });

  it('refuses a click on a disabled option, and keeps the uncontrolled value to itself', () => {
    const ui = mount();

    ui.fireEvent.click(ui.getByRole('radio', { name: 'Every two years' }));
    ui.frame();

    expect(chosen(ui)).toEqual(['Standard, five days', 'Monthly']);

    ui.fireEvent.click(ui.getByRole('radio', { name: 'Yearly' }));
    ui.frame();

    // The group owns that value, so nothing in the application changed
    // with it, including the group the application does own.
    expect(chosen(ui)).toEqual(['Standard, five days', 'Yearly']);
  });
});
