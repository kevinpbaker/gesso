import { describe, expect, it } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Form } from './FormExample';

/**
 * The page's claim is that the library's controls arrive operable and
 * announced, so the spec reaches them the way an assistive technology
 * does, by role and name, rather than by walking the tree.
 */
describe('the docs form example', () => {
  it('announces every control by role and name', () => {
    const ui = renderTest(createComponent(Form, {}), { width: 460, height: 340 });

    expect(ui.getByRole('textbox')).toHaveSemantics({ role: 'textbox', name: 'Email' });
    expect(ui.getByRole('checkbox')).toHaveSemantics({ role: 'checkbox', name: 'Send me product updates' });
    expect(ui.getByRole('combobox')).toHaveSemantics({ role: 'combobox', name: 'Plan' });
  });

  it('is operable from the keyboard, and reports what it holds', () => {
    const ui = renderTest(createComponent(Form, {}), { width: 460, height: 340 });

    expect(ui.getByText('Enter an address to continue')).toBeDefined();

    ui.fireEvent.focus(ui.getByRole('textbox'));
    ui.fireEvent.type('ada@example.com');
    ui.frame();

    expect(ui.getByText('ada@example.com on team, with updates')).toBeDefined();

    // Space on the focused checkbox is the platform's gesture, and the
    // library's, so the summary loses its last clause.
    ui.fireEvent.focus(ui.getByRole('checkbox'));
    ui.fireEvent.press(' ');
    ui.frame();

    expect(ui.getByText('ada@example.com on team')).toBeDefined();
  });
});
