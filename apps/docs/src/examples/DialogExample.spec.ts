import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Button } from '@gesso/core';
import { Dialog } from '@gesso/components';
import { OverlayService, createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Notes } from './DialogExample';

const SIZE = { width: 460, height: 340 };

const mount = () => renderTest(createComponent(Notes, {}), SIZE);

/** The overlay entries that are open, which is what a dialog is. */
const entries = (ui: Rendered) => ui.runtime.services.get(OverlayService).entries.value;

/** Opens a dialog the way a reader does: focus the button, then click it. */
function openWith(ui: Rendered, name: string) {
  const opener = ui.getByLabel(name);
  ui.fireEvent.focus(opener);
  ui.fireEvent.click(opener);
  ui.frame();
  return opener;
}

/**
 * The page claims a dialog draws nothing where it is written, traps
 * the keyboard and hands it back to its opener, closes on Escape when
 * it is dismissible and ignores Escape when it is not, opens centred,
 * and announces itself as a modal dialog with a name and a
 * description. Each is a test.
 */
describe('the docs dialog example', () => {
  it('renders nothing where it is declared until it is opened', () => {
    const ui = mount();

    expect(ui.queryByRole('dialog')).toBeNull();
    expect(entries(ui)).toHaveLength(0);

    openWith(ui, 'Delete note');

    expect(entries(ui)).toHaveLength(1);
    expect(ui.getByRole('dialog')).toBeDefined();
    // The content the caller wrote is in the overlay layer, not in the
    // column the component was declared in.
    expect(ui.getByLabel('Cancel')).toBeDefined();
  });

  it('says what it is, what it is called, and that it is modal', () => {
    const ui = mount();
    openWith(ui, 'Delete note');

    expect(ui.getByRole('dialog')).toHaveSemantics({ role: 'dialog', name: 'Delete this note?' });
    const record = ui.getSemantics(ui.getByRole('dialog'));
    expect(record.description).toBe(
      'Tab stays inside. Escape closes it, and the button that opened it takes the keyboard back.'
    );
    expect(record.states).toEqual(['modal']);
  });

  it('opens centred in the canvas, pinned to no edge', () => {
    const ui = mount();
    openWith(ui, 'Delete note');

    const entry = entries(ui)[0];
    expect(entry.center).toBe('both');
    expect(entry.top).toBeUndefined();
    expect(entry.left).toBeUndefined();
    expect(entry.anchor ?? null).toBeNull();
  });

  it('traps the keyboard inside, and hands it back to the opener', () => {
    const ui = mount();
    const opener = openWith(ui, 'Delete note');

    expect(ui.runtime.input.focus.trapped).toBe(true);

    // Tab walks the two buttons inside the dialog and wraps, so it
    // never reaches the openers underneath.
    const visited: unknown[] = [ui.runtime.input.focus.focusedNode?.properties.get('label')];
    ui.fireEvent.keyDown('Tab');
    visited.push(ui.runtime.input.focus.focusedNode?.properties.get('label'));
    ui.fireEvent.keyDown('Tab');
    visited.push(ui.runtime.input.focus.focusedNode?.properties.get('label'));
    expect(visited).toEqual(['Cancel', 'Delete', 'Cancel']);

    // Shift+Tab walks the same ring backwards.
    ui.fireEvent.keyDown('Tab', { shift: true });
    expect(ui.runtime.input.focus.focusedNode?.properties.get('label')).toBe('Delete');

    ui.fireEvent.click(ui.getByLabel('Cancel'));
    ui.frame();

    expect(entries(ui)).toHaveLength(0);
    expect(ui.runtime.input.focus.trapped).toBe(false);
    expect(ui.runtime.input.focus.focusedNode).toBe(opener);
    expect(ui.getByText('Kept the note.')).toBeDefined();
  });

  it('closes on Escape when it is dismissible', () => {
    const ui = mount();
    const opener = openWith(ui, 'Delete note');

    ui.fireEvent.keyDown('Escape');
    ui.frame();

    expect(entries(ui)).toHaveLength(0);
    expect(ui.queryByRole('dialog')).toBeNull();
    expect(ui.runtime.input.focus.focusedNode).toBe(opener);
  });

  it('ignores Escape, and takes no backdrop, when dismissible is false', () => {
    const ui = mount();
    openWith(ui, 'Upload');

    expect(entries(ui)[0].dismissOnOutsidePress).toBe(false);

    ui.fireEvent.keyDown('Escape');
    ui.frame();

    expect(entries(ui)).toHaveLength(1);
    expect(ui.runtime.input.focus.trapped).toBe(true);

    // The button inside is the only way out.
    ui.fireEvent.click(ui.getByLabel('Stop the upload'));
    ui.frame();
    expect(entries(ui)).toHaveLength(0);
    expect(ui.getByText('Upload stopped.')).toBeDefined();
  });

  it('asks for a backdrop when it is dismissible', () => {
    const ui = mount();
    openWith(ui, 'Delete note');

    expect(entries(ui)[0].dismissOnOutsidePress).toBe(true);
  });

  it('reports a close exactly once, whatever closed it', () => {
    const open = new BehaviorSubject(false);
    let calls = 0;
    const ui = renderTest(
      createComponent(Dialog, {
        open,
        title: 'Delete',
        content: Button({ text: 'Cancel', label: 'Cancel' }),
        onClose: () => {
          calls += 1;
          open.next(false);
        }
      }),
      SIZE
    );

    open.next(true);
    ui.frame();
    ui.fireEvent.keyDown('Escape');
    ui.frame();

    // One close, one call: the overlay entry reports it, and the
    // component does not report it a second time.
    expect(calls).toBe(1);
    expect(open.value).toBe(false);

    // The same on a programmatic close, where nothing in the dialog
    // ran a handler at all.
    open.next(true);
    ui.frame();
    open.next(false);
    ui.frame();

    expect(calls).toBe(2);
    expect(entries(ui)).toHaveLength(0);
  });

  it('carries the declaring tree environment across to the overlay layer', () => {
    const ui = mount();
    openWith(ui, 'Delete note');

    // The placeholder the component left behind, so the content in the
    // layer inherits this tree's theme rather than the default one.
    expect(entries(ui)[0].environment ?? null).not.toBeNull();
  });
});
