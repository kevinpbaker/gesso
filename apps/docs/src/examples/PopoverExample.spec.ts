import { describe, expect, it } from 'vitest';

import { OverlayService, createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Filters } from './PopoverExample';

const SIZE = { width: 460, height: 340 };

const mount = () => renderTest(createComponent(Filters, {}), SIZE);

const entries = (ui: Rendered) => ui.runtime.services.get(OverlayService).entries.value;

/** A press and release at the middle of a node, through hit testing, as a pointer makes one. */
function pressOn(ui: Rendered, name: string): void {
  const box = ui.getLayout(ui.getByLabel(name));
  ui.fireEvent.pointerDown(box.x + box.width / 2, box.y + box.height / 2);
  ui.fireEvent.pointerUp(box.x + box.width / 2, box.y + box.height / 2);
  ui.frame();
}

/**
 * The page claims a popover draws nothing until its trigger is
 * pressed, opens beside it with the caret where `initialFocus` says,
 * that the trigger announces it as expanded and controlling the panel,
 * that the application closes it from Apply with the keyboard back on
 * the trigger, that Escape and a press outside close it without a
 * backdrop, that Tab leaves it, and that the note on the end side
 * manages itself. Each is a test.
 */
describe('the docs popover example', () => {
  it('draws nothing until its trigger is pressed', () => {
    const ui = mount();
    expect(ui.queryByRole('dialog')).toBeNull();
    expect(entries(ui)).toHaveLength(0);
    expect(ui.getSemantics(ui.getByLabel('Filters')).states).toEqual(['collapsed']);

    pressOn(ui, 'Filters');

    expect(ui.getByRole('dialog', { name: 'Filter issues' })).toBeDefined();
    expect(ui.getByRole('textbox', { name: 'Title contains' })).toHaveFocus();
  });

  it('says on the trigger that it is expanded, and which panel it controls', () => {
    const ui = mount();
    pressOn(ui, 'Filters');

    const trigger = ui.getSemantics(ui.getByLabel('Filters'));
    const panel = ui.getSemantics(ui.getByRole('dialog', { name: 'Filter issues' }));
    expect(trigger.states).toEqual(['expanded']);
    expect(trigger.controls).toBe(panel.id);
  });

  it('is closed by the application from Apply, and hands the keyboard back', () => {
    const ui = mount();
    pressOn(ui, 'Filters');
    ui.fireEvent.type('crash');
    ui.frame();

    pressOn(ui, 'Apply');

    expect(entries(ui)).toHaveLength(0);
    expect(ui.getByText('Showing open issues with "crash" in the title.')).toBeDefined();
    expect(ui.getByLabel('Filters')).toHaveFocus();
    expect(ui.getSemantics(ui.getByLabel('Filters')).states).toEqual(['collapsed']);
  });

  it('closes on Escape, back to the trigger', () => {
    const ui = mount();
    pressOn(ui, 'Filters');

    ui.fireEvent.keyDown('Escape');
    ui.frame();

    expect(entries(ui)).toHaveLength(0);
    expect(ui.getByLabel('Filters')).toHaveFocus();
    expect(ui.getByText('Showing every issue.')).toBeDefined();
  });

  it('closes on a press outside, which still reaches what was pressed', () => {
    const ui = mount();
    pressOn(ui, 'Filters');

    // The other trigger is outside the panel. With no backdrop the
    // press is its own, so it opens the note as the filters close.
    pressOn(ui, 'About filters');

    expect(ui.queryByRole('dialog', { name: 'Filter issues' })).toBeNull();
    expect(ui.getByRole('dialog', { name: 'What filters do' })).toBeDefined();
  });

  it('walks its fields with Tab and leaves after the last, closing', () => {
    const ui = mount();
    pressOn(ui, 'Filters');

    ui.fireEvent.keyDown('Tab');
    expect(ui.getByRole('checkbox', { name: 'Open issues only' })).toHaveFocus();
    ui.fireEvent.keyDown('Tab');
    expect(ui.getByLabel('Apply')).toHaveFocus();
    ui.fireEvent.keyDown('Tab');
    ui.frame();

    expect(entries(ui)).toHaveLength(0);
    expect(ui.getByLabel('About filters')).toHaveFocus();
  });

  it('opens the note on the end side of its trigger, and closes it on a second press', () => {
    const ui = mount();
    pressOn(ui, 'About filters');

    const trigger = ui.getLayout(ui.getByLabel('About filters'));
    const note = ui.getLayout(ui.getByRole('dialog', { name: 'What filters do' }));
    expect(note.x).toBe(trigger.x + trigger.width + 6);

    pressOn(ui, 'About filters');
    expect(entries(ui)).toHaveLength(0);
  });
});
