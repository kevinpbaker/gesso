import { describe, expect, it } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Form } from './FormExample';

/**
 * The page's claim is that the library's controls arrive operable and
 * announced, and that the form above them refuses to send an answer
 * that is wrong. So the spec reaches them the way an assistive
 * technology does, by role and name, rather than by walking the tree.
 */
describe('the docs form example', () => {
  it('announces every control by role and name', () => {
    const ui = renderTest(createComponent(Form, {}), { width: 460, height: 380 });

    expect(ui.getByRole('textbox')).toHaveSemantics({ role: 'textbox', name: 'Email' });
    expect(ui.getByRole('checkbox')).toHaveSemantics({ role: 'checkbox', name: 'I accept the terms' });
    expect(ui.getByRole('combobox')).toHaveSemantics({ role: 'combobox', name: 'Plan' });
  });

  it('blocks the submit, says what is wrong, and takes the caret to it', () => {
    const ui = renderTest(createComponent(Form, {}), { width: 460, height: 380 });

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    expect(ui.queryByText(/^Sent:/)).toBeNull();
    expect(ui.getByText('We need an address')).toBeDefined();
    expect(ui.getByText('Accept the terms to continue')).toBeDefined();
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByRole('textbox'));
    // Drawn and announced, which is the part a form gets wrong.
    expect(ui.getSemantics(ui.getByText('We need an address')).live).toBe('polite');
  });

  it('sends once the rules pass', () => {
    const ui = renderTest(createComponent(Form, {}), { width: 460, height: 380 });

    ui.fireEvent.focus(ui.getByRole('textbox'));
    ui.fireEvent.type('ada@example.com');
    // Space on the focused checkbox is the platform's gesture, and the
    // library's.
    ui.fireEvent.focus(ui.getByRole('checkbox'));
    ui.fireEvent.press(' ');
    ui.frame();

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    expect(ui.getByText('Sent: ada@example.com on team')).toBeDefined();
  });
});
