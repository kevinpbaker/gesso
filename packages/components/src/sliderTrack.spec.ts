import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { renderTest } from 'gesso-testing';
import { Box, Column, type UiNode } from 'gesso-core';

import { fractionOf, pageStep, snap, thumbLayer, trackFill, valueAt } from './sliderTrack';

/**
 * The arithmetic and the layout `Slider` and `RangeSlider` share. The
 * components' own specs are what prove the behaviour; these pin each
 * piece on its own, so a change made for one component is caught here
 * before it reaches the other.
 */
describe('sliderTrack', () => {
  const box = { x: 100, y: 0, width: 200, height: 20 };

  it('reads a pointer as a fraction of the range from where the track starts', () => {
    expect(valueAt(150, box, false, 0, 100)).toBe(25);
    // Right to left the track starts at its right edge.
    expect(valueAt(150, box, true, 0, 100)).toBe(75);
    // Outside the track is the nearer end, not a value off it.
    expect(valueAt(0, box, false, 0, 100)).toBe(0);
    expect(valueAt(500, box, false, 10, 20)).toBe(20);
  });

  it('has no value for a pointer until the track has been measured', () => {
    expect(valueAt(150, { x: 0, y: 0, width: 0, height: 0 }, false, 0, 100)).toBeNull();
  });

  it('turns a value into a fraction of the track, held inside it', () => {
    expect(fractionOf(25, 0, 100)).toBe(0.25);
    expect(fractionOf(-5, 0, 100)).toBe(0);
    expect(fractionOf(500, 0, 100)).toBe(1);
    // An empty range has nowhere to put the value but the start.
    expect(fractionOf(5, 5, 5)).toBe(0);
  });

  it('snaps to the step and then holds the result inside what the caller allows', () => {
    expect(snap(23.6, 0, 100, 5)).toBe(25);
    expect(snap(140, 0, 100, 5)).toBe(100);
    // A bound tighter than the range is applied after snapping, so a
    // step that would pass it stops on it rather than rounding past.
    expect(snap(68, 0, 100, 5, 0, 66)).toBe(66);
    expect(snap(12, 0, 100, 5, 14, 100)).toBe(14);
  });

  it('pages a tenth of the range, and never less than a step', () => {
    expect(pageStep(0, 100, 1)).toBe(10);
    expect(pageStep(0, 10, 5)).toBe(5);
  });

  it('fills in the accent, and in the disabled foreground when disabled', () => {
    const seen: string[] = [];
    const disabled = new BehaviorSubject(false);
    trackFill(disabled).subscribe(token => seen.push(token));
    disabled.next(true);
    expect(seen).toEqual(['controlAccent', 'controlForegroundDisabled']);
  });

  it('centres the thumb on the fraction, out to either end, in either direction', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      for (const part of [0, 0.25, 1]) {
        let thumb: UiNode | null = null;
        const ui = renderTest(
          Column(
            { width: 200, height: 40, textDirection: direction, x: 'stretch', y: 'center' },
            Box(
              { width: 200, height: 20, y: 'center' },
              thumbLayer(new BehaviorSubject(part), 12, { ref: (node: UiNode | null) => (thumb = node) })
            )
          ),
          { width: 200, height: 40 }
        );
        ui.frame();
        const layout = ui.getLayout(thumb!)!;
        const along = direction === 'ltr' ? 200 * part : 200 * (1 - part);
        expect(layout.width, `${direction} at ${part}`).toBe(12);
        expect(layout.x + layout.width / 2, `${direction} at ${part}`).toBe(along);
      }
    }
  });
});
