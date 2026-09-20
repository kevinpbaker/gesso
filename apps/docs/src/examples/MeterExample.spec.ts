import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Storage } from './MeterExample';

const mount = () => renderTest(createComponent(Storage, {}), { width: 720, height: 360 });

/** The two meters, told apart by the name each one carries. */
function meter(ui: ReturnType<typeof mount>, name: string) {
  return ui.getSemantics(ui.getByRole('progressbar', { name }));
}

/**
 * The page claims four things about `Meter`: that a meter reports the
 * measurement in the units it was given, that the bands go one way for
 * `optimum: 'low'` and the other for `optimum: 'high'`, that the
 * formatted reading is what an assistive technology hears rather than
 * the bare number, and that a button moving the value moves the
 * reading with it. Each is a test here, reached the way an assistive
 * technology reaches it.
 */
describe('the docs meter example', () => {
  it('reports the disk in gigabytes, not as a fraction', () => {
    const ui = mount();

    expect(meter(ui, 'Startup disk')).toMatchObject({
      role: 'progressbar',
      label: 'Startup disk',
      valueNow: 86,
      valueMin: 0,
      valueMax: 240
    });
  });

  it('speaks the formatted reading rather than the number', () => {
    const ui = mount();

    // "86" on its own is not a reading anybody can act on, so the
    // component puts `format`'s answer in `valueText`.
    expect(meter(ui, 'Startup disk').valueText).toBe('86 GB of 240 GB used');
    expect(meter(ui, 'Password strength').valueText).toBe('Too short');

    // And the same string is drawn beside each bar.
    expect(ui.getByText('86 GB of 240 GB used')).toBeTruthy();
    expect(ui.getByText('Too short')).toBeTruthy();
  });

  it('walks the disk from the good band into the poor one, and back', () => {
    const ui = mount();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Copy the photos' }));
    ui.frame();

    expect(meter(ui, 'Startup disk').valueNow).toBe(206);
    expect(meter(ui, 'Startup disk').valueText).toBe('206 GB of 240 GB used');

    ui.fireEvent.click(ui.getByRole('button', { name: 'Empty the bin' }));
    ui.frame();

    expect(meter(ui, 'Startup disk').valueNow).toBe(86);
  });

  it('reads the password the other way up, because its good end is high', () => {
    const ui = mount();

    // The field starts too short to score at all, which is the poor
    // band on the `optimum: 'high'` side.
    expect(meter(ui, 'Password strength')).toMatchObject({
      valueNow: 0,
      valueMin: 0,
      valueMax: 4,
      valueText: 'Too short'
    });

    ui.fireEvent.focus(ui.getByRole('textbox', { name: 'New password' }));
    ui.fireEvent.type('abc');
    ui.frame();
    expect(meter(ui, 'Password strength')).toMatchObject({ valueNow: 2, valueText: 'Fair' });

    ui.fireEvent.type('X!');
    ui.frame();
    expect(meter(ui, 'Password strength')).toMatchObject({ valueNow: 4, valueText: 'Strong' });
  });

  it('draws the reading inside the meter, where nothing announces it twice', () => {
    const ui = mount();

    // A `progressbar`'s children are presentational, so the drawn
    // reading has no record of its own and the meter is announced once.
    expect(ui.querySemantics(ui.getByText('Too short'))).toBeNull();
    expect(ui.getAllByRole('progressbar')).toHaveLength(2);
  });
});
