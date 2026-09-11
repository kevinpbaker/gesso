import { describe, expect, it } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Filters } from './ChipExample';

const mount = () => renderTest(createComponent(Filters, {}), { width: 720, height: 260 });

/**
 * The page claims four things about `Chip`: that it is a toggle button
 * whose `pressed` state is the application's `selected`, that a
 * controlled chip moves only when the application writes back, that
 * the name can say more than the word and the count joins it, and that
 * Space and Enter operate it. Each is a test here, reached the way an
 * assistive technology reaches the control, by role and accessible
 * name.
 */
describe('the docs chip example', () => {
  it('announces every chip by role, name and state', () => {
    const ui = mount();

    // "All" is on until a genre is pressed, and its name says so.
    expect(ui.getByRole('button', { name: 'All, showing' })).toHaveSemantics({ role: 'button', states: ['pressed'] });
    // A count is read after the word, as it is drawn after it.
    expect(ui.getByRole('button', { name: 'Metal, 119,205' })).toHaveSemantics({ states: [] });
    expect(ui.getByText('119,205')).toBeTruthy();
    // The switches in the toolbar row.
    expect(ui.getByRole('button', { name: 'Liked' })).toHaveSemantics({ states: ['pressed'] });
    expect(ui.getByRole('button', { name: 'Verified artists only' })).toHaveSemantics({ states: [] });
    expect(ui.getByRole('button', { name: 'Offline only' })).toHaveSemantics({ disabled: true, states: [] });
  });

  it('picks one genre or none, and the sentence follows', () => {
    const ui = mount();
    expect(ui.getByText('Showing every genre, liked tracks.')).toBeTruthy();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Metal, 119,205' }));
    ui.frame();

    expect(ui.getByRole('button', { name: 'Metal, 119,205' })).toHaveSemantics({ states: ['pressed'] });
    // The chip that was on went off, and its name changed with it.
    expect(ui.getByRole('button', { name: 'Show all' })).toHaveSemantics({ states: [] });
    expect(ui.getByText('Showing Metal, liked tracks.')).toBeTruthy();

    // Pressing the chosen genre again chooses none.
    ui.fireEvent.click(ui.getByRole('button', { name: 'Metal, 119,205' }));
    ui.frame();
    expect(ui.getByRole('button', { name: 'All, showing' })).toHaveSemantics({ states: ['pressed'] });
  });

  it('toggles a switch chip from Space and from Enter', () => {
    const ui = mount();
    const verified = ui.getByRole('button', { name: 'Verified artists only' });

    ui.fireEvent.focus(verified);
    ui.fireEvent.press(' ');
    ui.frame();
    expect(verified).toHaveSemantics({ states: ['pressed'] });
    expect(ui.getByText('Showing every genre, verified artists only, liked tracks.')).toBeTruthy();

    ui.fireEvent.press('Enter');
    ui.frame();
    expect(verified).toHaveSemantics({ states: [] });
  });

  it('clears every filter from a chip that is never on', () => {
    const ui = mount();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Folk, 32,476' }));
    ui.frame();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Clear filters' }));
    ui.frame();

    expect(ui.getByRole('button', { name: 'Clear filters' })).toHaveSemantics({ states: [] });
    expect(ui.getByRole('button', { name: 'Liked' })).toHaveSemantics({ states: [] });
    expect(ui.getByText('Showing every genre.')).toBeTruthy();
  });

  it('takes neither a click nor a key while disabled', () => {
    const ui = mount();
    const offline = ui.getByRole('button', { name: 'Offline only' });

    ui.fireEvent.click(offline);
    ui.frame();
    ui.fireEvent.focus(offline);
    ui.fireEvent.press(' ');
    ui.frame();

    expect(offline).toHaveSemantics({ states: [] });
  });
});
