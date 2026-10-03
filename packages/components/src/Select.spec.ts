import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Column, shortcut, shortcuts, UiShortcutRegistry } from 'gesso-core';
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
