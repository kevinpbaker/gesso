import { describe, expect, it } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Pulse } from './PulseExample';

/**
 * The home page's argument rests on this thing drawing a frame whenever
 * the runtime gives it one, and saying so itself.
 *
 * The counters are read off the nodes' own `text` properties rather than
 * out of `debug()`, which prints the accessible name: they are the same
 * strings here, and only one of them is what the screen paints.
 */
describe('the home page pulse', () => {
  it('counts one frame per frame, from the runtime rather than a timer', () => {
    const ui = renderTest(createComponent(Pulse, { label: 'Render worker' }), { width: 460, height: 200 });
    const counter = ui.getByText(/^\d+ frames$/);
    const started = Number(String(counter.getProperty('text')).split(' ')[0]);

    for (let frame = 0; frame < 5; frame++) {
      ui.frame();
    }

    // No timers advanced and no time passed: the only thing that
    // happened is frames, which is the whole claim.
    expect(counter.getProperty('text')).toBe(`${started + 5} frames`);
  });

  it('times itself, on the clock of the thread it is drawing on', () => {
    const ui = renderTest(createComponent(Pulse, { label: 'Render worker' }), { width: 460, height: 200 });

    ui.frame();
    ui.frame();

    const gap = ui.getByText(/worst frame gap/);
    expect(String(gap.getProperty('text'))).toMatch(/^worst frame gap \d+ ms$/);
  });
});
