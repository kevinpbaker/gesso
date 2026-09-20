import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { NumberInput } from 'gesso-components';
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Numbers } from './NumberInputExample';

const SIZE = { width: 460, height: 300 };

function numbers() {
  return renderTest(createComponent(Numbers, {}), SIZE);
}

/**
 * What the page claims: a spinbutton that announces its value and its
 * range, two step buttons that are tab stops like any other, arrows that step and
 * clamp, text that is reported only once it parses as a number, a blur
 * that normalises what is left in the field, and the same ownership
 * rule every control in the library follows.
 */
describe('the docs number input example', () => {
  it('announces a spinbutton with a range, and two buttons that are tab stops like any other', () => {
    const ui = numbers();

    expect(ui.getByRole('spinbutton', { name: 'Guests' })).toHaveSemantics({
      role: 'spinbutton',
      name: 'Guests',
      states: ['required'],
      value: 2
    });
    expect(ui.getSemantics(ui.getByRole('spinbutton', { name: 'Guests' }))).toMatchObject({
      valueMin: 1,
      valueMax: 8,
      valueText: '2'
    });
    expect(ui.getAllByRole('button', { name: 'Increase' })).toHaveLength(2);
    expect(ui.getAllByRole('button', { name: 'Decrease' })).toHaveLength(2);

    // Tab walks through the two steppers on its way out of the field.
    // They were once skipped, on the grounds that the arrows do the
    // same thing; the accessibility gate's rule that every control in
    // the tree is reachable by Tab is the better one, and a person who
    // does not know the arrows work has no other way to press them.
    ui.fireEvent.focus(ui.getByRole('spinbutton', { name: 'Guests' }));
    ui.fireEvent.tab();
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getAllByRole('button', { name: 'Decrease' })[0]);
    ui.fireEvent.tab();
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getAllByRole('button', { name: 'Increase' })[0]);
    ui.fireEvent.tab();
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByRole('button', { name: 'Table for eight' }));
  });

  it('steps with the arrows and the buttons, bounded by the range', () => {
    const ui = numbers();
    const guests = ui.getByRole('spinbutton', { name: 'Guests' });
    const value = (): number | undefined => {
      ui.frame();
      return ui.getSemantics(guests).valueNow;
    };

    ui.fireEvent.focus(guests);
    ui.fireEvent.press('ArrowUp');
    expect(value()).toBe(3);
    ui.fireEvent.press('ArrowDown');
    ui.fireEvent.press('ArrowDown');
    expect(value()).toBe(1);
    // At `min`, and a step below it is clamped rather than reported.
    ui.fireEvent.press('ArrowDown');
    expect(value()).toBe(1);

    // The stepper beside the field is the same move, for a pointer.
    ui.fireEvent.click(ui.getAllByRole('button', { name: 'Increase' })[0]!);
    expect(value()).toBe(2);
    expect(ui.getByText('2 × 45 = 90')).toBeDefined();

    // And the application can write it from outside, past anything the
    // control would have offered.
    ui.fireEvent.click(ui.getByRole('button', { name: 'Table for eight' }));
    expect(value()).toBe(8);
  });

  it('steps an uncontrolled field by its own step, and reports a number only when the text is one', () => {
    const ui = numbers();
    const tip = ui.getByRole('spinbutton', { name: 'Tip' });

    // No cell in the example holds this one, so every move here is the
    // control managing itself.
    ui.fireEvent.focus(tip);
    ui.fireEvent.press('ArrowUp');
    ui.frame();
    expect(ui.getSemantics(tip).valueNow).toBe(3);

    ui.fireEvent.press('End');
    ui.fireEvent.type('a');
    ui.frame();

    // "3a" is not a number, so the value is unchanged; the field is
    // still holding the text, which is what `valueText` reports.
    expect(ui.getSemantics(tip).valueNow).toBe(3);
    expect(ui.getSemantics(tip).valueText).toBe('3a');
  });

  it('normalises the text in the field when it loses focus', () => {
    const ui = numbers();
    const tip = ui.getByRole('spinbutton', { name: 'Tip' });

    ui.fireEvent.focus(tip);
    ui.fireEvent.press('End');
    ui.fireEvent.type('0');
    ui.frame();

    // "2.50" parses as the value it already had, so nothing is
    // reported and the field keeps the text as typed.
    expect(ui.getSemantics(tip).valueText).toBe('2.50');
    expect(ui.getSemantics(tip).valueNow).toBe(2.5);

    ui.fireEvent.blur();
    ui.frame();

    expect(ui.getSemantics(tip).valueText).toBe('2.5');
  });

  it('does not move a controlled value the application never writes back', () => {
    const guests = new BehaviorSubject(2);
    const ui = renderTest(createComponent(NumberInput, { label: 'Guests', min: 1, max: 8, value: guests }), SIZE);
    const field = ui.getByRole('spinbutton');

    ui.fireEvent.focus(field);
    ui.fireEvent.press('ArrowUp');
    ui.fireEvent.click(ui.getByRole('button', { name: 'Increase' }));
    ui.frame();
    expect(ui.getSemantics(field).valueNow).toBe(2);

    guests.next(5);
    ui.frame();
    expect(ui.getSemantics(field).valueNow).toBe(5);
    expect(ui.getSemantics(field).valueText).toBe('5');
  });
});
