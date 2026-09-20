import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Preferences } from './CheckboxExample';

const mount = () => renderTest(createComponent(Preferences, {}), { width: 420, height: 260 });

/**
 * The page claims three things about `Checkbox`: that a controlled box
 * shows the application's value and nothing else, that an uncontrolled
 * one keeps its own, and that Space and Enter are what toggle it. Each
 * is a test here, reached the way an assistive technology reaches the
 * control, by role and accessible name.
 */
describe('the docs checkbox example', () => {
  it('announces every box by role, name and state', () => {
    const ui = mount();

    expect(ui.getAllByRole('checkbox')).toHaveLength(4);
    // Unticked and required is invalid, and both states are announced.
    expect(ui.getByRole('checkbox', { name: 'Accept the terms' })).toHaveSemantics({
      role: 'checkbox',
      name: 'Accept the terms',
      states: ['invalid', 'required']
    });
    expect(ui.getByRole('checkbox', { name: 'Remember this device' })).toHaveSemantics({ states: ['checked'] });
    expect(ui.getByRole('checkbox', { name: 'Import from the old account' })).toHaveSemantics({
      disabled: true,
      states: []
    });
  });

  it('does not move a controlled box until the application moves it', () => {
    const ui = mount();
    const updates = ui.getByRole('checkbox', { name: 'Send me product updates' });

    ui.fireEvent.click(updates);
    ui.frame();

    // The click reached the handler; the handler declined to write, so
    // the box is exactly where the application left it.
    expect(updates).toHaveSemantics({ states: [] });

    ui.fireEvent.click(ui.getByRole('checkbox', { name: 'Accept the terms' }));
    ui.frame();

    // Accepting the terms clears `invalid` on the box the application
    // does write, without that box being touched a second time.
    expect(ui.getByRole('checkbox', { name: 'Accept the terms' })).toHaveSemantics({ states: ['checked', 'required'] });

    ui.fireEvent.click(updates);
    ui.frame();

    expect(updates).toHaveSemantics({ states: ['checked'] });
    expect(ui.getByText('We will email you')).toBeDefined();
  });

  it('lets the uncontrolled box manage itself, without telling the application', () => {
    const ui = mount();
    const remember = ui.getByRole('checkbox', { name: 'Remember this device' });

    expect(remember).toHaveSemantics({ states: ['checked'] });

    ui.fireEvent.click(remember);
    ui.frame();

    expect(remember).toHaveSemantics({ states: [] });
    // No application state moved with it: the summary is what it was.
    expect(ui.getByText('Accept the terms to choose the rest')).toBeDefined();
  });

  it('toggles from Space and from Enter', () => {
    const ui = mount();
    const remember = ui.getByRole('checkbox', { name: 'Remember this device' });

    ui.fireEvent.focus(remember);
    ui.fireEvent.press(' ');
    ui.frame();

    expect(remember).toHaveSemantics({ states: [] });

    ui.fireEvent.press('Enter');
    ui.frame();

    expect(remember).toHaveSemantics({ states: ['checked'] });
  });

  it('takes neither a click nor a key while disabled', () => {
    const ui = mount();
    const legacy = ui.getByRole('checkbox', { name: 'Import from the old account' });

    ui.fireEvent.click(legacy);
    ui.frame();
    ui.fireEvent.focus(legacy);
    ui.fireEvent.press(' ');
    ui.frame();

    expect(legacy).toHaveSemantics({ states: [] });
  });
});
