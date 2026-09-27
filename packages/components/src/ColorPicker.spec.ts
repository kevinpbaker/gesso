import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Button, Column } from 'gesso-core';
import { ColorPalette } from './ColorPalette';
import { ColorPicker, hexOfHsv, hsvOfHex } from './ColorPicker';

describe('a colour as hue, saturation and value', () => {
  it('goes there and back', () => {
    for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#c9daf8', '#123456', '#000000', '#ffffff']) {
      expect(hexOfHsv(hsvOfHex(hex))).toBe(hex);
    }
  });

  it('reads the parts people know', () => {
    expect(hsvOfHex('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hsvOfHex('#00ffff').h).toBe(180);
    expect(hsvOfHex('#808080').s).toBe(0);
  });
});

/** Any colour at all, by the square, the bar, the arrows or a hex. */
describe('ColorPicker', () => {
  function mount(value = '#ff0000') {
    const changes: string[] = [];
    const ui = renderTest(
      createComponent(ColorPicker, { value, label: 'Fill', width: 200, onChange: (hex: string) => changes.push(hex) }),
      {
        width: 400,
        height: 400
      }
    );
    const box = (name: string) => ui.getVisibleBox(ui.getByRole('slider', { name }));
    return { ui, changes, box };
  }

  it('takes a colour from where the square is pressed', () => {
    const { ui, changes, box } = mount('#ff0000');
    const square = box('Fill: saturation and brightness');
    // The top left corner is white, whatever the hue.
    ui.fireEvent.pointerDown(square.x + 1, square.y + 1);
    ui.fireEvent.pointerUp(square.x + 1, square.y + 1);
    expect(changes.at(-1)).toMatch(/^#f[a-f0-9]f[a-f0-9]f[a-f0-9]$/);
    // Half way along the bottom is black, or nearly.
    ui.fireEvent.pointerDown(square.x + square.width / 2, square.y + square.height - 0.5);
    ui.fireEvent.pointerUp(square.x + square.width / 2, square.y + square.height - 0.5);
    expect(hsvOfHex(changes.at(-1)!).v).toBeLessThan(0.02);
  });

  it('takes a hue from the bar, and keeps the saturation and brightness', () => {
    const { ui, changes, box } = mount('#ff0000');
    const bar = box('Fill: hue');
    // A third of the way along is green.
    ui.fireEvent.pointerDown(bar.x + bar.width / 3, bar.y + bar.height / 2);
    expect(changes.at(-1)).toBe('#00ff00');
  });

  it('walks with the arrows', () => {
    const { ui, changes } = mount('#ff0000');
    ui.fireEvent.focus(ui.getByRole('slider', { name: 'Fill: saturation and brightness' }));
    ui.fireEvent.keyDown('ArrowDown', { shift: true });
    expect(hsvOfHex(changes.at(-1)!).v).toBeCloseTo(0.9, 1);
    ui.fireEvent.focus(ui.getByRole('slider', { name: 'Fill: hue' }));
    ui.fireEvent.keyDown('ArrowRight', { shift: true });
    expect(hsvOfHex(changes.at(-1)!).h).toBeCloseTo(30, 0);
  });

  it('takes a colour typed as hex', () => {
    const { ui, changes } = mount('#ff0000');
    const field = ui.getByRole('textbox', { name: 'Fill as hex' });
    ui.fireEvent.focus(field);
    ui.fireEvent.press('a', { ctrl: true });
    ui.fireEvent.type('#1a2B3c');
    expect(changes.at(-1)).toBe('#1a2b3c');
  });
});

describe('a palette with somewhere to go for a custom colour', () => {
  it('offers it at the foot, and hands over when it is chosen', () => {
    const open = new BehaviorSubject(true);
    let custom = 0;
    const ui = renderTest(
      Column(
        Button({ text: 'Fill', label: 'Fill' }),
        createComponent(ColorPalette, {
          open,
          onOpenChange: (next: boolean) => open.next(next),
          onCustom: () => custom++
        })
      ),
      { width: 500, height: 500 }
    );
    ui.frame();
    ui.fireEvent.click(ui.getByRole('option', { name: 'Custom colour…' }));
    ui.frame();
    expect(custom).toBe(1);
    expect(open.value).toBe(false);
  });
});
