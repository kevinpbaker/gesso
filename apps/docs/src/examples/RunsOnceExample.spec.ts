import { beforeEach, describe, expect, it } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { resetBodyCount, RunsOnce } from './RunsOnceExample';

/**
 * The page claims a number — four component bodies, however many times
 * the readings change — so the spec asserts that number rather than
 * something adjacent to it.
 */
describe('the docs runs-once example', () => {
  beforeEach(() => {
    resetBodyCount();
  });

  it('runs one body per component, and none of them again when a value changes', () => {
    const ui = renderTest(createComponent(RunsOnce, {}), { width: 460, height: 300 });

    // The root and its three readings.
    expect(ui.getByText('4 component bodies run')).toBeDefined();
    expect(ui.getByText('0 property updates')).toBeDefined();

    for (let press = 0; press < 5; press++) {
      ui.fireEvent.click(ui.getByRole('button'));
      ui.frame();
    }

    expect(ui.getByText('15 property updates')).toBeDefined();
    expect(ui.getByText('4 component bodies run')).toBeDefined();
  });

  it('writes the new number into the row that was already there', () => {
    const ui = renderTest(createComponent(RunsOnce, {}), { width: 460, height: 300 });
    const before = ui.getByText('12.40');

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    // The same node, holding a different number: a property update, not
    // a row that was thrown away and built again.
    expect(ui.getByText('12.75')).toBe(before);
  });
});
