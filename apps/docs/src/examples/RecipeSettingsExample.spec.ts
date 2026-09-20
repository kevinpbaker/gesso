import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { SettingsScreen } from './RecipeSettingsExample';

const SIZE = { width: 480, height: 620 };

const screen = () => renderTest(createComponent(SettingsScreen, {}), SIZE);

/** The group a control belongs to, as the semantics tree records it. */
const groupOf = (ui: Rendered, name: string, role: 'switch' | 'combobox' | 'slider' | 'textbox') =>
  ui.getSemantics(ui.getByRole(role, { name })).parent;

/**
 * The page claims three things: the groups exist for something that
 * cannot see the borders, one control disables another, and every
 * change goes through one cell so Reset is one write. Each is a test,
 * and every control is reached the way an assistive technology would
 * reach it.
 */
describe('the docs settings recipe', () => {
  it('puts every control in a named group', () => {
    const ui = screen();

    expect(ui.getAllByRole('group')).toHaveLength(3);
    expect(ui.getByRole('group', { name: 'Account' })).toBeDefined();
    expect(ui.getByRole('group', { name: 'Notifications' })).toBeDefined();
    expect(ui.getByRole('group', { name: 'Editor' })).toBeDefined();

    // The panel is the parent in the semantics tree, not just on
    // screen, which is what makes the grouping audible.
    const notifications = ui.getSemantics(ui.getByRole('group', { name: 'Notifications' })).id;
    expect(groupOf(ui, 'Email digest', 'switch')).toBe(notifications);
    expect(groupOf(ui, 'Digest frequency', 'combobox')).toBe(notifications);

    const editor = ui.getSemantics(ui.getByRole('group', { name: 'Editor' })).id;
    expect(groupOf(ui, 'Font size', 'slider')).toBe(editor);
    expect(groupOf(ui, 'Wrap long lines', 'switch')).toBe(editor);
  });

  it('names each control, and says which are on', () => {
    const ui = screen();

    expect(ui.getByRole('switch', { name: 'Email digest' })).toHaveSemantics({
      role: 'switch',
      name: 'Email digest',
      states: ['checked']
    });
    expect(ui.getByRole('textbox', { name: 'Display name' })).toHaveSemantics({
      role: 'textbox',
      name: 'Display name'
    });
    expect(ui.getSemantics(ui.getByRole('slider', { name: 'Font size' })).valueText).toBe('14 px');
  });

  it('disables the frequency with the digest, and enables it again', () => {
    const ui = screen();
    const digest = ui.getByRole('switch', { name: 'Email digest' });
    const frequency = ui.getByRole('combobox', { name: 'Digest frequency' });

    expect(ui.getSemantics(frequency).disabled).toBeUndefined();

    ui.fireEvent.click(digest);
    ui.frame();

    // One rule, spanning two settings, expressed as one bound value
    // because both fields live in the same record.
    expect(ui.getSemantics(frequency).disabled).toBe(true);
    expect(ui.getByText(/no digest/)).toBeDefined();

    ui.fireEvent.click(digest);
    ui.frame();

    expect(ui.getSemantics(frequency).disabled).toBeUndefined();
    expect(ui.getByText(/weekly digest/)).toBeDefined();
  });

  it('will not open a frequency the digest has disabled', () => {
    const ui = screen();

    ui.fireEvent.click(ui.getByRole('switch', { name: 'Email digest' }));
    ui.frame();

    const frequency = ui.getByRole('combobox', { name: 'Digest frequency' });
    ui.fireEvent.focus(frequency);
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    // Disabled is not decoration: the control declines the keyboard
    // too, so there is no list to choose from.
    expect(ui.queryByRole('listbox')).toBeNull();
  });

  it('sends every control through the one cell', () => {
    const ui = screen();

    const name = ui.getByRole('textbox', { name: 'Display name' });
    ui.fireEvent.focus(name);
    ui.fireEvent.press('End');
    ui.fireEvent.type('my');
    ui.frame();
    expect(ui.getSemantics(name).valueText).toBe('Sammy');

    const size = ui.getByRole('slider', { name: 'Font size' });
    ui.fireEvent.focus(size);
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(ui.getSemantics(size).valueText).toBe('16 px');

    ui.fireEvent.click(ui.getByRole('switch', { name: 'Wrap long lines' }));
    ui.frame();

    // One line reads all five fields, because there is one record to
    // read them from.
    expect(ui.getByText('Sammy, 16 px, weekly digest, not wrapping')).toBeDefined();
  });

  it('resets every field with one write', () => {
    const ui = screen();

    ui.fireEvent.click(ui.getByRole('switch', { name: 'Email digest' }));
    ui.fireEvent.click(ui.getByRole('switch', { name: 'Wrap long lines' }));
    const size = ui.getByRole('slider', { name: 'Font size' });
    ui.fireEvent.focus(size);
    ui.fireEvent.keyDown('End');
    ui.frame();
    expect(ui.getByText('Sam, 20 px, no digest, not wrapping')).toBeDefined();

    // Reset is hand-written, so it binds its own keys; the library's
    // controls above it bind theirs.
    const reset = ui.getByRole('button', { name: 'Reset to defaults' });
    ui.fireEvent.focus(reset);
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    expect(ui.getByText('Sam, 14 px, weekly digest, wrapping')).toBeDefined();
    expect(ui.getSemantics(ui.getByRole('switch', { name: 'Email digest' })).states).toEqual(['checked']);
    expect(ui.getSemantics(ui.getByRole('combobox', { name: 'Digest frequency' })).disabled).toBeUndefined();
  });

  it('keeps the note under the name field, even in a host too short for the screen', () => {
    // The page gives the example room; a shorter host shrinks the
    // columns, and the field's minimum height has to be counted when
    // they do, or the note is drawn across the field.
    for (const height of [SIZE.height, 480]) {
      const ui = renderTest(createComponent(SettingsScreen, {}), { width: SIZE.width, height });
      ui.frame();
      const field = ui.getLayout(ui.getByRole('textbox', { name: 'Display name' }));
      const note = ui.getLayout(ui.getByText('Shown beside anything you publish.'));
      expect(field.height).toBeGreaterThanOrEqual(32);
      expect(note.y).toBeGreaterThanOrEqual(field.y + field.height);
    }
  });

  it('fits the whole screen in the room the page gives it', () => {
    const ui = screen();
    ui.frame();
    const reset = ui.getLayout(ui.getByRole('button', { name: 'Reset to defaults' }));
    expect(reset.y + reset.height).toBeLessThanOrEqual(SIZE.height);
  });
});
