import { describe, expect, it } from 'vitest';

import { Button, Text } from '@gesso/core';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { HOVER_ACCENT, HOVER_CONTROL } from './interaction';

/**
 * The rule these two modifiers exist for: anything a person can click
 * says so, on a surface where the browser says nothing.
 *
 * Worth a spec of its own rather than one per example, because it is
 * the property most easily lost — a control keeps working perfectly
 * while looking like a label, so nothing else fails when it goes.
 */
describe('the shared interaction modifiers', () => {
  it('lights a control up under the pointer and puts it back on the way out', () => {
    const ui = renderTest(
      Button(
        {
          label: 'Press me',
          width: 120,
          height: 40,
          backgroundColor: 'background',
          cursor: 'pointer',
          modifiers: [HOVER_CONTROL]
        },
        Text({ text: 'Press me' })
      ),
      { width: 300, height: 200 }
    );
    const button = ui.getByRole('button');

    expect(button.getProperty('cursor')).toBe('pointer');
    expect(button.getProperty('backgroundColor')).toBe('background');

    const box = ui.getLayout(button);
    ui.fireEvent.pointerMove(box.x + box.width / 2, box.y + box.height / 2);
    ui.frame();
    expect(button.getProperty('backgroundColor')).toBe('controlBackgroundHovered');

    ui.fireEvent.pointerDown(box.x + box.width / 2, box.y + box.height / 2);
    ui.frame();
    expect(button.getProperty('backgroundColor')).toBe('controlBackgroundPressed');

    ui.fireEvent.pointerUp(box.x + box.width / 2, box.y + box.height / 2);
    ui.fireEvent.pointerMove(box.x + box.width + 40, box.y);
    ui.frame();

    // Back to what the element declared, rather than to a default: the
    // modifier writes through the override cascade.
    expect(button.getProperty('backgroundColor')).toBe('background');
  });

  it('dims a filled accent button instead, because the palette has no hovered accent', () => {
    const ui = renderTest(
      Button(
        {
          label: 'Go',
          width: 80,
          height: 32,
          backgroundColor: 'primary',
          cursor: 'pointer',
          modifiers: [HOVER_ACCENT]
        },
        Text({ text: 'Go' })
      ),
      { width: 300, height: 200 }
    );
    const button = ui.getByRole('button');
    const box = ui.getLayout(button);

    ui.fireEvent.pointerMove(box.x + box.width / 2, box.y + box.height / 2);
    ui.frame();

    expect(button.getProperty('opacity')).toBe(0.88);
    expect(button.getProperty('backgroundColor')).toBe('primary');
  });
});
