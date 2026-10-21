import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const FRUIT = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot', disabled: true },
  { value: 'avocado', label: 'Avocado' },
  { value: 'banana', label: 'Banana' },
  { value: 'blueberry', label: 'Blueberry' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'new-york', label: 'New York' },
  { value: 'new-zealand', label: 'New Zealand' }
];

/**
 * Type-ahead was one character from the top of the list every time, so
 * of two options sharing a first letter the second could only be
 * reached with the arrows. It is ARIA's listbox type-ahead now: what is
 * typed in quick succession is one search, and the same letter again
 * walks the options starting with it.
 */
describe('type-ahead in a select', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function mountFruit(start = '') {
    const value = new BehaviorSubject(start);
    const ui = renderTest(
      createComponent(Select, {
        label: 'Fruit',
        value,
        onChange: (next: string) => value.next(next),
        options: FRUIT
      }),
      { width: 400, height: 500 }
    );
    ui.fireEvent.focus(ui.getByRole('combobox', { name: 'Fruit' }));
    ui.frame();
    const type = (...keys: string[]) => {
      for (const key of keys) {
        ui.fireEvent.press(key);
        ui.frame();
      }
    };
    /** Opens the list, runs `keys`, and reports what Enter then chooses. */
    const chosenAfter = (...keys: string[]): string => {
      type('Enter', ...keys, 'Enter');
      return value.value;
    };
    return { ...ui, value, type, chosenAfter };
  }

  it('reads letters typed in quick succession as one search', () => {
    const ui = mountFruit();
    // `b` alone is Banana; `bl` is Blueberry, the second of the two.
    expect(ui.chosenAfter('b', 'l')).toBe('blueberry');
  });

  it('takes a space typed mid-search as part of it, rather than as a choice', () => {
    const ui = mountFruit();
    expect(ui.chosenAfter('n', 'e', 'w', ' ', 'z')).toBe('new-zealand');

    // Closed, a space that carries a search on to nothing still opens
    // the list, as it would have with no search running.
    vi.advanceTimersByTime(600);
    ui.type('b', ' ');
    expect(ui.value.value).toBe('banana');
    expect(ui.queryByRole('listbox')).not.toBeNull();
  });

  it('walks the options starting with a letter typed again and again, wrapping', () => {
    const ui = mountFruit();
    // Nothing is chosen, so the first `a` is Apple and the second the
    // next option starting with it, past the disabled Apricot.
    expect(ui.chosenAfter('a', 'a')).toBe('avocado');
    vi.advanceTimersByTime(600);
    // From Avocado, the last of them, the next `a` wraps to the first.
    expect(ui.chosenAfter('a')).toBe('apple');
  });

  it('starts a new search once the keys have paused', () => {
    const ui = mountFruit();
    ui.type('Enter', 'b');
    vi.advanceTimersByTime(499);
    ui.type('l');
    ui.type('Enter');
    expect(ui.value.value).toBe('blueberry');

    ui.type('Enter', 'b');
    vi.advanceTimersByTime(600);
    // A fresh `c`, not `bc`, which matches nothing.
    ui.type('c', 'Enter');
    expect(ui.value.value).toBe('cherry');
  });

  it('skips a disabled option, both when searching and when walking', () => {
    const ui = mountFruit();
    // Only Apricot starts with `apr`, and it cannot be chosen: the
    // highlight stays on Apple, where `ap` left it.
    expect(ui.chosenAfter('a', 'p', 'r')).toBe('apple');
    vi.advanceTimersByTime(600);
    // From Apple, `a` again lands on Avocado, not Apricot.
    expect(ui.chosenAfter('a')).toBe('avocado');
  });

  it('changes the value without opening while closed, and only moves the highlight while open', () => {
    const ui = mountFruit('cherry');
    ui.type('b', 'l');
    expect(ui.queryByRole('listbox')).toBeNull();
    expect(ui.value.value).toBe('blueberry');

    vi.advanceTimersByTime(600);
    ui.type('Enter', 'a', 'v');
    expect(ui.queryByRole('listbox')).not.toBeNull();
    expect(ui.value.value).toBe('blueberry');
    ui.type('Enter');
    expect(ui.value.value).toBe('avocado');
  });

  it('cycles from the value while closed', () => {
    const ui = mountFruit('banana');
    ui.type('b');
    expect(ui.value.value).toBe('blueberry');
    ui.type('b');
    expect(ui.value.value).toBe('banana');
  });
});
