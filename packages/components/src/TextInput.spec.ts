import { describe, expect, it, vi } from 'vitest';

import { createComponent } from 'gesso-framework';
import { Column, type UiKeyboardEvent } from 'gesso-core';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { TextArea, TextInput } from './TextInput';

describe('TextArea, submitting', () => {
  it('submits on Command- or Control-Enter, and Enter alone is a new line', () => {
    const submits = vi.fn();
    const changes: string[] = [];
    const ui = renderTest(
      createComponent(TextArea, {
        label: 'Notes',
        defaultValue: '',
        onSubmit: submits,
        onChange: v => changes.push(v)
      }),
      { width: 400, height: 300 }
    );
    ui.fireEvent.focus(ui.getByRole('textbox'));
    ui.fireEvent.type('Hi');

    // `onSubmit` is on TextArea's props and was never called from one:
    // Enter is the text's in a multiline field, and nothing else asked.
    ui.fireEvent.keyDown('Enter', { meta: true });
    ui.fireEvent.keyDown('Enter', { ctrl: true });
    ui.frame();
    expect(submits).toHaveBeenCalledTimes(2);
    expect(changes.at(-1)).toBe('Hi');

    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(submits).toHaveBeenCalledTimes(2);
    expect(changes.at(-1)).toBe('Hi\n');
  });

  it('does the same for a TextInput that is multiline', () => {
    const submits = vi.fn();
    const ui = renderTest(createComponent(TextInput, { label: 'Notes', multiline: true, onSubmit: submits }), {
      width: 400,
      height: 300
    });
    ui.fireEvent.focus(ui.getByRole('textbox'));

    ui.fireEvent.keyDown('Enter');
    ui.fireEvent.keyDown('Enter', { ctrl: true });
    expect(submits).toHaveBeenCalledTimes(1);
  });

  it('leaves Command- and Control-Enter to what holds it when it has no onSubmit', () => {
    // A form that submits from its own key handler, as a commit message's box does.
    const heard: string[] = [];
    const changes: string[] = [];
    const ui = renderTest(
      Column(
        {
          onKeyDown: (event: UiKeyboardEvent) => {
            if (event.key !== 'Enter' || !(event.modifiers.meta || event.modifiers.ctrl)) return;
            heard.push(event.modifiers.meta ? 'Meta+Enter' : 'Ctrl+Enter');
            event.preventDefault();
          }
        },
        createComponent(TextArea, { label: 'Message', defaultValue: '', onChange: v => changes.push(v) })
      ),
      { width: 400, height: 300 }
    );
    ui.fireEvent.focus(ui.getByRole('textbox'));
    ui.fireEvent.type('Hi');

    ui.fireEvent.keyDown('Enter', { meta: true });
    ui.fireEvent.keyDown('Enter', { ctrl: true });
    ui.frame();
    expect(heard).toContain('Meta+Enter');
    expect(heard).toContain('Ctrl+Enter');
    expect(changes.at(-1)).toBe('Hi');
  });

  it('submits a single-line field on Enter with or without the modifier', () => {
    const submits = vi.fn();
    const ui = renderTest(createComponent(TextInput, { label: 'Email', onSubmit: submits }), {
      width: 400,
      height: 200
    });
    ui.fireEvent.focus(ui.getByRole('textbox'));

    ui.fireEvent.keyDown('Enter');
    ui.fireEvent.keyDown('Enter', { meta: true });
    expect(submits).toHaveBeenCalledTimes(2);
  });
});
