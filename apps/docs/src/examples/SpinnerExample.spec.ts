import { describe, expect, it, vi } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Waiting } from './SpinnerExample';

const mount = (reduced = false) =>
  renderTest(createComponent(Waiting, {}), {
    width: 460,
    height: 260,
    onCreate: runtime => runtime.setReducedMotion(reduced)
  });

/**
 * The page claims three things about `Spinner`: that it is a busy
 * `status` with a name whether or not it was given one, that it turns
 * about its own middle from one cell on the frame clock, and that it
 * keeps turning when the reader has asked for reduced motion.
 */
describe('the docs spinner example', () => {
  it('announces all three as busy, and names the one that was not labelled', () => {
    const ui = mount();

    expect(ui.getAllByRole('status')).toHaveLength(3);
    expect(ui.getByRole('status', { name: 'Loading' })).toHaveSemantics({
      role: 'status',
      name: 'Loading',
      states: ['busy']
    });
    expect(ui.getByRole('status', { name: 'Working' })).toHaveSemantics({ states: ['busy'] });
    // A spinner has no value to report: it says work is happening and
    // cannot say how much.
    expect(ui.getSemantics(ui.getByRole('status', { name: 'Working' })).valueNow).toBeUndefined();
  });

  it('turns about its own middle rather than its corner', () => {
    const ui = mount();
    const spinner = ui.getByRole('status', { name: 'Working' });

    // The pivot is half the side, which is what makes this a turn on
    // the spot instead of a swing across the row.
    expect(spinner.properties.get('transform')).toMatchObject({ x: 10, y: 10 });
  });

  it('turns from the frame clock, and keeps turning under reduced motion', async () => {
    for (const reduced of [false, true]) {
      // A step is 110 ms and the runtime waits it out with a timer, so
      // the timers are fake from the start: one armed under the real
      // ones would never fire here.
      vi.useFakeTimers();
      try {
        const ui = mount(reduced);
        await vi.advanceTimersByTimeAsync(0);
        const spinner = ui.getByRole('status', { name: 'Working' });
        const first = spinner.properties.get('transform');

        await vi.advanceTimersByTimeAsync(150);
        ui.frame(150);

        expect(spinner.properties.get('transform')).not.toEqual(first);
        // Still the same pivot: only the rotation moved.
        expect(spinner.properties.get('transform')).toMatchObject({ x: 10, y: 10 });
      } finally {
        vi.useRealTimers();
      }
    }
  });
});
