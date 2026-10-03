import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, OverlayService } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Toast, type ToastProps } from './Toast';

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
  it('is 24 pixels off the bottom left corner by default', () => {
    const entry = mount({ message: 'Saved' }).entries()[0]!;
    expect([entry.bottom, entry.left, entry.right, entry.center]).toEqual([24, 24, undefined, undefined]);
  });

  it('can sit in the middle of the bottom edge, or at its end, at any distance', () => {
    const middle = mount({ message: 'Saved', placement: 'bottom', offset: 72 }).entries()[0]!;
    expect([middle.bottom, middle.left, middle.right, middle.center]).toEqual([72, undefined, undefined, 'x']);
    const end = mount({ message: 'Saved', placement: 'bottom-end', offset: 16 }).entries()[0]!;
    expect([end.bottom, end.left, end.right, end.center]).toEqual([16, undefined, 16, undefined]);
  });
});
