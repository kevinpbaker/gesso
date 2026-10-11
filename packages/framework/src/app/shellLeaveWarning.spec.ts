import { describe, expect, it } from 'vitest';

import { setLeaveWarning } from './shellLeaveWarning';

function beforeUnload(): Event {
  return new Event('beforeunload', { cancelable: true });
}

describe('setLeaveWarning', () => {
  it('asks the browser to warn while it is on, and stops listening when it is off', () => {
    const view = new EventTarget();
    let listeners = 0;
    const add = view.addEventListener.bind(view);
    const remove = view.removeEventListener.bind(view);
    const counted = {
      addEventListener: (...args: Parameters<EventTarget['addEventListener']>) => {
        listeners++;
        add(...args);
      },
      removeEventListener: (...args: Parameters<EventTarget['removeEventListener']>) => {
        listeners--;
        remove(...args);
      }
    };

    setLeaveWarning(counted, true);
    // Said twice, still one listener.
    setLeaveWarning(counted, true);
    expect(listeners).toBe(1);
    const warned = beforeUnload();
    view.dispatchEvent(warned);
    expect(warned.defaultPrevented).toBe(true);

    setLeaveWarning(counted, false);
    // None left, so the back/forward cache can keep the page again.
    expect(listeners).toBe(0);
    const free = beforeUnload();
    view.dispatchEvent(free);
    expect(free.defaultPrevented).toBe(false);
  });

  it('does nothing without a window', () => {
    expect(() => setLeaveWarning(undefined, true)).not.toThrow();
    expect(() => setLeaveWarning(null, false)).not.toThrow();
  });
});
