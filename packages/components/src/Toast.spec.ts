import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, OverlayService } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Column, darkTheme, percent, UiEnvironmentKeys, type UiChild } from 'gesso-core';
import { Toast, type ToastPlacement, type ToastProps } from './Toast';

/**
 * The parts of a toast the docs example doesn't cover: an action, and
 * where on the bottom edge it's pinned. The example's spec covers the
 * roles, the timer and the dismiss button.
 */
function mount(props: ToastProps) {
  const open = new BehaviorSubject(true);
  const closed = vi.fn(() => open.next(false));
  const ui = renderTest(createComponent(Toast, { ...props, open, onClose: closed }), { width: 600, height: 400 });
  ui.frame();
  return { ...ui, closed, entries: () => ui.runtime.services.get(OverlayService).entries.value };
}

describe('a toast with an action', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws a button named by the action, which runs it and closes the toast', () => {
    const acted = vi.fn();
    const ui = mount({ message: 'Moved 3 issues to Done', action: 'Undo', onAction: acted });

    ui.fireEvent.click(ui.getByRole('button', { name: 'Undo' }));
    ui.frame();

    expect(acted).toHaveBeenCalledTimes(1);
    expect(ui.closed).toHaveBeenCalledTimes(1);
    expect(ui.entries()).toHaveLength(0);
  });

  it('has no action button without an action', () => {
    const ui = mount({ message: 'Saved' });
    expect(ui.getAllByRole('button').map(button => ui.getSemantics(button).label)).toEqual(['Dismiss']);
  });

  it('still dismisses itself on its timer, without running the action', () => {
    const acted = vi.fn();
    const ui = mount({ message: 'Saved', action: 'Undo', onAction: acted, duration: 1000 });

    vi.advanceTimersByTime(1000);
    ui.frame();

    expect(ui.entries()).toHaveLength(0);
    expect(acted).not.toHaveBeenCalled();
  });
});

describe('where a toast is pinned', () => {
  it('is 24 pixels off the bottom start corner by default', () => {
    const entry = mount({ message: 'Saved' }).entries()[0]!;
    expect([entry.bottom, entry.start, entry.end, entry.center]).toEqual([24, 24, undefined, undefined]);
  });

  it('can sit in the middle of the bottom edge, or at its end, at any distance', () => {
    const middle = mount({ message: 'Saved', placement: 'bottom', offset: 72 }).entries()[0]!;
    expect([middle.bottom, middle.start, middle.end, middle.center]).toEqual([72, undefined, undefined, 'x']);
    const end = mount({ message: 'Saved', placement: 'bottom-end', offset: 16 }).entries()[0]!;
    expect([end.bottom, end.start, end.end, end.center]).toEqual([16, undefined, 16, undefined]);
  });
});

describe('a toast declared open', () => {
  // Found in the issue tracker, which mounts a fresh toast, already
  // open, for each change: it opened before its placeholder was in the
  // tree, with nothing to take a theme from, and drew light on a dark app.
  const themeOf = (ui: ReturnType<typeof renderTest>) =>
    ui.getByRole('status').environment?.get(UiEnvironmentKeys.theme);

  it('takes the theme of the tree it is declared in', () => {
    const ui = renderTest(
      Column({ theme: darkTheme }, createComponent(Toast, { open: true, message: 'Moved 3 issues to Done' })),
      { width: 600, height: 400 }
    );
    ui.frame();
    expect(themeOf(ui)).toBe(darkTheme);
  });

  it('takes it when mounted into a tree that is already there', () => {
    const shown = new BehaviorSubject<UiChild[]>([]);
    const ui = renderTest(Column({ theme: darkTheme }, Column({}, shown)), { width: 600, height: 400 });
    ui.frame();
    shown.next([createComponent(Toast, { open: true, message: 'Moved 3 issues to Done' })]);
    ui.frame();
    expect(themeOf(ui)).toBe(darkTheme);
  });
});

describe('a toast that is being read', () => {
  // Its timer ran whatever the person was doing with it. Tabbing to Undo
  // and reaching it as the four seconds ran out closed the toast under
  // the focus, which went with it, and the pointer resting on it to
  // read a long message saw it leave from under the pointer.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays up while focus is in it, and starts its time again when focus leaves', () => {
    const ui = mount({ message: 'Message deleted', action: 'Undo', duration: 1000 });
    const undo = ui.getByRole('button', { name: 'Undo' });
    ui.fireEvent.focus(undo);
    vi.advanceTimersByTime(5000);
    ui.frame();
    expect(ui.entries()).toHaveLength(1);
    expect(ui.runtime.input.focus.focusedNode).toBe(undo);

    ui.fireEvent.blur();
    ui.frame();
    vi.advanceTimersByTime(999);
    expect(ui.entries()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    ui.frame();
    expect(ui.entries()).toHaveLength(0);
    expect(ui.closed).toHaveBeenCalledTimes(1);
  });

  it('stays up while the pointer is on it, and starts its time again when the pointer leaves', () => {
    const ui = mount({ message: 'Note saved', duration: 1000 });
    const box = ui.getLayout(ui.getByRole('status'));
    ui.fireEvent.pointerMove(box.x + 4, box.y + box.height / 2);
    vi.advanceTimersByTime(5000);
    ui.frame();
    expect(ui.entries()).toHaveLength(1);

    ui.fireEvent.pointerMove(599, 0);
    vi.advanceTimersByTime(999);
    expect(ui.entries()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    ui.frame();
    expect(ui.entries()).toHaveLength(0);
  });
});

describe('a toast in right-to-left text', () => {
  // `start` and `end` are the reading edges. The start corner was the
  // left one whatever the direction, so a toast in an Arabic interface
  // came up in the corner a reader of it looks at last.
  const pinned = (direction: 'ltr' | 'rtl', placement?: ToastPlacement) => {
    const ui = renderTest(
      Column(
        { textDirection: direction, width: percent(100), height: percent(100) },
        createComponent(Toast, { open: true, message: 'Saved', placement })
      ),
      { width: 600, height: 400 }
    );
    ui.frame();
    return ui.getLayout(ui.getByRole('status'));
  };

  it('pins the start corner to the right', () => {
    const box = pinned('rtl');
    expect(box.x + box.width).toBe(600 - 24);
    expect(pinned('ltr').x).toBe(24);
  });

  it('pins the end corner to the left', () => {
    expect(pinned('rtl', 'bottom-end').x).toBe(24);
    const box = pinned('ltr', 'bottom-end');
    expect(box.x + box.width).toBe(600 - 24);
  });
});
