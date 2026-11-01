import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';

import { OrderList } from './ScrollAreaExample';

/**
 * The page says the list fades its bottom edge until the end is in
 * view and offers a way back to the top past 240 pixels; this checks
 * both, as the example is written.
 */
describe('the docs scroll area example', () => {
  it('fades the bottom at first, and offers the way back once scrolled far', () => {
    const ui = renderTest(createComponent(OrderList, {}), { width: 400, height: 320 });
    let time = 0;
    const settle = () => {
      for (let i = 0; i < 40; i++) {
        time += 16;
        ui.frame(time);
      }
    };
    settle();
    const fades = ui.allNodes().filter(node => node.properties.get('backgroundGradient') !== undefined);
    expect(fades).toHaveLength(2);
    expect(fades[1]!.properties.get('opacity') ?? 1).toBe(1);

    ui.fireEvent.wheel({ x: 200, y: 160, deltaY: 400 });
    settle();
    expect(ui.getByRole('button', { name: 'Back to top' })).toBeDefined();
    expect(fades[0]!.properties.get('opacity') ?? 1).toBe(1);
  });
});
