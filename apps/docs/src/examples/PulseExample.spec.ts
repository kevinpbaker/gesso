import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Pulse } from './PulseExample';

/**
 * The home page's argument rests on this thing stepping on its own
 * thread's timer, and saying what it measured itself.
 *
 * Fake timers, because the sweep is an interval: time has to pass
 * before there is anything for a frame to draw.
 *
 * The counters are read off the nodes' own `text` properties rather
 * than out of `debug()`, which prints the accessible name: they are the
 * same strings here, and only one of them is what the screen paints.
 */
describe('the home page pulse', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('steps on its own timer and draws each step', () => {
    const ui = renderTest(createComponent(Pulse, { label: 'Render worker' }), { width: 460, height: 220 });
    const steps = ui.getByText('0 steps');

    let time = 0;
    for (let step = 0; step < 4; step++) {
      vi.advanceTimersByTime(50);
      ui.frame((time += 50));
    }

    // 200 ms of time, a 40 ms interval: five steps, each of which asked
    // the runtime for the frame that drew it.
    expect(steps.getProperty('text')).toBe('5 steps');
  });

  it('reports the longest frame it measured itself', () => {
    const ui = renderTest(createComponent(Pulse, { label: 'Render worker' }), { width: 460, height: 220 });

    vi.advanceTimersByTime(120);
    ui.frame(120);

    const gap = ui.getByText(/longest frame/);
    expect(String(gap.getProperty('text'))).toMatch(/^longest frame \d+ ms$/);
  });

  it('paints the caption it was given, rather than the page drawing one', () => {
    const ui = renderTest(createComponent(Pulse, { label: 'Render worker', caption: 'In a render worker' }), {
      width: 460,
      height: 220
    });

    expect(ui.getByText('In a render worker')).toBeDefined();
  });

  it('never walks the longest frame back down', () => {
    const ui = renderTest(createComponent(Pulse, { label: 'Render worker' }), { width: 460, height: 220 });

    // A long gap, then a run of short ones. Real time passes here
    // rather than fake, because the reading is taken from the clock the
    // component is drawing on.
    vi.advanceTimersByTime(400);
    ui.frame(400);
    const after = String(ui.getByText(/longest frame/).getProperty('text'));

    for (let step = 0; step < 6; step++) {
      vi.advanceTimersByTime(40);
      ui.frame();
    }

    expect(String(ui.getByText(/longest frame/).getProperty('text'))).toBe(after);
  });
});
