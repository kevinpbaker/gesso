import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Box, type UiNode } from 'gesso-core';

import { Slider, type SliderProps } from './Slider';

/** The slider's track strip: the second child of the node that is the slider. */
function trackOf(ui: Pick<Rendered, 'getByRole'>): UiNode {
  const strip = ui.getByRole('slider').firstChild?.nextSibling;
  if (strip === null || strip === undefined) {
    throw new Error('the slider has no track');
  }
  return strip;
}

/** A 0–100 slider filling a 400px box, read in the given direction. */
function mount(direction: 'ltr' | 'rtl', props: Partial<SliderProps> = {}) {
  const changes: number[] = [];
  const ui = renderTest(
    Box(
      { width: 400, height: 200, textDirection: direction, x: 'stretch', y: 'start' },
      createComponent(Slider, {
        label: 'Volume',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 20,
        onChange: (v: number) => changes.push(v),
        ...props
      })
    ),
    { width: 400, height: 200 }
  );
  ui.frame();
  return { ui, changes };
}

describe('Slider, right to left', () => {
  it('fills from the right, and a press means what the fill says it does', () => {
    const { ui, changes } = mount('rtl');
    const strip = ui.getLayout(trackOf(ui))!;
    const fill = ui.getLayout(trackOf(ui).firstChild!.firstChild!)!;

    // The track is laid out from its start, which reads from the right.
    expect(fill.x + fill.width).toBe(strip.x + strip.width);
    expect(fill.x).toBeGreaterThan(strip.x);

    // A quarter of the way in from the left is three quarters of the
    // way along a track that starts at the right. It used to read as a
    // quarter, so a press put the value where the fill was not.
    ui.fireEvent.pointerDown(strip.x + strip.width * 0.25, strip.y + strip.height / 2);
    expect(changes).toEqual([75]);
  });

  it('centres its thumb on the end of the fill', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      const { ui } = mount(direction, { thumb: true });
      const strip = trackOf(ui);
      const fill = ui.getLayout(strip.firstChild!.firstChild!)!;
      const thumb = ui.getLayout(strip.lastChild!.lastChild!)!;
      // The end of the fill is the side away from where the track starts.
      const end = direction === 'ltr' ? fill.x + fill.width : fill.x;
      expect(thumb.x + thumb.width / 2).toBe(end);
    }
  });

  it('centres its thumb on the end of the fill at either end of the track', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      for (const defaultValue of [0, 100]) {
        const { ui } = mount(direction, { thumb: true, defaultValue });
        const strip = trackOf(ui);
        const fill = ui.getLayout(strip.firstChild!.firstChild!)!;
        const thumb = ui.getLayout(strip.lastChild!.lastChild!)!;
        const end = direction === 'ltr' ? fill.x + fill.width : fill.x;
        // At the far end the thumb hangs half off the track, and the row
        // holding it used to shrink the spacer before it to make room, so
        // the thumb sat short of the end of the fill it marks.
        expect(thumb.x + thumb.width / 2, `${direction} at ${defaultValue}`).toBe(end);
      }
    }
  });

  it('moves the value toward the arrow, so Left is more', () => {
    const { ui, changes } = mount('rtl');
    ui.fireEvent.focus(ui.getByRole('slider'));

    ui.fireEvent.keyDown('ArrowLeft');
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowRight');
    // Up and Down are not about reading direction and do not flip.
    ui.fireEvent.keyDown('ArrowUp');

    expect(changes).toEqual([21, 20, 19, 20]);
  });

  it('is unchanged left to right', () => {
    const { ui, changes } = mount('ltr');
    const strip = ui.getLayout(trackOf(ui))!;
    ui.fireEvent.focus(ui.getByRole('slider'));

    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowLeft');
    ui.fireEvent.pointerDown(strip.x + strip.width * 0.25, strip.y + strip.height / 2);

    expect(changes).toEqual([21, 20, 25]);
  });
});

describe('Slider, disabled', () => {
  it('takes neither focus nor a value from a press', () => {
    const { ui, changes } = mount('ltr', { disabled: true });
    const strip = ui.getLayout(trackOf(ui))!;

    ui.fireEvent.pointerDown(strip.x + strip.width / 2, strip.y + strip.height / 2);
    ui.frame();

    expect(changes).toEqual([]);
    expect(ui.getByRole('slider')).not.toHaveFocus();
  });
});
