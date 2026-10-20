import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { NumberInput, type NumberInputProps } from './NumberInput';

/**
 * A number field with its text replaced, the way a person retypes one:
 * select everything in it, then type over the selection.
 */
function retype(props: NumberInputProps, text: string) {
  const changes: number[] = [];
  const ui = renderTest(
    createComponent(NumberInput, { label: 'Guests', ...props, onChange: (v: number) => changes.push(v) }),
    { width: 400, height: 200 }
  );
  const field = ui.getByRole('spinbutton');
  ui.fireEvent.focus(field);
  ui.fireEvent.keyDown('End');
  ui.fireEvent.keyDown('Home', { shift: true });
  for (const character of text) {
    ui.fireEvent.type(character);
    ui.frame();
  }
  return { ui, changes, shown: () => field.properties.get('value') };
}

describe('NumberInput, while it is typed into', () => {
  it('takes a number above its minimum one digit at a time', () => {
    // "1" on the way to "15" is below the minimum. It used to be clamped
    // on the keystroke, so the field turned it into "10" under the caret
    // and the next digit made "105", which the maximum then took.
    const { changes, shown } = retype({ min: 10, max: 100, defaultValue: 10 }, '15');

    expect(shown()).toBe('15');
    expect(changes).toEqual([15]);
  });

  it('reports nothing for text out of range, and bounds it when the field is left', () => {
    const { ui, changes, shown } = retype({ max: 100, defaultValue: 10 }, '105');

    // "1" and "10" are numbers in range and are reported as they come;
    // "105" is not, and the field holds it as typed rather than
    // rewriting it while the person is still typing.
    expect(changes).toEqual([1, 10]);
    expect(shown()).toBe('105');

    ui.fireEvent.blur();
    ui.frame();
    expect(changes).toEqual([1, 10, 100]);
    expect(shown()).toBe('100');
  });

  it('bounds what was typed on Enter, as it does on leaving', () => {
    const { ui, changes, shown } = retype({ min: 10, max: 100, defaultValue: 50 }, '5');

    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(changes).toEqual([10]);
    expect(shown()).toBe('10');
  });
});

describe('NumberInput, left holding something that is not a number', () => {
  it('goes back to its value when left blank, rather than reporting 0', () => {
    const { ui, changes, shown } = retype({ min: 1, max: 9, defaultValue: 4 }, '');
    ui.fireEvent.keyDown('Backspace');
    ui.frame();
    expect(shown()).toBe('');

    ui.fireEvent.blur();
    ui.frame();
    // 0 was never chosen, and here it is not even in range: it used to
    // be reported, and then clamped to 1, which nobody typed either.
    expect(changes).toEqual([]);
    expect(shown()).toBe('4');
  });

  it('goes back to its value when left holding text that does not parse', () => {
    const { ui, changes, shown } = retype({ defaultValue: 12 }, 'abc');

    ui.fireEvent.blur();
    ui.frame();
    expect(changes).toEqual([]);
    expect(shown()).toBe('12');
  });
});
