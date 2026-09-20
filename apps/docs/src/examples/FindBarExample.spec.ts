import { describe, expect, it } from 'vitest';

import { createComponent, FindService } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Searchable } from './FindBarExample';

const SIZE = { width: 460, height: 300 };

function mount() {
  const ui = renderTest(createComponent(Searchable, {}), SIZE);
  ui.frame();
  return {
    ...ui,
    find: ui.runtime.services.get(FindService),
    /** Opens a session and types a query into the bar's own field. */
    search: (query: string) => {
      ui.fireEvent.keyDown('f', { ctrl: true });
      ui.frame();
      ui.fireEvent.focus(ui.getByRole('searchbox'));
      ui.fireEvent.type(query);
      ui.frame();
    }
  };
}

/** What the bar's counter currently reads. */
function counter(ui: Rendered): string {
  return String(ui.getByText(/results$|^No results$|of /).getProperty('text'));
}

/**
 * The page claims that Ctrl+F opens a session and Escape closes one,
 * that typing in the bar searches the app's own text, that the counter
 * reads "n of m", that Enter and the two arrows step through the
 * matches and wrap, and that the bar is drawn only while a session is
 * running. Each is a test.
 */
describe('the docs find bar example', () => {
  it('opens a session on the platform shortcut, and closes it on Escape', () => {
    const ui = mount();
    expect(ui.find.open.value).toBe(false);

    ui.fireEvent.keyDown('f', { ctrl: true });
    ui.frame();
    expect(ui.find.open.value).toBe(true);

    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(ui.find.open.value).toBe(false);
  });

  it('opens the same session from the button, through the store', () => {
    const ui = mount();

    ui.fireEvent.click(ui.getByLabel('Open find'));
    ui.frame();

    expect(ui.find.open.value).toBe(true);
  });

  it('announces the bar as a search region holding a searchbox', () => {
    const ui = mount();
    ui.fireEvent.keyDown('f', { ctrl: true });
    ui.frame();

    expect(ui.getByRole('search')).toHaveSemantics({ role: 'search', name: 'Find on page' });
    expect(ui.getByRole('searchbox')).toHaveSemantics({ role: 'searchbox', name: 'Find' });
    expect(ui.getAllByRole('button').map(node => ui.getSemantics(node).label)).toEqual([
      'Open find',
      'Previous match',
      'Next match',
      'Close find'
    ]);
  });

  it('searches the page as the query is typed, and counts what it found', () => {
    const ui = mount();
    ui.search('canvas');

    expect(ui.find.matchCount.value).toBe(3);
    expect(ui.find.activeMatch.value).toBe(1);
    expect(counter(ui)).toBe('1 of 3');
  });

  it('says so when there is nothing to find', () => {
    const ui = mount();
    ui.search('elephant');

    expect(ui.find.matchCount.value).toBe(0);
    expect(counter(ui)).toBe('No results');
  });

  it('steps forward with Enter and back with Shift+Enter, wrapping at the ends', () => {
    const ui = mount();
    ui.search('canvas');

    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(counter(ui)).toBe('2 of 3');

    ui.fireEvent.keyDown('Enter');
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    // Three matches, so the third Enter wrapped back to the first.
    expect(counter(ui)).toBe('1 of 3');

    ui.fireEvent.keyDown('Enter', { shift: true });
    ui.frame();
    expect(counter(ui)).toBe('3 of 3');
  });

  it('steps from the two buttons as well as from the keyboard', () => {
    const ui = mount();
    ui.search('canvas');

    ui.fireEvent.click(ui.getByRole('button', { name: 'Next match' }));
    ui.frame();
    expect(counter(ui)).toBe('2 of 3');

    ui.fireEvent.click(ui.getByRole('button', { name: 'Previous match' }));
    ui.frame();
    expect(counter(ui)).toBe('1 of 3');
  });

  it('closes from its own button, and drops the matches with the session', () => {
    const ui = mount();
    ui.search('canvas');

    ui.fireEvent.click(ui.getByRole('button', { name: 'Close find' }));
    ui.frame();

    expect(ui.find.open.value).toBe(false);
    expect(ui.find.matchCount.value).toBe(0);
  });

  it('shows itself for a session, and says nothing while there is none', () => {
    const ui = mount();

    // The bar is always in the tree; `visible` is bound to the
    // session, so nothing conditionally renders it.
    expect(ui.queryByRole('search')).toBeNull();
    expect(ui.queryByRole('searchbox')).toBeNull();

    ui.fireEvent.keyDown('f', { ctrl: true });
    ui.frame();
    const bar = ui.getByRole('search');
    expect(bar.getProperty('visible')).toBe(true);

    ui.fireEvent.keyDown('Escape');
    ui.frame();

    // Hidden, and out of the semantics tree with it: a screen reader
    // is not offered a search box that is not on screen.
    expect(bar.getProperty('visible')).toBe(false);
    expect(ui.queryByRole('search')).toBeNull();
  });

  it('floats over the page instead of reflowing it', () => {
    const ui = mount();
    const before = ui.getLayout(ui.getByText(/^The browser cannot find/));

    ui.fireEvent.keyDown('f', { ctrl: true });
    ui.frame();

    expect(ui.getLayout(ui.getByText(/^The browser cannot find/))).toEqual(before);
    expect(ui.getByRole('search').getProperty('position')).toBe('absolute');
  });
});
