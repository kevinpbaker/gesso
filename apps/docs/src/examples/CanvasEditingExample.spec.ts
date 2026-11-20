import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';

import { ShapeEditor } from './CanvasEditingExample';

const SIZE = { width: 480, height: 420 };

/** What the canvas editing page claims about its example. */
describe('the docs canvas editing example', () => {
  it('says each shape to a screen reader, and an agent can choose one and size it from the inspector', () => {
    const ui = renderTest(createComponent(ShapeEditor, {}), SIZE);
    const options = ui.getAllByRole('option');
    expect(options.map(node => ui.getSemantics(node).label)).toEqual([
      'Rectangle 1, 140 × 90',
      'Rectangle 2, 90 × 90',
      'Line 3, 224 long'
    ]);
    ui.fireEvent.click(options[0]);
    ui.frame();
    const width = ui.getByLabel('Width');
    expect(ui.getSemantics(width).valueText).toBe('140');
    ui.fireEvent.focus(width);
    ui.fireEvent.keyDown('ArrowUp', { shift: true });
    ui.frame();
    expect(ui.getSemantics(ui.getAllByRole('option')[0]).label).toBe('Rectangle 1, 150 × 90');
  });

  it('draws a rectangle with the Rectangle tool, then goes back to choosing', () => {
    const ui = renderTest(createComponent(ShapeEditor, {}), SIZE);
    ui.fireEvent.click(ui.getByLabel('Rectangle'));
    ui.frame();
    const canvas = ui.getVisibleBox(ui.getByRole('listbox'));
    const x = canvas.x + 300;
    const y = canvas.y + 190;
    ui.fireEvent.pointerDown(x, y);
    ui.fireEvent.pointerMove(x + 30, y + 20, { buttons: 1 });
    ui.fireEvent.pointerMove(x + 60, y + 40, { buttons: 1 });
    ui.fireEvent.pointerUp(x + 60, y + 40);
    ui.frame();
    const labels = ui.getAllByRole('option').map(node => ui.getSemantics(node).label);
    expect(labels).toHaveLength(4);
    expect(labels[3]).toBe('Rectangle 4, 60 × 40');
    expect(ui.getSemantics(ui.getByLabel('Choose and move')).states).toContain('pressed');
  });
});
