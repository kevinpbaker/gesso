import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Select, type SelectOption } from '@gesso/components';
import { OverlayService, createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Checkout } from './SelectExample';

const SIZE = { width: 460, height: 340 };

const mount = () => renderTest(createComponent(Checkout, {}), SIZE);

const entries = (ui: Rendered) => ui.runtime.services.get(OverlayService).entries.value;

const trigger = (ui: Rendered, name: string) => ui.getByRole('combobox', { name });

/** What the trigger says it holds, which is what a screen reader reads. */
const shows = (ui: Rendered, name: string) => ui.getSemantics(trigger(ui, name)).valueText;

/** The option the highlight is painted on, read off its background colour. */
function highlighted(ui: Rendered): string[] {
  return ui
    .getAllByRole('option')
    .filter(node => node.properties.get('backgroundColor') === 'controlBackgroundHovered')
    .map(node => ui.getSemantics(node).label ?? '');
}

/** Focuses a trigger and opens its list, from the keyboard alone. */
function open(ui: Rendered, name: string, key = 'Enter') {
  ui.fireEvent.focus(trigger(ui, name));
  ui.fireEvent.keyDown(key);
  ui.frame();
}

/**
 * The page claims a select is operable from the keyboard alone, that a
 * printed character jumps to an option, that Escape closes without
 * choosing and returns the keyboard to the trigger, that a controlled
 * select moves only when the application writes the value back, and
 * that the whole thing announces itself as a combobox over a listbox of
 * options. Each is a test.
 */
