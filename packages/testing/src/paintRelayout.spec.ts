import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Column, Paint, percent, Row, Text, type PaintSurface, type UiPaint } from 'gesso-core';
import { createComponent, type ComponentContext, type Inputs } from 'gesso-framework';

import { renderTest } from './renderTest';

/**
 * A new picture is a repaint, not a relayout.
 *
 * Found by gesso-code's minimap: a painted node sized by its parent
 * (height 100%) whose picture changed on every frame of a scroll. `paint`
 * affects layout, because a painter may declare an intrinsic size, so
 * each new picture laid the tree out again up to the root, thirteen
 * nodes a frame, while the picture could not have moved anything. Now a
 * picture with the same declared size marks paint only.
 */
describe('changing what a painted node draws', () => {
  function screen(paint: BehaviorSubject<UiPaint>) {
    return function Screen(_inputs: Inputs<{}>, _ctx: ComponentContext) {
      return Column(
        { width: percent(100), height: percent(100) },
        Text({ text: 'above' }),
        Row({ flex: 1 }, Text({ text: 'beside', flex: 1 }), Paint({ width: 80, height: percent(100), paint }))
      );
    };
  }

  it('re-measures nothing when the declared size is unchanged, and still draws the new picture', () => {
    let drawn = 0;
    const picture = (n: number): UiPaint => ({
      draw: (surface: PaintSurface) => {
        drawn++;
        surface.fillColor('primary');
        surface.beginPath();
        surface.rect(0, n, 10, 10);
        surface.fill();
      },
      inputs: [n]
    });
    const paint = new BehaviorSubject(picture(0));
    const ui = renderTest(createComponent(screen(paint), {}), { width: 400, height: 300 });
    ui.frame();
    const before = drawn;

    paint.next(picture(1));
    ui.frame();

    expect(ui.frames[ui.frames.length - 1].measured).toBe(0);
    expect(drawn).toBeGreaterThan(before);
  });

  it('lays out again when the declared size changes', () => {
    const sized = (width: number): UiPaint => ({ draw: () => {}, intrinsicWidth: width, inputs: [width] });
    const paint = new BehaviorSubject(sized(20));
    function Shrinkwrapped(_inputs: Inputs<{}>, _ctx: ComponentContext) {
      return Row({}, Paint({ height: 10, paint }), Text({ text: 'after' }));
    }
    const ui = renderTest(createComponent(Shrinkwrapped, {}), { width: 400, height: 300 });
    ui.frame();
    const after = ui.getByText('after');
    expect(ui.getLayout(after).x).toBe(20);

    paint.next(sized(50));
    ui.frame();

    expect(ui.getLayout(after).x).toBe(50);
  });
});
