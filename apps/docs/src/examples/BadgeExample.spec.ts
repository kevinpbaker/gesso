import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Mailbox } from './BadgeExample';

const mount = () => renderTest(createComponent(Mailbox, {}), { width: 720, height: 340 });

/**
 * The page claims four things about `Badge`: that a live badge is a
 * polite status whose name says what its figure means, that a plain
 * one declares nothing and is still read as the prose inside it, that
 * a count past `max` draws "99+", and that a dot carries its meaning
 * in a name because it has no text to carry it. Each is a test here,
 * reached the way an assistive technology reaches it.
 */
describe('the docs badge example', () => {
  it('announces the inbox count as a polite status', () => {
    const ui = mount();
    const record = ui.getSemantics(ui.getByRole('status'));

    expect(record.role).toBe('status');
    expect(record.live).toBe('polite');
    expect(record.label).toBe('7 unread messages');
    expect(ui.getByText('7')).toBeTruthy();
  });

  it('follows the count as the mailbox fills and empties', () => {
    const ui = mount();

    ui.fireEvent.click(ui.getByRole('button', { name: 'New message' }));
    ui.frame();
    expect(ui.getSemantics(ui.getByRole('status')).label).toBe('8 unread messages');
    expect(ui.getByText('8')).toBeTruthy();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Mark all read' }));
    ui.frame();
    expect(ui.getSemantics(ui.getByRole('status')).label).toBe('0 unread messages');
  });

  it('draws a folder count as prose, with no role invented for it', () => {
    const ui = mount();

    // Drafts is a plain badge: nothing declares it, and the figure in
    // it is read as the prose it is.
    expect(ui.getSemantics(ui.getByText('3')).label).toBe('3');
    // Spam is past `max`, so the component caps it rather than the
    // example doing string arithmetic.
    expect(ui.getByText('99+')).toBeTruthy();
    expect(ui.queryByText('1284')).toBeNull();
    // Archive has nothing waiting and so has no badge at all.
    expect(ui.queryByText('0')).toBeNull();
  });

  it('names the dot, which has no text to be named by', () => {
    const ui = mount();

    expect(ui.getByRole('image')).toHaveSemantics({ role: 'image', name: 'Unsaved changes' });
    expect(ui.getByText('Live')).toBeTruthy();
    expect(ui.getByText('Failed')).toBeTruthy();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Save draft' }));
    ui.frame();
    expect(ui.getByText('Draft saved')).toBeTruthy();
  });
});
