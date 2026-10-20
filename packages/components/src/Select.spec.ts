import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Column, Row, shortcut, shortcuts, UiShortcutRegistry } from 'gesso-core';
import { Select } from './Select';

/**
 * Type-ahead against a page's own single-letter shortcuts. A key the
 * select uses is the select's: found in the issue tracker, where `l`
 * typed into an open "Add a filter" list to reach Label also ran the
 * list's `l` shortcut behind it.
 */
function mount() {
  const registry = new UiShortcutRegistry();
  const ran = vi.fn();
  const value = new BehaviorSubject('');
  const ui = renderTest(
    Column(
      {
        width: 400,
        height: 300,
        modifiers: [
          shortcuts({ registry }),
          shortcut({ registry, keys: 'l', label: 'Labels', scoped: false, run: ran }),
          shortcut({ registry, keys: 'z', label: 'Zoom', scoped: false, run: ran })
        ]
      },
      createComponent(Select, {
        label: 'Add a filter',
        value,
        onChange: (next: string) => value.next(next),
        options: [
          { value: 'status', label: 'Status' },
          { value: 'label', label: 'Label' }
        ]
      })
    ),
    { width: 400, height: 300 }
  );
  ui.fireEvent.focus(ui.getByRole('combobox', { name: 'Add a filter' }));
  ui.frame();
  return { ...ui, ran, value };
}

describe('a select and the page’s shortcuts', () => {
  it('keeps every letter typed into its open list', () => {
    const ui = mount();
    ui.fireEvent.press('Enter');
    ui.frame();

    ui.fireEvent.press('l');
    ui.frame();
    // One that starts nothing is still the list's, not the page's.
    ui.fireEvent.press('z');
    ui.frame();
    expect(ui.ran).not.toHaveBeenCalled();

    ui.fireEvent.press('Enter');
    ui.frame();
    expect(ui.value.value).toBe('label');
  });

  it('keeps a letter that picks an option while closed, and lets the rest through', () => {
    const ui = mount();
    ui.fireEvent.press('l');
    ui.frame();
    expect(ui.value.value).toBe('label');
    expect(ui.ran).not.toHaveBeenCalled();

    ui.fireEvent.press('z');
    ui.frame();
    expect(ui.ran).toHaveBeenCalledTimes(1);
  });

  it('leaves a key held with Mod to the shortcuts', () => {
    const registry = mount();
    registry.fireEvent.press('Enter');
    registry.frame();
    registry.fireEvent.press('l', { ctrl: true });
    registry.frame();
    // Not a type-ahead: the highlight didn't move to Label.
    registry.fireEvent.press('Enter');
    registry.frame();
    expect(registry.value.value).toBe('status');
  });
});

/**
 * Found in the issue tracker at 320 pixels wide: three selects sharing
 * a row of a phone-width dialog, and the one showing "No priority" ran
 * past the dialog's edge, because its value never truncated and so set
 * its minimum width.
 */
describe('a select in a narrow row', () => {
  it('gives way to the row, truncating its value rather than running past the edge', () => {
    const select = (label: string, value: string) =>
      createComponent(Select, {
        label,
        value,
        flexGrow: 1,
        flexBasis: 0,
        options: [{ value, label: value }]
      });
    const ui = renderTest(
      Row(
        { width: 240, gap: 10 },
        select('Team', 'Web'),
        select('Status', 'Todo'),
        select('Priority', 'No priority at all')
      ),
      { width: 400, height: 200 }
    );
    const boxes = ['Team', 'Status', 'Priority'].map(name => ui.getLayout(ui.getByRole('combobox', { name })));
    for (const [i, box] of boxes.entries()) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(240);
      if (i > 0) expect(box.x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width);
    }
    // The value is cut short inside the trigger, before the chevron.
    const priority = boxes[2];
    const value = ui.getLayout(ui.getByText('No priority at all'));
    expect(value.x + value.width).toBeLessThanOrEqual(priority.x + priority.width - 16);
  });
});

const COUNTRIES = Array.from({ length: 50 }, (_, at) => ({ value: `c${at + 1}`, label: `Country ${at + 1}` }));

/**
 * Found in the component workbench, on fifty countries: the open list
 * had no height of its own to keep to, so it ran past the top and the
 * bottom of the window, and End highlighted an option nobody could see.
 */
describe('a select with more options than the window has room for', () => {
  function mountLong(start: string) {
    const ui = renderTest(
      Column({ padding: 10 }, createComponent(Select, { label: 'Country', defaultValue: start, options: COUNTRIES })),
      { width: 400, height: 400 }
    );
    ui.fireEvent.focus(ui.getByRole('combobox', { name: 'Country' }));
    ui.fireEvent.press('Enter');
    ui.frame();
    return ui;
  }

  it('is cut to the window, and keeps the highlight in view as the keys walk it', () => {
    const ui = mountLong('c1');
    const list = () => ui.getLayout(ui.getByRole('listbox'));
    expect(list().y).toBeGreaterThanOrEqual(0);
    expect(list().y + list().height).toBeLessThanOrEqual(400);
    expect(ui.getVisibleBox(ui.getByRole('option', { name: 'Country 50' })).y).toBeGreaterThan(400);

    ui.fireEvent.press('End');
    ui.frame();
    const last = ui.getVisibleBox(ui.getByRole('option', { name: 'Country 50' }));
    expect(last.y).toBeGreaterThanOrEqual(list().y);
    expect(last.y + last.height).toBeLessThanOrEqual(list().y + list().height);

    ui.fireEvent.press('Home');
    ui.frame();
    expect(ui.getVisibleBox(ui.getByRole('option', { name: 'Country 1' })).y).toBeGreaterThanOrEqual(list().y);
  });

  it('opens scrolled to the chosen option', () => {
    const ui = mountLong('c40');
    const list = ui.getLayout(ui.getByRole('listbox'));
    const chosen = ui.getVisibleBox(ui.getByRole('option', { name: 'Country 40' }));
    expect(chosen.y).toBeGreaterThanOrEqual(list.y);
    expect(chosen.y + chosen.height).toBeLessThanOrEqual(list.y + list.height);
  });
});

/**
 * The chosen option was a `selected` state and nothing drawn: once the
 * arrows had moved the highlight off it, nothing on screen said which
 * one the select holds. A tick, in the column a menu and a combobox
 * keep for theirs.
 */
describe('the chosen option in an open select', () => {
  it('is ticked, and only it', () => {
    const value = new BehaviorSubject('label');
    const ui = renderTest(
      createComponent(Select, {
        label: 'Field',
        value,
        onChange: (next: string) => value.next(next),
        options: [
          { value: 'status', label: 'Status' },
          { value: 'label', label: 'Label' }
        ]
      }),
      { width: 400, height: 300 }
    );
    ui.fireEvent.focus(ui.getByRole('combobox', { name: 'Field' }));
    ui.fireEvent.press('Enter');
    ui.frame();

    const ticks = ui.getAllByText('✓');
    expect(ticks).toHaveLength(1);
    const tick = ui.getLayout(ticks[0]);
    const row = ui.getLayout(ui.getByRole('option', { name: 'Label' }));
    expect(tick.y).toBeGreaterThanOrEqual(row.y);
    expect(tick.y + tick.height).toBeLessThanOrEqual(row.y + row.height);

    // Walking off it leaves the tick where the value is.
    ui.fireEvent.press('ArrowUp');
    ui.frame();
    expect(ui.getAllByText('✓')).toHaveLength(1);
  });
});
