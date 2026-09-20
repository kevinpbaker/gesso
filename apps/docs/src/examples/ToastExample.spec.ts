import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toast } from 'gesso-components';
import { createComponent, OverlayService } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Notices } from './ToastExample';

const SIZE = { width: 420, height: 260 };

function mount() {
  const ui = renderTest(createComponent(Notices, {}), SIZE);
  return {
    ...ui,
    /** What the overlay layer is holding, which is where a toast is drawn. */
    entries: () => ui.runtime.services.get(OverlayService).entries.value,
    raise: (name: string) => {
      ui.fireEvent.click(ui.getByLabel(name));
      ui.frame();
    }
  };
}

/**
 * The page claims that a toast is controlled, that it announces itself
 * through a role rather than by taking focus, that `info` waits its
 * turn and `error` interrupts, that a duration dismisses it and 0
 * keeps it up, and that the dismiss button closes it. Each is a test.
 */
describe('the docs toast example', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows nothing until the application opens one', () => {
    const ui = mount();

    expect(ui.entries()).toHaveLength(0);
    expect(ui.queryByRole('status')).toBeNull();
    expect(ui.queryByRole('alert')).toBeNull();
  });

  it('announces an ordinary notice as a status, named by its message', () => {
    const ui = mount();
    ui.raise('Save the note');

    expect(ui.entries()).toHaveLength(1);
    expect(ui.getByRole('status')).toHaveSemantics({ role: 'status', name: 'Note saved' });
    // It waits its turn rather than interrupting, so there is no alert.
    expect(ui.queryByRole('alert')).toBeNull();
  });

  it('announces an error as an alert, which interrupts', () => {
    const ui = mount();
    ui.raise('Save it badly');

    expect(ui.getByRole('alert')).toHaveSemantics({ role: 'alert', name: 'Could not save the note' });
    expect(ui.queryByRole('status')).toBeNull();
  });

  it('never takes the focus away from what raised it', () => {
    const ui = mount();
    const button = ui.getByLabel('Save the note');
    ui.fireEvent.focus(button);
    ui.raise('Save the note');

    expect(ui.runtime.input.focus.focusedNode).toBe(button);
  });

  it('dismisses itself after its duration, and writes the cell back', () => {
    const ui = mount();
    ui.raise('Save the note');

    vi.advanceTimersByTime(2999);
    expect(ui.entries()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    ui.frame();

    // `onClose` ran, so the application's cell went back to false and
    // the same button raises it again.
    expect(ui.entries()).toHaveLength(0);
    expect(ui.queryByRole('status')).toBeNull();
    ui.raise('Save the note');
    expect(ui.entries()).toHaveLength(1);
  });

  it('stays up for as long as it takes when the duration is 0', () => {
    const ui = mount();
    ui.raise('Save it badly');

    vi.advanceTimersByTime(60_000);
    ui.frame();

    expect(ui.getByRole('alert')).toBeDefined();
  });

  it('closes from the dismiss button', () => {
    const ui = mount();
    ui.raise('Save it badly');

    const dismiss = ui.getByRole('button', { name: 'Dismiss' });
    ui.fireEvent.click(dismiss);
    ui.frame();

    expect(ui.entries()).toHaveLength(0);
    expect(ui.queryByRole('alert')).toBeNull();
  });

  it('does not answer Escape, so the key reaches whatever else wants it', () => {
    const ui = mount();
    ui.raise('Save it badly');

    ui.fireEvent.keyDown('Escape');
    ui.frame();

    expect(ui.entries()).toHaveLength(1);
  });

  it('puts the dismiss button in the tab order, after the app that raised it', () => {
    const ui = mount();
    ui.raise('Save it badly');
    ui.fireEvent.focus(ui.getByLabel('Save the note'));

    const reached: (string | undefined)[] = [];
    for (let step = 0; step < 3; step++) {
      ui.fireEvent.tab();
      ui.frame();
      const node = ui.runtime.input.focus.focusedNode;
      reached.push(node === null ? undefined : ui.querySemantics(node)?.label);
    }

    // The overlay layer is mounted above the app root, so the toast's
    // own control comes after the screen's and the order wraps.
    expect(reached).toEqual(['Save it badly', 'Dismiss', 'Save the note']);
  });

  it('takes its accessible name at the moment it opens', () => {
    const open = new BehaviorSubject(true);
    const message = new BehaviorSubject('Note saved');
    const ui = renderTest(createComponent(Toast, { open, message, duration: 0 }), SIZE);
    ui.frame();
    expect(ui.getByRole('status')).toHaveSemantics({ name: 'Note saved' });

    message.next('Note saved to the server');
    ui.frame();

    // The text drawn follows the cell, because it is bound; the name
    // was read once, when the box was built. Raise a new toast rather
    // than editing the message of one that is up.
    expect(ui.getByText('Note saved to the server')).toBeDefined();
    expect(ui.getByRole('status')).toHaveSemantics({ name: 'Note saved' });
  });

  it('is pinned to the bottom left corner rather than placed in the layout', () => {
    const ui = mount();
    ui.raise('Save the note');

    const entry = ui.entries()[0];
    expect(entry.bottom).toBe(24);
    expect(entry.left).toBe(24);
    expect(entry.anchor).toBeUndefined();
    // The placeholder left where the component was declared is what
    // the overlay's content inherits its theme from.
    expect(entry.environment).not.toBeNull();
  });

  it('replaces one notice with the other, because only one is open at a time', () => {
    const ui = mount();
    ui.raise('Save the note');
    expect(ui.getByRole('status')).toBeDefined();

    ui.raise('Save it badly');

    expect(ui.entries()).toHaveLength(1);
    expect(ui.queryByRole('status')).toBeNull();
    expect(ui.getByRole('alert')).toBeDefined();
  });
});
