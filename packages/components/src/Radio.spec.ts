import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Box, type UiNode } from 'gesso-core';

import { RadioGroup } from './Radio';

const options = [
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' }
];

function mount(props: Omit<Parameters<typeof createComponent<typeof RadioGroup>>[1], 'options'>) {
  return renderTest(createComponent(RadioGroup, { label: 'Payment', options, ...props }), { width: 400, height: 300 });
}

/** Each option's circle: the first child of the row that is the radio. */
function circles(ui: Pick<Rendered, 'getAllByRole'>): UiNode[] {
  return ui.getAllByRole('radio').map(radio => radio.firstChild!);
}

describe('RadioGroup, invalid', () => {
  it('rings every circle in the danger colour, as a checkbox rings its box', () => {
    for (const props of [{ invalid: true }, { error: 'Choose how to pay' }]) {
      const ui = mount(props);
      // It used to say so only in the message and the semantics: the
      // circles drew exactly as a valid group's do.
      expect(circles(ui).map(circle => circle.properties.get('borderColor'))).toEqual(['danger', 'danger']);
    }
  });

  it('keeps the focused choice accent, and goes back to plain when it is valid again', () => {
    const error = new BehaviorSubject('Choose how to pay');
    const ui = mount({ error, defaultValue: 'bank' });
    ui.fireEvent.focus(ui.getByRole('radiogroup'));
    ui.frame();

    // Where the arrows are is still the thing focus has to say.
    expect(circles(ui).map(circle => circle.properties.get('borderColor'))).toEqual(['danger', 'controlAccent']);

    error.next('');
    ui.fireEvent.blur();
    ui.frame();
    expect(circles(ui).map(circle => circle.properties.get('borderColor'))).toEqual(['controlBorder', 'controlBorder']);
  });
});

describe('RadioGroup, direction', () => {
  it('reads its direction once, when it renders', () => {
    const direction = new BehaviorSubject<'row' | 'column'>('row');
    const ui = mount({ direction });
    const before = ui.getAllByRole('radio').map(radio => ui.getLayout(radio)!);
    expect(before[1].x).toBeGreaterThan(before[0].x);

    // Documented on the prop: a group that has to change direction
    // changes its `key`, as a `SegmentedControl` that changes size does.
    direction.next('column');
    ui.frame();
    const after = ui.getAllByRole('radio').map(radio => ui.getLayout(radio)!);
    expect(after[1].x).toBe(before[1].x);
  });
});

describe('RadioGroup, right to left', () => {
  const three = [
    { value: 'card', label: 'Card' },
    { value: 'bank', label: 'Bank transfer' },
    { value: 'cash', label: 'Cash' }
  ];

  function mountIn(direction: 'ltr' | 'rtl') {
    const changes: string[] = [];
    const ui = renderTest(
      Box(
        { width: 400, height: 200, textDirection: direction, x: 'stretch', y: 'start' },
        createComponent(RadioGroup, {
          label: 'Payment',
          options: three,
          direction: 'row',
          defaultValue: 'bank',
          onChange: (next: string) => changes.push(next)
        })
      ),
      { width: 400, height: 200 }
    );
    ui.fireEvent.focus(ui.getByRole('radiogroup'));
    ui.frame();
    return { ui, changes };
  }

  it('moves toward the arrow, so Left is the next option when the row reads from the right', () => {
    const { ui, changes } = mountIn('rtl');
    // The row is laid out from the right: the first option is the
    // rightmost one.
    const [card, bank] = ui.getAllByRole('radio').map(radio => ui.getLayout(radio).x);
    expect(card).toBeGreaterThan(bank);

    ui.fireEvent.press('ArrowLeft');
    ui.frame();
    ui.fireEvent.press('ArrowRight');
    ui.frame();
    ui.fireEvent.press('ArrowRight');
    ui.frame();
    // Left went on to cash, Right came back to bank and on to card. It
    // used to be the other way round, so the arrows moved away from
    // the option they pointed at.
    expect(changes).toEqual(['cash', 'bank', 'card']);
  });

  it('is unchanged left to right, and Up and Down never depend on the reading direction', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      const { ui, changes } = mountIn(direction);
      ui.fireEvent.press('ArrowDown');
      ui.frame();
      ui.fireEvent.press('ArrowUp');
      ui.frame();
      expect(changes).toEqual(['cash', 'bank']);
    }
    const { ui, changes } = mountIn('ltr');
    ui.fireEvent.press('ArrowRight');
    ui.frame();
    ui.fireEvent.press('ArrowLeft');
    ui.frame();
    expect(changes).toEqual(['cash', 'bank']);
  });
});
