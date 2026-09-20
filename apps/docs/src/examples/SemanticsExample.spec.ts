import { describe, expect, it } from 'vitest';

import { Box, type UiSemanticsPatch } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Preferences } from './SemanticsExample';

/** The name each patch leaves behind; a removal has none. */
function names(patches: readonly UiSemanticsPatch[]): (string | undefined)[] {
  return patches.map(patch => (patch.op === 'remove' ? undefined : patch.node.label));
}

/**
 * Mounts the panel with a listener on the seam a mirror attaches to,
 * so the spec sees what a frame emitted rather than only what the tree
 * holds afterwards.
 */
function mount() {
  const updates: UiSemanticsPatch[][] = [];
  const ui = renderTest(createComponent(Preferences, {}), {
    width: 460,
    height: 320,
    onCreate: runtime => runtime.onSemantics(update => updates.push([...update.patches]))
  });
  return { ui, updates };
}

describe('the docs semantics example', () => {
  // #region records
  it('emits one record for each thing that means something, and none for the rest', () => {
    const { updates } = mount();

    expect(updates).toHaveLength(1);
    const added = updates[0].map(patch => (patch.op === 'add' ? patch.node : null));
    expect(added.map(record => record?.role)).toEqual([
      'form',
      undefined,
      'switch',
      'button',
      'slider',
      'button',
      'button'
    ]);
    expect(names(updates[0])).toEqual([
      'Notification settings',
      'A digest of 3 stories, once a day',
      'Email digest',
      'Fewer stories',
      'Stories per digest',
      'More stories',
      'Save'
    ]);
    // The form is a record, so the controls hang off it rather than
    // off the root, and the two rows that only lay out are absent.
    expect(added.slice(1).every(record => record?.parent === added[0]?.id)).toBe(true);
  });
  // #endregion records

  it('names a control by its label, and a button by the text it draws', () => {
    const { ui } = mount();

    expect(ui.getByRole('button', { name: 'Fewer stories' })).toBeDefined();
    expect(ui.getByRole('button', { name: 'Save' })).toBeDefined();
    // "Fewer" is drawn, and is the button's name only when there is no
    // label; here the label wins and the text has no record of its own.
    expect(ui.querySemantics(ui.getByText('Fewer'))).toBeNull();
    expect(ui.querySemantics(ui.getByText('Save'))).toBeNull();
  });

  it('carries the switch state, its description, and the slider value', () => {
    const { ui } = mount();

    expect(ui.getByRole('switch')).toHaveSemantics({ role: 'switch', name: 'Email digest', states: ['checked'] });
    expect(ui.getSemantics(ui.getByRole('switch')).description).toBe('One message a day, instead of one a minute');
    expect(ui.getSemantics(ui.getByRole('slider'))).toMatchObject({
      valueNow: 3,
      valueMin: 1,
      valueMax: 9,
      valueText: '3 stories'
    });
  });

  it('renames the record when the text it is named by changes', () => {
    const { ui, updates } = mount();

    ui.fireEvent.click(ui.getByRole('button', { name: 'More stories' }));
    ui.frame();

    expect(names(updates[1])).toContain('A digest of 4 stories, once a day');
    expect(ui.getSemantics(ui.getByRole('slider')).valueText).toBe('4 stories');
  });

  it('has no record for a hidden node, and removes the record when one is hidden', () => {
    const { ui, updates } = mount();
    expect(ui.queryByLabel('Preferences saved')).toBeNull();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Save' }));
    ui.frame();
    expect(names(updates.at(-1)!)).toContain('Preferences saved');
    expect(ui.getSemantics(ui.getByLabel('Preferences saved')).role).toBe('status');

    // Changing a setting withdraws the message, and `visible={false}`
    // takes the record with it rather than leaving a silent element.
    ui.fireEvent.click(ui.getByRole('switch'));
    ui.frame();
    expect(updates.at(-1)!.some(patch => patch.op === 'remove')).toBe(true);
    expect(ui.queryByLabel('Preferences saved')).toBeNull();
  });

  it('says nothing to a listener on a frame that only repainted', () => {
    const { ui, updates } = mount();
    const box = ui.getLayout(ui.getByRole('switch'));
    const emitted = updates.length;
    const framesSoFar = ui.frames.length;

    // Hovering the switch recolours it through a modifier. Pixels
    // change; nothing about the panel means anything new, so there is
    // no update to send.
    ui.fireEvent.pointerMove(box.x + box.width / 2, box.y + box.height / 2);
    ui.frame();

    expect(ui.frames.length).toBe(framesSoFar + 1);
    expect(updates).toHaveLength(emitted);
  });

  it('costs nothing at all while nothing is reading the tree', () => {
    const ui = renderTest(createComponent(Preferences, {}), { width: 460, height: 320 });
    const box = ui.getLayout(ui.getByRole('switch'));
    const framesSoFar = ui.frames.length;

    ui.fireEvent.pointerMove(box.x + box.width / 2, box.y + box.height / 2);
    ui.frame();

    expect(ui.frames.length).toBe(framesSoFar + 1);
    expect(ui.frames.at(-1)?.phases.semantics).toBe(0);
  });

  it('rejects an unknown role when the tree is built, naming the nearest one', () => {
    expect(() => renderTest(Box({ role: 'buton' as 'button' }))).toThrow(/Did you mean 'button'/);
    expect(() => renderTest(Box({ role: 'checkbox', states: ['checkd' as 'checked'] }))).toThrow(
      /Did you mean 'checked'/
    );
  });
});
