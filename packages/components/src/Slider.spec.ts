import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Box, PaintRecorder, type UiNode, type UiPaint } from 'gesso-core';

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

/**
 * `paintedFill`: the fill and thumb drawn at the value rather than laid
 * out there, for a seek bar whose value moves on its own. The claim is
 * that it is the same picture, so each painted shape is compared with
 * the box the laid-out slider puts in its place.
 */
describe('Slider, painted fill', () => {
  interface Shape {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
  }

  /** The rounded rectangle a painted node draws at `scale`, on the surface. */
  function drawn(ui: Rendered, node: UiNode, scale: number): Shape {
    const box = ui.getLayout(node)!;
    const recorder = new PaintRecorder();
    (node.properties.get('paint') as UiPaint).draw(recorder, {
      width: box.width,
      height: box.height,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      scale
    });
    const shape = recorder.finish().ops.find(op => op.op === 'roundRect');
    if (shape === undefined || shape.op !== 'roundRect') {
      throw new Error('the painted node drew no shape');
    }
    return { x: box.x + shape.x, y: box.y + shape.y, width: shape.width, height: shape.height, radius: shape.radius };
  }

  /**
   * Where the renderers paint a laid-out box at `scale`: each edge on
   * its nearest device pixel (`PixelSnap`'s rule). The painted boxes sit
   * on whole device pixels here, as a picture is placed on them.
   */
  function snappedBox(box: Shape, scale: number): Shape {
    const left = Math.round(box.x * scale) / scale;
    const right = Math.round((box.x + box.width) * scale) / scale;
    return { ...box, x: left, width: right - left };
  }

  function expectSame(actual: Shape, expected: Shape, where: string): void {
    for (const key of ['x', 'y', 'width', 'height', 'radius'] as const) {
      expect(actual[key], `${where}: ${key}`).toBeCloseTo(expected[key], 9);
    }
  }

  it('draws its fill and thumb where the laid-out ones are painted, in either direction and at either end', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      // 37.3 puts the end of the fill and the thumb between pixels, and
      // at 1.5 between device pixels too.
      for (const defaultValue of [0.5, 20, 37.3, 100]) {
        for (const scale of [1, 1.5, 2]) {
          const where = `${direction} at ${defaultValue}, scale ${scale}`;
          const laid = mount(direction, { thumb: true, defaultValue, step: 0.1 }).ui;
          const painted = mount(direction, { thumb: true, defaultValue, step: 0.1, paintedFill: true }).ui;

          const fill = laid.getLayout(trackOf(laid).firstChild!.firstChild!)!;
          expectSame(
            drawn(painted, trackOf(painted).firstChild!.firstChild!, scale),
            snappedBox({ ...fill, radius: 2 }, scale),
            `${where}, fill`
          );

          const thumb = laid.getLayout(trackOf(laid).lastChild!.lastChild!)!;
          expectSame(
            drawn(painted, trackOf(painted).lastChild!.lastChild!, scale),
            snappedBox({ ...thumb, radius: 6 }, scale),
            `${where}, thumb`
          );
        }
      }
    }
  });

  it('draws no fill at the start of the range', () => {
    const { ui } = mount('ltr', { defaultValue: 0, paintedFill: true });
    const recorder = new PaintRecorder();
    const node = trackOf(ui).firstChild!.firstChild!;
    (node.properties.get('paint') as UiPaint).draw(recorder, {
      width: ui.getLayout(node)!.width,
      height: 4,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      scale: 1
    });
    expect(recorder.finish().ops).toEqual([]);
  });

  it('moves its fill without laying anything out, and is pressed and spoken as before', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      // With its label hidden, as a seek bar's is: a label shows the
      // value as text, and new text is laid out.
      const { ui, changes } = mount(direction, { thumb: true, paintedFill: true, labelHidden: true });
      const strip = ui.getLayout(trackOf(ui))!;
      const frames = ui.frames.length;

      ui.fireEvent.pointerDown(strip.x + strip.width * 0.25, strip.y + strip.height / 2);
      ui.frame();

      expect(changes, direction).toEqual([direction === 'ltr' ? 25 : 75]);
      expect(ui.getByRole('slider').properties.get('valueNow'), direction).toBe(changes[0]);
      const after = ui.frames.slice(frames);
      expect(after.length, direction).toBeGreaterThan(0);
      expect(
        after.every(frame => frame.layoutPasses === 0),
        direction
      ).toBe(true);
    }
  });
});
