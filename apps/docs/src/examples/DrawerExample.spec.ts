import { describe, expect, it } from 'vitest';

import { OverlayService, createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Inbox } from './DrawerExample';

const SIZE = { width: 640, height: 360 };

const mount = () => renderTest(createComponent(Inbox, {}), SIZE);

let clock = 0;
/** Past any slide, so a drawer is at rest or gone. */
const rest = (ui: Rendered): void => {
  ui.frame();
  clock += 5000;
  ui.frame(clock);
};

const entries = (ui: Rendered) => ui.runtime.services.get(OverlayService).entries.value;
const focusedLabel = (ui: Rendered) => ui.runtime.input.focus.focusedNode?.properties.get('label');

/** Opens a drawer the way a reader does: focus the button, then click it. */
function openWith(ui: Rendered, name: string) {
  const opener = ui.getByLabel(name);
  ui.fireEvent.focus(opener);
  ui.fireEvent.click(opener);
  rest(ui);
  return opener;
}

/**
 * The page claims Filters comes in from the start edge, is a modal
 * dialog that keeps the keyboard and gives it back, and closes on
 * Escape and on a press on the dimmed page; and that Details comes in
 * from the end edge and leaves the page usable. Each is a test.
 */
describe('the docs drawer example', () => {
  it('draws nothing until a drawer is opened', () => {
    const ui = mount();
    expect(ui.queryByRole('dialog')).toBeNull();
    expect(entries(ui)).toHaveLength(0);
  });

  it('opens Filters on the start edge as a named, modal dialog', () => {
    const ui = mount();
    openWith(ui, 'Filters');
    const drawer = ui.getByRole('dialog', { name: 'Filters' });
    expect(drawer).toHaveSemantics({ role: 'dialog', name: 'Filters' });
    expect(ui.getSemantics(drawer).states).toContain('modal');
    expect(ui.getLayout(drawer)).toMatchObject({ x: 0, y: 0, width: 280, height: SIZE.height });
  });

  it('keeps Tab inside Filters, and gives the keyboard back on Escape', () => {
    const ui = mount();
    const opener = openWith(ui, 'Filters');
    expect(ui.runtime.input.focus.trapped).toBe(true);

    const visited = [focusedLabel(ui)];
    for (let i = 0; i < 4; i++) {
      ui.fireEvent.keyDown('Tab');
      visited.push(focusedLabel(ui));
    }
    expect(visited).toEqual(['Close', 'Unread only', 'With attachments', 'Apply', 'Close']);

    ui.fireEvent.keyDown('Escape');
    rest(ui);
    expect(entries(ui)).toHaveLength(0);
    expect(ui.runtime.input.focus.focusedNode).toBe(opener);
  });

  it('closes Filters on a press on the dimmed page', () => {
    const ui = mount();
    openWith(ui, 'Filters');
    ui.fireEvent.pointerDown(600, 300);
    ui.fireEvent.pointerUp(600, 300);
    rest(ui);
    expect(entries(ui)).toHaveLength(0);
  });

  it('applies from inside Filters, and says so', () => {
    const ui = mount();
    openWith(ui, 'Filters');
    ui.fireEvent.click(ui.getByLabel('Apply'));
    rest(ui);
    expect(entries(ui)).toHaveLength(0);
    expect(ui.getByText('Filters applied.')).toBeDefined();
  });

  it('opens Details on the end edge, not modal, with the page still usable', () => {
    const ui = mount();
    openWith(ui, 'Details');
    const drawer = ui.getByRole('dialog', { name: 'Details' });
    expect(ui.getSemantics(drawer).states ?? []).not.toContain('modal');
    expect(ui.getLayout(drawer)).toMatchObject({ x: SIZE.width - 260, width: 260 });
    expect(ui.runtime.input.focus.trapped).toBe(false);

    // Filters, beside it on the page, still opens.
    ui.fireEvent.click(ui.getByLabel('Filters'));
    rest(ui);
    expect(ui.getByRole('dialog', { name: 'Filters' })).toBeDefined();
  });
});
