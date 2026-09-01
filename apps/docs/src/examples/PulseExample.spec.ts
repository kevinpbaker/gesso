import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Pulse } from './PulseExample';

/**
 * The home page's argument rests on this thing never stopping, so the
 * spec checks that it does not: given time and frames, the sweep moves
 * and the counter climbs.
 *
 * Fake timers, because the sweep is an interval — time has to pass
 * before there is anything for a frame to draw.
 *
 * The counter is read off the node's own `text` property rather than
 * out of `debug()`, which prints the accessible name: they are the same
 * string here, and only one of them is what the screen paints.
 */
describe('the home page pulse', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps drawing for as long as it is given time', () => {
    const ui = renderTest(createComponent(Pulse, { label: 'Render worker' }), { width: 420, height: 200 });
    ui.frame(0);

    expect(ui.getByText('Render worker')).toBeDefined();
    const counter = ui.getByText('updates: 0');

    let time = 0;
    for (let step = 0; step < 4; step++) {
      vi.advanceTimersByTime(50);
      ui.frame((time += 50));
    }

    // 200 ms of time, a 40 ms interval: five writes.
    expect(counter.getProperty('text')).toBe('updates: 5');
  });
});