describe('the docs select example', () => {
  it('says what it is, what it holds, and what it demands', () => {
    const ui = mount();

    expect(trigger(ui, 'Payment method')).toHaveSemantics({ role: 'combobox', name: 'Payment method' });
    expect(shows(ui, 'Payment method')).toBe('Card');
    // Nothing is wrong and nothing is open, so there are no states.
    expect(ui.getSemantics(trigger(ui, 'Payment method')).states).toBeUndefined();

    // The empty one is required and invalid, and shows its placeholder.
    expect(ui.getSemantics(trigger(ui, 'Delivery')).states).toEqual(['invalid', 'required']);
    expect(shows(ui, 'Delivery')).toBe('');
    expect(ui.getByText('Pick a speed')).toBeDefined();
  });

  it('opens, walks and chooses from the keyboard alone', () => {
    const ui = mount();
    open(ui, 'Delivery');

    expect(entries(ui)).toHaveLength(1);
    expect(ui.getSemantics(trigger(ui, 'Delivery')).states).toEqual(['expanded', 'invalid', 'required']);

    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Express']);

    ui.fireEvent.keyDown('Enter');
    ui.frame();

    expect(entries(ui)).toHaveLength(0);
    expect(shows(ui, 'Delivery')).toBe('Express');
    // Something was chosen, so the field is no longer invalid.
    expect(ui.getSemantics(trigger(ui, 'Delivery')).states).toEqual(['required']);
    expect(ui.getByText('Paying by card, sent express')).toBeDefined();
  });

  it('opens on Space, Down and Up as well as Enter', () => {
    for (const key of [' ', 'ArrowDown', 'ArrowUp']) {
      const ui = mount();
      open(ui, 'Delivery', key);
      expect(entries(ui)).toHaveLength(1);
    }
  });

  it('walks past a disabled option, and wraps', () => {
    const ui = mount();
    open(ui, 'Payment method');

    // Card is chosen, so the walk starts there.
    expect(highlighted(ui)).toEqual(['Card']);

    ui.fireEvent.keyDown('End');
    ui.frame();
    // Crypto is last and disabled, so End stops on Invoice.
    expect(highlighted(ui)).toEqual(['Invoice']);

    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Card']);

    ui.fireEvent.keyDown('Home');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Card']);
  });

  it('highlights the option Enter would choose, wherever the disabled one sits', () => {
    const seen: string[] = [];
    const options: readonly SelectOption[] = [
      { value: 'crypto', label: 'Crypto', disabled: true },
      { value: 'card', label: 'Card' },
      { value: 'invoice', label: 'Invoice' }
    ];
    const ui = renderTest(
      createComponent(Select, { label: 'Payment', options, onChange: (next: string) => seen.push(next) }),
      SIZE
    );

    ui.fireEvent.focus(ui.getByRole('combobox'));
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    // Nothing is chosen and the first option cannot be, so the
    // highlight opens on Card.
    expect(highlighted(ui)).toEqual(['Card']);

    ui.fireEvent.keyDown('ArrowUp');
    ui.frame();
    // Up wraps past Crypto to the end of what can be chosen.
    expect(highlighted(ui)).toEqual(['Invoice']);

    ui.fireEvent.keyDown('Home');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Card']);

    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(seen).toEqual(['card']);
  });

  it('jumps to an option by its first letter, closed and open', () => {
    const ui = mount();

    // Closed, the letter chooses outright, with no list ever drawn.
    ui.fireEvent.focus(trigger(ui, 'Payment method'));
    ui.fireEvent.keyDown('b');
    ui.frame();
    expect(entries(ui)).toHaveLength(0);
    expect(shows(ui, 'Payment method')).toBe('Bank transfer');

    // Open, it moves the highlight and Enter takes it. The match is
    // case-insensitive and one character at a time, not a buffer.
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    ui.fireEvent.keyDown('C');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Card']);
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(shows(ui, 'Payment method')).toBe('Card');
  });

  it('closes on Escape without choosing, and gives the trigger back', () => {
    const ui = mount();
    const node = trigger(ui, 'Payment method');
    open(ui, 'Payment method');

    ui.fireEvent.keyDown('ArrowDown');
    ui.fireEvent.keyDown('Escape');
    ui.frame();

    expect(entries(ui)).toHaveLength(0);
    expect(shows(ui, 'Payment method')).toBe('Card');
    expect(ui.runtime.input.focus.focusedNode).toBe(node);
    expect(ui.runtime.input.focus.trapped).toBe(false);
  });

  it('does not move a controlled select the application refuses', () => {
    const ui = mount();
    open(ui, 'Payment method');

    ui.fireEvent.click(ui.getByRole('option', { name: 'Invoice' }));
    ui.frame();

    // The list closed, the change was reported, and nothing wrote the
    // value back, so the trigger still shows what it showed.
    expect(entries(ui)).toHaveLength(0);
    expect(shows(ui, 'Payment method')).toBe('Card');
    expect(ui.getByText('Invoice needs an account manager')).toBeDefined();
  });

  it('sits beside its trigger, so the engine can flip it at the edge', () => {
    const ui = mount();
    open(ui, 'Payment method');

    const entry = entries(ui)[0];
    expect(entry.anchor).toBe(trigger(ui, 'Payment method'));
    expect(entry.placement).toBe('bottom-start');
    expect(entry.offset).toBe(4);
    expect(entry.dismissOnOutsidePress).toBe(true);
    // No explicit environment: the anchor is in the tree that opened
    // the list, and the layer falls back to it for the theme.
    expect(entry.environment).toBeUndefined();
  });

  it('announces a listbox of options, with the chosen one selected', () => {
    const ui = mount();
    open(ui, 'Payment method');

    expect(ui.getByRole('listbox')).toHaveSemantics({ role: 'listbox', name: 'Payment method' });

    const records = ui.getAllByRole('option').map(node => ui.getSemantics(node));
    expect(records.map(record => [record.label, record.states, record.posInSet, record.setSize])).toEqual([
      ['Card', ['selected'], 1, 4],
      ['Bank transfer', undefined, 2, 4],
      ['Invoice', undefined, 3, 4],
      ['Crypto', undefined, 4, 4]
    ]);

    // A disabled option is on the record as disabled rather than missing.
    expect(records[3].disabled).toBe(true);

    // Position and size are both counted over the whole list, disabled
    // options included, which is what lets something announce "1 of 4".
    // Which option is chosen is a state, not a number.
    expect(records[0].valueNow).toBeUndefined();

    // An option's own text is claimed as its name rather than
    // announced beside it.
    expect(ui.querySemantics(ui.getByText('Bank transfer'))).toBeNull();
  });

  it('closes the list when the trigger is clicked again', () => {
    const ui = mount();
    open(ui, 'Payment method');

    ui.fireEvent.click(trigger(ui, 'Payment method'));
    ui.frame();

    expect(entries(ui)).toHaveLength(0);
  });

  it('lets an uncontrolled select manage itself, and still reports', () => {
    const seen: string[] = [];
    const options: readonly SelectOption[] = [
      { value: 'one', label: 'One' },
      { value: 'two', label: 'Two' }
    ];
    const ui = renderTest(
      createComponent(Select, {
        label: 'Count',
        options,
        defaultValue: 'one',
        onChange: (next: string) => seen.push(next)
      }),
      SIZE
    );

    ui.fireEvent.focus(ui.getByRole('combobox'));
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    ui.fireEvent.click(ui.getByRole('option', { name: 'Two' }));
    ui.frame();

    // Nothing wrote the value back, and it moved anyway.
    expect(seen).toEqual(['two']);
    expect(ui.getSemantics(ui.getByRole('combobox')).valueText).toBe('Two');
  });

  it('refuses to open while it is disabled', () => {
    const options: readonly SelectOption[] = [{ value: 'one', label: 'One' }];
    const ui = renderTest(
      createComponent(Select, { label: 'Count', options, defaultValue: 'one', disabled: true }),
      SIZE
    );

    ui.fireEvent.focus(ui.getByRole('combobox'));
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    expect(ui.runtime.services.get(OverlayService).entries.value).toHaveLength(0);
  });

  it('shows nothing at all for a value that matches no option', () => {
    const options: readonly SelectOption[] = [{ value: 'one', label: 'One' }];
    const ui = renderTest(
      createComponent(Select, { label: 'Count', options, value: new BehaviorSubject('nine'), placeholder: 'Pick' }),
      SIZE
    );

    // Blank rather than the placeholder, which is for the empty
    // string, and no throw.
    expect(ui.getSemantics(ui.getByRole('combobox')).valueText).toBe('');
    expect(ui.queryByText('Pick')).toBeNull();
  });

  it('throws when it is handed both value and defaultValue', () => {
    const options: readonly SelectOption[] = [{ value: 'one', label: 'One' }];
    expect(() =>
      renderTest(createComponent(Select, { options, value: new BehaviorSubject('one'), defaultValue: 'one' }), SIZE)
    ).toThrow(/Select/);
  });
});
