import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { TextInput } from 'gesso-components';
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { TextFields } from './TextInputExample';

const SIZE = { width: 460, height: 420 };

/** The example, mounted at the size the page embeds it at. */
function fields() {
  return renderTest(createComponent(TextFields, {}), SIZE);
}

/**
 * What the page claims, in the order it claims it: the fields announce
 * themselves, a controlled field holds the application's value and not
 * the user's, an uncontrolled one holds its own, and the keys in the
 * keyboard table do what the table says.
 *
 * Everything is driven through the queries an assistive technology
 * would use, so a field that stopped being findable by role and name
 * fails here before a reader meets it.
 */
describe('the docs text input example', () => {
  it('announces three fields by role and name', () => {
    const ui = fields();

    expect(ui.getAllByRole('textbox')).toHaveLength(3);
    expect(ui.getByRole('textbox', { name: 'Email' })).toHaveSemantics({
      role: 'textbox',
      name: 'Email',
      states: ['required']
    });
    expect(ui.getByRole('textbox', { name: 'Nickname' })).toHaveSemantics({ role: 'textbox', name: 'Nickname' });
    expect(ui.getByRole('textbox', { name: 'Notes' })).toHaveSemantics({ role: 'textbox', name: 'Notes' });
  });

  it('shows what the application writes, not what was typed into it', () => {
    const ui = fields();
    const email = ui.getByRole('textbox', { name: 'Email' });

    ui.fireEvent.focus(email);
    ui.fireEvent.type('not-an-address');
    ui.frame();
    expect(ui.getSemantics(email).valueText).toBe('not-an-address');

    // Nothing is typed here: the button writes the cell the field is
    // bound to, and the field takes it.
    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();
    expect(ui.getSemantics(email).valueText).toBe('ada@example.com');
  });

  it('does not move a controlled value the application never writes back', () => {
    const address = new BehaviorSubject('ada@example.com');
    const ui = renderTest(createComponent(TextInput, { label: 'Email', value: address }), SIZE);
    const field = ui.getByRole('textbox');

    ui.fireEvent.focus(field);
    ui.fireEvent.press('End');
    ui.fireEvent.type('!');
    ui.frame();

    // The keystroke reached the field's own model, which is what keeps
    // the caret off the application's critical path. Nothing reported
    // it, because no `onChange` was given, so the value the
    // application holds and the value an assistive technology reads
    // are both still the one it was handed.
    expect(ui.getSemantics(field).valueText).toBe('ada@example.com');

    // And the next value the application does write lands in the field.
    address.next('grace@example.com');
    ui.frame();
    expect(ui.getSemantics(field).valueText).toBe('grace@example.com');
  });

  it('lets the uncontrolled field keep its own text', () => {
    const ui = fields();
    const nickname = ui.getByRole('textbox', { name: 'Nickname' });

    ui.fireEvent.focus(nickname);
    ui.fireEvent.press('End');
    ui.fireEvent.type('lovelace');
    ui.frame();

    expect(ui.getSemantics(nickname).valueText).toBe('adalovelace');
    // No cell in the example holds it, so the summary line is unmoved
    // and the controlled field beside it is untouched.
    expect(ui.getByText('0 characters, not sent')).toBeDefined();
    expect(ui.getSemantics(ui.getByRole('textbox', { name: 'Email' })).valueText).toBe('');
  });

  it('submits on Enter in the single-line field and starts a line in the TextArea', () => {
    const ui = fields();

    ui.fireEvent.focus(ui.getByRole('textbox', { name: 'Email' }));
    ui.fireEvent.type('ada@example.com');
    ui.fireEvent.press('Enter');
    ui.frame();
    expect(ui.getByText('Sent 0 characters to ada@example.com')).toBeDefined();

    const notes = ui.getByRole('textbox', { name: 'Notes' });
    ui.fireEvent.focus(notes);
    ui.fireEvent.type('one');
    ui.fireEvent.press('Enter');
    ui.fireEvent.type('two');
    ui.frame();

    // Enter is the text's in a multiline field, so this is one value
    // with a newline in it rather than two submissions.
    expect(ui.getSemantics(notes).valueText).toBe('one\ntwo');
    // Seven characters, the newline among them, and the submission
    // still standing: only the email field's own changes clear it.
    expect(ui.getByText('Sent 7 characters to ada@example.com')).toBeDefined();
  });

  it('moves the caret and deletes by the keys the table lists', () => {
    const ui = fields();
    const notes = ui.getByRole('textbox', { name: 'Notes' });

    ui.fireEvent.focus(notes);
    ui.fireEvent.type('one two');
    ui.fireEvent.press('Backspace');
    ui.frame();
    expect(ui.getSemantics(notes).valueText).toBe('one tw');

    // Home is the start of the visual line, so what is typed there
    // lands in front of everything.
    ui.fireEvent.press('Home');
    ui.fireEvent.type('a ');
    ui.frame();
    expect(ui.getSemantics(notes).valueText).toBe('a one tw');

    // End, then a word delete: the word modifier is Control off a Mac
    // and Option on one, and the test runs on the former.
    ui.fireEvent.press('End');
    ui.fireEvent.press('Backspace', { ctrl: true });
    ui.frame();
    expect(ui.getSemantics(notes).valueText).toBe('a one ');

    // Select all, then type over it.
    ui.fireEvent.press('a', { ctrl: true });
    ui.fireEvent.type('done');
    ui.frame();
    expect(ui.getSemantics(notes).valueText).toBe('done');

    // Undo takes the run of typing back as one entry.
    ui.fireEvent.press('z', { ctrl: true });
    ui.frame();
    expect(ui.getSemantics(notes).valueText).toBe('a one ');
  });

  it('marks the field invalid and puts the message under it', () => {
    const ui = fields();
    const email = ui.getByRole('textbox', { name: 'Email' });

    ui.fireEvent.focus(email);
    ui.fireEvent.type('ada');
    ui.frame();

    expect(ui.getSemantics(email).states).toEqual(['invalid', 'required']);
    expect(ui.getByText('An address needs an @')).toBeDefined();

    ui.fireEvent.type('@example.com');
    ui.frame();

    // An empty error is no error: the state goes and the description
    // comes back in its place.
    expect(ui.getSemantics(email).states).toEqual(['required']);
    expect(ui.getByText('Enter submits it.')).toBeDefined();
  });
});
