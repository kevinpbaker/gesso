import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, OverlayService } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Button, Column } from 'gesso-core';
import { ColorPalette, normalizeHex, PALETTE } from './ColorPalette';

/**
 * A colour chosen from a grid: the keyboard walks it, a click or Enter
 * chooses, and the colour chosen now is where it opens.
 */
describe('ColorPalette', () => {
  function mount(value = '', recent: readonly string[] = []) {
    const open = new BehaviorSubject(false);
    const chosen: string[] = [];
    const ui = renderTest(
      Column(
        Button({ text: 'Fill', label: 'Fill' }),
        createComponent(ColorPalette, {
          open,
          onOpenChange: (next: boolean) => open.next(next),
          value,
          recent,
          automaticLabel: 'No fill',
          label: 'Fill colour',
          onSelect: (color: string) => chosen.push(color)
        })
      ),
      { width: 500, height: 500 }
    );
    const entries = () => ui.runtime.services.get(OverlayService).entries.value;
    return { ui, open, chosen, entries };
  }

  it('offers a named swatch for every colour, and the choice of none', () => {
    const { ui, open } = mount();
    open.next(true);
    ui.frame();
    expect(ui.getByRole('listbox', { name: 'Fill colour' })).toBeDefined();
    expect(ui.getByRole('option', { name: 'No fill' })).toBeDefined();
    expect(ui.getByRole('option', { name: 'light red 3' })).toBeDefined();
    expect(ui.getByRole('option', { name: 'dark blue 2' })).toBeDefined();
    expect(ui.getAllByRole('option')).toHaveLength(1 + PALETTE.flat().length);
  });

  /** The swatch under the pointer is its own colour, ringed, and not washed grey. */
  it('keeps a hovered swatch its own colour', () => {
    const { ui, open } = mount();
    open.next(true);
    ui.frame();
    const red = ui.getByRole('option', { name: 'red' });
    const box = ui.getLayout(red);
    ui.fireEvent.pointerMove(box.x + box.width / 2, box.y + box.height / 2);
    ui.frame();
    expect(red.properties.get('backgroundColor')).toBe('#ff0000');
    expect(red.properties.get('borderColor')).toBe('focusRing');
  });

  it('chooses a colour with a click, and closes', () => {
    const { ui, open, chosen, entries } = mount();
    open.next(true);
    ui.frame();
    ui.fireEvent.click(ui.getByRole('option', { name: 'red' }));
    ui.frame();
    expect(chosen).toEqual(['#ff0000']);
    expect(entries()).toHaveLength(0);
  });

  it('opens on the colour now, and walks from there with the keyboard', () => {
    const { ui, open, chosen } = mount('#ff0000');
    open.next(true);
    ui.frame();
    // Right to orange, down to its dark 1.
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowDown');
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(chosen).toEqual(['#e69138']);
  });

  it('chooses no colour from the top', () => {
    const { ui, open, chosen } = mount('#ff0000');
    open.next(true);
    ui.frame();
    for (let step = 0; step < 10; step++) {
      ui.fireEvent.keyDown('ArrowUp');
    }
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(chosen).toEqual(['']);
  });

  it('closes on Escape without choosing', () => {
    const { ui, open, chosen, entries } = mount();
    open.next(true);
    ui.frame();
    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(chosen).toEqual([]);
    expect(entries()).toHaveLength(0);
    expect(open.value).toBe(false);
  });

  it('offers what was used recently, above the grid', () => {
    const { ui, open, chosen } = mount('', ['#123456']);
    open.next(true);
    ui.frame();
    ui.fireEvent.click(ui.getByRole('option', { name: 'recent #123456' }));
    ui.frame();
    expect(chosen).toEqual(['#123456']);
  });

  it('reads a colour written by hand', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('12ab9F')).toBe('#12ab9f');
    expect(normalizeHex('red')).toBeNull();
  });
});
