import { describe, expect, it, vi } from 'vitest';

import { createComponent } from 'gesso-framework';
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
