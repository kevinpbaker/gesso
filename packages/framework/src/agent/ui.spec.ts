import { BehaviorSubject, map } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Box, Button, Column, EditableText, Text, type UiTextChangeEvent } from 'gesso-core';
import { mountRuntime } from '../app/RuntimeTestUtils';
import { uiSurface, type UiHost } from './ui';

/**
 * A small form on a real runtime: a field, a checkbox that toggles, a
 * button that counts, and a disabled one. The host is what the render
 * worker builds, with the test's manual clock for `flush`.
 */
function form() {
  const presses = new BehaviorSubject(0);
  const wrap = new BehaviorSubject(false);
  const name = new BehaviorSubject('Ada');
  const mounted = mountRuntime(
    Column(
      Text({ text: 'Settings' }),
      // Controlled, as every real field is: the edit comes back as a
      // value the application writes.
      EditableText({ value: name, label: 'Name', onInput: (event: UiTextChangeEvent) => name.next(event.value) }),
      Box({
        role: 'checkbox',
        label: 'Wrap lines',
        states: wrap.pipe(map(on => (on ? ['checked' as const] : []))),
        width: 20,
        height: 20,
        onClick: () => wrap.next(!wrap.value)
      }),
      Button({ text: presses.pipe(map(count => `Pressed ${count}`)), onClick: () => presses.next(presses.value + 1) }),
      Button({ text: 'Delete', disabled: true, onClick: () => presses.next(-1) }),
      Button({ text: 'Delete all', onClick: () => {} })
    ),
    {}
  );
  mounted.frame(0);
  const host: UiHost = {
    semanticsTree: () => mounted.runtime.semanticsTree(),
    focusedNodeId: () => mounted.runtime.focusedNodeId(),
    applySemanticsAction: action => mounted.runtime.applySemanticsAction(action),
    key: (key, modifiers) => {
      mounted.runtime.input.keyboard.keyDown(key, modifiers);
      mounted.runtime.input.keyboard.keyUp(key, modifiers);
    },
    flush: () => mounted.frame()
  };
  const surface = uiSurface(() => host, { quietMs: 1, settleMs: 100 });
  const text = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await surface.call(name, args);
    return { error: result.isError, text: result.content[0].text };
  };
  return { surface, text, presses, wrap, name };
}

describe('the screen as tools', () => {
  it('reads the screen as an outline a model can act on', async () => {
    const { text } = form();
    const { text: outline } = await text('ui_snapshot');

    expect(outline).toMatch(/^- text "Settings" \[[^\]]+\]$/m);
    expect(outline).toMatch(/^- textbox "Name" value="Ada" \[[^\]]+\]$/m);
    expect(outline).toMatch(/^- checkbox "Wrap lines" \[[^\]]+\]$/m);
    expect(outline).toMatch(/^- button "Pressed 0" \[[^\]]+\]$/m);
    expect(outline).toMatch(/^- button "Delete" \(disabled\) \[[^\]]+\]$/m);
  });

  it('presses a control by role and name, as a click would, and shows what changed', async () => {
    const { text, presses, wrap } = form();

    const after = await text('ui_press', { role: 'checkbox', name: 'wrap lines' });
    expect(after.error).toBe(false);
    expect(wrap.value).toBe(true);
    expect(after.text).toMatch(/- checkbox "Wrap lines" \[checked\]/);

    expect((await text('ui_press', { name: 'Pressed 0' })).text).toContain('button "Pressed 1"');
    expect(presses.value).toBe(1);
  });

  it('presses by ref, a short one that names the same control from one snapshot to the next', async () => {
    const { text, presses } = form();
    const ref = /button "Pressed 0" \[([^\]]+)\]/.exec((await text('ui_snapshot')).text)![1];
    expect(ref).toMatch(/^e\d+$/);

    const after = (await text('ui_press', { ref })).text;
    expect(presses.value).toBe(1);
    expect(after).toContain(`button "Pressed 1" [${ref}]`);
  });

  it('fills a field, and shows it focused with its new text', async () => {
    const { text, name } = form();
    const after = await text('ui_type', { role: 'textbox', name: 'Name', text: 'Grace Hopper' });
    expect(after.error).toBe(false);
    expect(after.text).toMatch(/textbox "Name" value="Grace Hopper" \[[^\]]+\] \(focused\)/);
    expect(name.value).toBe('Grace Hopper');
  });

  it('will not press a disabled control', async () => {
    const { text, presses } = form();
    const result = await text('ui_press', { role: 'button', name: 'Delete' });
    expect(result).toEqual({ error: true, text: 'button "Delete" is disabled.' });
    expect(presses.value).toBe(0);
  });

  it('prefers the exact name, and lists the candidates when a name is ambiguous', async () => {
    const { text } = form();
    // "Delete" names the disabled button exactly, not "Delete all".
    expect((await text('ui_press', { name: 'delete' })).text).toBe('button "Delete" is disabled.');
    const ambiguous = await text('ui_press', { name: 'del' });
    expect(ambiguous.error).toBe(true);
    expect(ambiguous.text).toMatch(
      /^2 controls are "del": button "Delete" \[.+\]; button "Delete all" \[.+\]\. Use a ref\.$/
    );
  });

  it('says what is there when nothing matches, and when a ref has gone', async () => {
    const { text } = form();
    const missing = await text('ui_press', { role: 'button', name: 'Publish' });
    expect(missing.text).toMatch(/^Nothing on the screen is button "Publish"\. Some that are: button "Pressed 0"/);
    expect((await text('ui_press', { ref: 'gone' })).text).toMatch(/^Nothing on the screen has the ref gone now/);
    expect((await text('ui_press', {})).text).toBe('Say which control: a ref from ui_snapshot, or a role and a name.');
  });

  it('presses a key where focus is', async () => {
    const { text } = form();
    await text('ui_focus', { role: 'textbox' });
    const after = await text('ui_key', { key: 'Tab' });
    expect(after.error).toBe(false);
    // Tab moved focus off the field, onto the next control.
    expect(after.text).not.toMatch(/textbox "Name".*\(focused\)/);
    expect(after.text).toMatch(/\(focused\)/);
  });

  it('says so when the application has not started', async () => {
    const result = await uiSurface(() => undefined).call('ui_snapshot', {});
    expect(result).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'The application has not started yet.' }]
    });
  });
});
