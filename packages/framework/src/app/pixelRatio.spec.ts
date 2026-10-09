import { describe, expect, it } from 'vitest';

import { watchPixelRatio } from './pixelRatio';

/** A window whose ratio the test changes, with media queries that stop matching when it does. */
function fakeWindow(ratio: number) {
  const queries: { media: string; listeners: Set<() => void> }[] = [];
  const view = {
    devicePixelRatio: ratio,
    matchMedia(media: string) {
      const entry = { media, listeners: new Set<() => void>() };
      queries.push(entry);
      return {
        media,
        addEventListener: (_type: string, listener: () => void) => entry.listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => entry.listeners.delete(listener)
      } as unknown as MediaQueryList;
    },
    /** Moves the window to a display of another density. */
    moveTo(next: number) {
      const was = `(resolution: ${view.devicePixelRatio}dppx)`;
      view.devicePixelRatio = next;
      for (const q of queries.filter(q => q.media === was)) for (const listener of [...q.listeners]) listener();
    },
    queries
  };
  return view;
}

describe('watchPixelRatio', () => {
  it('hears each change of ratio, asking again for the new one each time', () => {
    const view = fakeWindow(2);
    const heard: number[] = [];
    watchPixelRatio(dpr => heard.push(dpr), view);
    view.moveTo(1);
    view.moveTo(1.5);
    expect(heard).toEqual([1, 1.5]);
    expect(view.queries.map(q => q.media)).toEqual([
      '(resolution: 2dppx)',
      '(resolution: 1dppx)',
      '(resolution: 1.5dppx)'
    ]);
  });

  it('hears nothing once stopped', () => {
    const view = fakeWindow(2);
    const heard: number[] = [];
    const stop = watchPixelRatio(dpr => heard.push(dpr), view);
    stop();
    view.moveTo(1);
    expect(heard).toEqual([]);
  });

  it('does nothing where there is no window to watch', () => {
    expect(() => watchPixelRatio(() => {}, undefined)()).not.toThrow();
  });
});
