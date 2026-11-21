import { describe, expect, it } from 'vitest';

import { Column } from 'gesso-core';
import { createComponent, internalState } from 'gesso-framework';
import { renderTest } from 'gesso-testing';

import { Checkbox } from './Checkbox';
import { Menu } from './Menu';

/**
 * What the controls claim of the keys that scroll a page, so a shell a
 * worker away cancels the page's scroll for them and for nothing else.
 * A menu handles its keys by hand and claims them by its role; a
 * checkbox binds a `keymap`, which marks its handler with its keys.
 */
describe('claimed keys of the controls', () => {
  it('claims every scrolling key while a menu is open, and none once it closes', () => {
    const open = internalState(false);
    const ui = renderTest(
      Column(
        { width: 300, height: 200 },
        createComponent(Menu, {
          open,
          at: { x: 10, y: 10 },
          items: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' }
          ],
          onOpenChange: (next: boolean) => (open.value = next)
        })
      ),
      { width: 300, height: 200 }
    );
    ui.frame();
    expect(ui.runtime.claimedKeys()).toEqual([]);

    open.value = true;
    ui.frame();
    expect(ui.runtime.claimedKeys()).toEqual([
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'PageUp',
      'PageDown',
      'Home',
      'End',
      ' '
    ]);

    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(ui.runtime.claimedKeys()).toEqual([]);
  });

  it('claims Space for a focused checkbox, which its keymap binds, and leaves the arrows to the page', () => {
    const ui = renderTest(createComponent(Checkbox, { label: 'Wrap lines' }), { width: 300, height: 100 });
    ui.frame();
    ui.runtime.input.focus.focus(ui.getByRole('checkbox', { name: 'Wrap lines' }));
    ui.frame();

    expect(ui.runtime.claimedKeys()).toEqual([' ']);
  });
});
