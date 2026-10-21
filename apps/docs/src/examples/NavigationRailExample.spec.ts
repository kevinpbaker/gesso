import { describe, expect, it } from 'vitest';

import type { UiSemanticsRecord } from 'gesso-core';
import { createComponent, createShellHistory, RouterService, type ShellRequest } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { MailRail, RAIL_ROUTES } from './NavigationRailExample';

function mount(): Rendered {
  const ui = renderTest(createComponent(MailRail, {}), { width: 560, height: 340, routes: RAIL_ROUTES });
  // The shell's half of routing, played by the test with a memory
  // history, as the routing example's spec plays it.
  const router = ui.runtime.services.get(RouterService);
  const history = createShellHistory({ mode: 'memory' });
  router.setHistory(history);
  history.onChange(url => router.applyUrl(url));
  ui.frame();
  return ui;
}

function url(ui: Rendered): string {
  return ui.runtime.services.get(RouterService).url.value;
}

function rows(ui: Rendered): UiSemanticsRecord[] {
  return ui.getAllByRole('treeitem').map(node => ui.getSemantics(node));
}

/** The rows the rail marks as the current page. */
function current(ui: Rendered): (string | undefined)[] {
  return rows(ui)
    .filter(record => record.states?.includes('current'))
    .map(record => record.label);
}

/**
 * What the page claims: the rail shows where the router is, a press
 * asks the router to go and the rail follows the url rather than the
 * press, a modified press opens the page somewhere new and leaves this
 * one alone, the keys move focus and only Enter navigates, the group
 * starts open, the disabled row cannot be reached, and collapsing keeps
 * every name.
 */
describe('the docs navigation rail example', () => {
  it('starts on the inbox, with the group open and the inbox marked current', () => {
    const ui = mount();

    expect(url(ui)).toBe('/inbox');
    expect(ui.getByRole('navigation')).toHaveSemantics({ role: 'navigation', name: 'Mail' });
    expect(rows(ui).map(record => record.label)).toEqual([
      'Inbox',
      'Drafts',
      'Sent',
      'Labels',
      'Work',
      'Family',
      'Settings'
    ]);
    expect(current(ui)).toEqual(['Inbox']);
    expect(ui.getSemantics(ui.getByRole('treeitem', { name: 'Inbox' })).description).toBe('12 unread');
    expect(ui.getByRole('treeitem', { name: 'Sent', disabled: true })).toBeTruthy();
  });

  it('navigates on a press, and marks the page the router landed on', () => {
    const ui = mount();

    ui.fireEvent.click(ui.getByRole('treeitem', { name: 'Work' }));
    ui.frame();

    expect(url(ui)).toBe('/labels/work');
    expect(current(ui)).toEqual(['Work']);
    expect(ui.getByText('Mail labelled Work.')).toBeTruthy();
  });

  it('follows a navigation that did not come from the rail', () => {
    const ui = mount();

    ui.runtime.services.get(RouterService).navigate('/settings');
    ui.frame();

    expect(current(ui)).toEqual(['Settings']);
  });

  it('moves focus with the arrows and navigates only on Enter, stepping over the disabled row', () => {
    const ui = mount();
    ui.fireEvent.tab();
    ui.fireEvent.tab();
    ui.frame();
    expect(ui.getByRole('treeitem', { name: 'Inbox' })).toHaveFocus();

    ui.fireEvent.press('ArrowDown');
    ui.fireEvent.press('ArrowDown');
    ui.frame();
    expect(ui.getByRole('treeitem', { name: 'Labels' })).toHaveFocus();
    expect(url(ui)).toBe('/inbox');

    ui.fireEvent.press('ArrowRight');
    ui.fireEvent.press('ArrowDown');
    ui.fireEvent.press('Enter');
    ui.frame();
    expect(url(ui)).toBe('/labels/family');
    expect(current(ui)).toEqual(['Family']);
  });

  it('opens a page somewhere new on a Cmd-click or Ctrl-Enter, and stays where it is', () => {
    const ui = mount();
    const requests: ShellRequest[] = [];
    ui.runtime.onShellRequest(request => requests.push(request));

    ui.fireEvent.click(ui.getByRole('treeitem', { name: 'Work' }), { modifiers: { meta: true } });
    ui.fireEvent.focus(ui.getByRole('treeitem', { name: 'Settings' }));
    ui.fireEvent.press('Enter', { ctrl: true });
    ui.frame();

    expect(requests.filter(request => request.type === 'openRoute')).toEqual([
      { type: 'openRoute', url: '/labels/work' },
      { type: 'openRoute', url: '/settings' }
    ]);
    expect(url(ui)).toBe('/inbox');
    expect(current(ui)).toEqual(['Inbox']);
  });

  it('collapses to icons and keeps every row named', () => {
    const ui = mount();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Collapse the rail' }));
    ui.frame();

    expect(ui.queryByText('Drafts')).toBeNull();
    expect(rows(ui).map(record => record.label)).toContain('Drafts');
    expect(ui.getByRole('button', { name: 'Expand the rail' })).toBeTruthy();
  });
});
