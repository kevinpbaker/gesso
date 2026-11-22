import { describe, expect, it, vi } from 'vitest';

import { PaintRecorder, UiNodeType, type UiPaint } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Uploads } from './ProgressBarExample';

const mount = () => renderTest(createComponent(Uploads, {}), { width: 460, height: 320 });

/**
 * The page claims three things about `ProgressBar`: that a determinate
 * bar reports the value it was given against the range it was given,
 * that an indeterminate one reports `busy` and no value at all, and
 * that the sweep of an indeterminate bar is layout rather than a
 * computed offset.
 */
describe('the docs progress bar example', () => {
  it('reports the value, and the range it is measured against', () => {
    const ui = mount();

    const upload = ui.getByRole('progressbar', { name: 'Upload' });
    expect(upload).toHaveSemantics({ role: 'progressbar', name: 'Upload' });
    expect(ui.getSemantics(upload)).toMatchObject({ valueNow: 0.35, valueMin: 0, valueMax: 1 });
    // A range of its own, reported as it stands rather than as a
    // fraction the caller had to work out.
    expect(ui.getSemantics(ui.getByRole('progressbar', { name: 'Disk used' }))).toMatchObject({
      valueNow: 34,
      valueMin: 0,
      valueMax: 120
    });
  });

  it('moves with the buttons, and stops at both ends of the range', () => {
    const ui = mount();
    const bar = ui.getByRole('progressbar', { name: 'Upload' });

    ui.fireEvent.click(ui.getByRole('button', { name: 'More' }));
    ui.frame();
    expect(ui.getSemantics(bar).valueNow).toBeCloseTo(0.5);

    for (let press = 0; press < 6; press++) {
      ui.fireEvent.click(ui.getByRole('button', { name: 'More' }));
      ui.frame();
    }
    expect(ui.getSemantics(bar).valueNow).toBe(1);

    for (let press = 0; press < 10; press++) {
      ui.fireEvent.click(ui.getByRole('button', { name: 'Less' }));
      ui.frame();
    }
    expect(ui.getSemantics(bar).valueNow).toBe(0);
    expect(ui.getByText('0% of 24 MB')).toBeDefined();
  });

  it('says busy and no value at all while it is indeterminate', () => {
    const ui = mount();
    const bar = ui.getByRole('progressbar', { name: 'Indexing' });

    // ARIA omits the value rather than reporting zero: zero is a
    // stronger and different claim than unknown.
    expect(bar).toHaveSemantics({ role: 'progressbar', name: 'Indexing', states: ['busy'] });
    expect(ui.getSemantics(bar).valueNow).toBeUndefined();
    expect(ui.getSemantics(bar).valueMin).toBeUndefined();
    expect(ui.getSemantics(bar).valueMax).toBeUndefined();
  });

  it('sweeps the indeterminate sliver across the track as a percentage of it', async () => {
    vi.useFakeTimers();
    try {
      const ui = mount();
      await vi.advanceTimersByTimeAsync(0);
      const track = ui.getByRole('progressbar', { name: 'Indexing' });
      // Under the fragment `show` leaves where the sliver goes, since the
      // bar swaps sliver and fill as its value comes and goes.
      let sliver = track.firstChild;
      while (sliver !== null && sliver.type === UiNodeType.Fragment) {
        sliver = sliver.firstChild;
      }
      if (sliver === null) {
        throw new Error('The indeterminate bar has no sliver.');
      }

      // Painted at a fraction of a box the track's size, so a step of
      // the sweep is a new picture rather than a layout change.
      const at = (width: number): number => {
        const recorder = new PaintRecorder();
        (sliver!.properties.get('paint') as UiPaint).draw(recorder, {
          width,
          height: 6,
          paddingTop: 0,
          paddingRight: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          scale: 1
        });
        const shape = recorder.finish().ops.find(op => op.op === 'roundRect');
        return shape !== undefined && shape.op === 'roundRect' ? shape.x : Number.NaN;
      };
      const first = at(240);
      // A step is 90 ms, and the runtime waits it out with a timer
      // rather than taking a frame it would draw nothing on.
      await vi.advanceTimersByTimeAsync(200);
      ui.frame(200);

      const later = at(240);
      expect(later).not.toEqual(first);
      // A fraction of the track, so the sweep follows the bar when the
      // bar is resized.
      expect(later).toBeGreaterThan(0);
      expect(at(480)).toBeCloseTo(later * 2);
    } finally {
      vi.useRealTimers();
    }
  });
});
