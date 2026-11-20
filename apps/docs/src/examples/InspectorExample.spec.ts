import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';

import { RectInspector } from './InspectorExample';

const SIZE = { width: 420, height: 400 };

/** What the inspector page claims about its example. */
describe('the docs inspector example', () => {
  it('shows one rectangle’s values, and Mixed where two chosen differ', () => {
    const ui = renderTest(createComponent(RectInspector, {}), SIZE);
    const height = ui.getByLabel('Height');
    expect(ui.getSemantics(height).valueText).toBe('200 mm');
    ui.fireEvent.click(ui.getByLabel('Both'));
    ui.frame();
    expect(ui.getSemantics(ui.getByLabel('Height')).valueText).toBe('Mixed');
    // The same width is not mixed.
    expect(ui.getSemantics(ui.getByLabel('Width')).valueText).toBe('300 mm');
  });

  it('moves each chosen rectangle from its own value on an arrow', () => {
    const ui = renderTest(createComponent(RectInspector, {}), SIZE);
    ui.fireEvent.click(ui.getByLabel('Both'));
    ui.frame();
    ui.fireEvent.focus(ui.getByLabel('Height'));
    ui.fireEvent.keyDown('ArrowUp', { shift: true });
    ui.frame();
    ui.fireEvent.click(ui.getByLabel('Bottom'));
    ui.frame();
    expect(ui.getSemantics(ui.getByLabel('Height')).valueText).toBe('130 mm');
  });
});
