import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Slider } from 'gesso-components';
import type { UiNode } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Sliders } from './SliderExample';

const SIZE = { width: 460, height: 300 };

function sliders() {
  return renderTest(createComponent(Sliders, {}), SIZE);
}

/**
 * The track strip: the second child of the node that *is* the slider.
 *
 * A slider's track carries no role of its own, because a slider is one
 * control and one thing to announce, so there is nothing to query it
 * by. The page says the track measures itself; this is how a test
 * reaches the node that does.
 */
function trackOf(ui: Pick<Rendered, 'getByRole'>, name: string): UiNode {
  const strip = ui.getByRole('slider', { name }).firstChild?.nextSibling;
  if (strip === null || strip === undefined) {
    throw new Error(`the ${name} slider has no track`);
  }
  return strip;
}

/**
 * What the page claims: the value, the range and the spoken form are
 * all announced; every key in the keyboard table moves the value the
 * way the table says; the track turns a pointer into a value; and the
 * application owns a controlled slider while an uncontrolled one owns
 * itself.
 */
describe('the docs slider example', () => {
  it('announces its value, its range and how to say it', () => {
    const ui = sliders();

    expect(ui.getByRole('slider', { name: 'Volume' })).toHaveSemantics({ role: 'slider', name: 'Volume', value: 40 });
    expect(ui.getSemantics(ui.getByRole('slider', { name: 'Volume' }))).toMatchObject({
      valueMin: 0,
      valueMax: 100,
      valueText: '40%'
    });
    expect(ui.getSemantics(ui.getByRole('slider', { name: 'Zoom' }))).toMatchObject({
      valueNow: 100,
      valueMin: 50,
      valueMax: 200,
      valueText: '100%'
    });
  });

  it('steps, pages and jumps with the keys the table lists', () => {
    const ui = sliders();
    const zoom = ui.getByRole('slider', { name: 'Zoom' });
    // The semantics tree is rebuilt on a frame, so a value read
    // straight after a key press is the one from before it.
    const value = (): number | undefined => {
      ui.frame();
      return ui.getSemantics(zoom).valueNow;
    };

    ui.fireEvent.focus(zoom);

    // Zoom runs 50 to 200 in steps of 25, so a page is a tenth of the
    // range (15) or one step, whichever is larger: 25.
    ui.fireEvent.press('PageUp');
    expect(value()).toBe(125);
    ui.fireEvent.press('ArrowRight');
    expect(value()).toBe(150);
    ui.fireEvent.press('ArrowUp');
    expect(value()).toBe(175);
    ui.fireEvent.press('End');
    expect(value()).toBe(200);
    // Already at the end: a step past it is clamped, not wrapped.
    ui.fireEvent.press('ArrowRight');
    expect(value()).toBe(200);
    ui.fireEvent.press('PageDown');
    expect(value()).toBe(175);
    ui.fireEvent.press('ArrowLeft');
    expect(value()).toBe(150);
    ui.fireEvent.press('ArrowDown');
    expect(value()).toBe(125);
    ui.fireEvent.press('Home');
    expect(value()).toBe(50);

    // Nothing here was written by the example: an uncontrolled slider
    // manages its own value, and the controlled one beside it did not
    // move while this one did.
    expect(ui.getSemantics(ui.getByRole('slider', { name: 'Volume' })).valueNow).toBe(40);
  });

  it('turns a press on the track into a value', () => {
    const ui = sliders();
    const volume = ui.getByRole('slider', { name: 'Volume' });
    const track = trackOf(ui, 'Volume');
    // The measure modifier reported the strip's box on the first frame.
    ui.frame();
    const box = ui.getLayout(track);

    // Halfway along a 0 to 100 track, which the step of 5 leaves alone.
    ui.fireEvent.pan(track, box.x + box.width / 2, box.y + box.height / 2);
    ui.frame();
    expect(ui.getSemantics(volume).valueNow).toBe(50);
    expect(ui.getSemantics(volume).valueText).toBe('50%');
  });

  it('lets the application refuse a value the control asked for', () => {
    const ui = sliders();
    const volume = ui.getByRole('slider', { name: 'Volume' });

    ui.fireEvent.focus(volume);
    ui.fireEvent.press('End');
    ui.frame();

    // End asked for 100. The example writes back `min(80, next)`, and
    // what a controlled slider shows is what was written back.
    expect(ui.getSemantics(volume).valueNow).toBe(80);
    expect(ui.getSemantics(volume).valueText).toBe('80%');

    // The same value arriving with no gesture behind it at all.
    ui.fireEvent.click(ui.getByRole('button', { name: 'Mute' }));
    ui.frame();
    expect(ui.getSemantics(volume).valueNow).toBe(0);
  });

  it('does not move a controlled value the application never writes back', () => {
    const level = new BehaviorSubject(30);
    const ui = renderTest(createComponent(Slider, { label: 'Volume', min: 0, max: 100, step: 5, value: level }), SIZE);
    const slider = ui.getByRole('slider');

    ui.fireEvent.focus(slider);
    ui.fireEvent.press('ArrowRight');
    ui.fireEvent.press('End');
    ui.frame();
    expect(ui.getSemantics(slider).valueNow).toBe(30);

    level.next(45);
    ui.frame();
    expect(ui.getSemantics(slider).valueNow).toBe(45);
  });
});
