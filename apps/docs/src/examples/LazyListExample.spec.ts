import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Box, Text, type UiSemanticsRecord } from '@gesso/core';
import { LazyList } from '@gesso/components';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Events } from './LazyListExample';

const SIZE = { width: 460, height: 320 };

function list(): Rendered {
  return renderTest(createComponent(Events, {}), SIZE);
}

/** The rows that exist right now. */
function rows(ui: Rendered): UiSemanticsRecord[] {
  return ui.getAllByRole('listitem').map(node => ui.getSemantics(node));
}

/** The text of the rows that exist right now, top to bottom. */
function texts(ui: Rendered): string[] {
  return ui.getAllByRole('listitem').flatMap(node => ui.textOf(node));
}

/**
 * What the page claims: a list of a hundred thousand rows mounts a
 * window of them and no more; every mounted row reports its real index
 * and the real count; a change of data re-renders the mounted rows
 * where they are; the keyboard walks the whole list and scrolls to a
 * row that does not exist yet; and the count is a value the list
 * follows rather than a number it was built with.
 */
describe('the docs lazy list example', () => {
  it('mounts a window of a hundred thousand rows, not a hundred thousand rows', () => {
    const ui = list();

    const mounted = rows(ui);
    // A viewport of 168 at 26 a row shows seven, and the overscan band
    // is three rows on each side.
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.length).toBeLessThan(20);
    expect(texts(ui)[0]).toBe('Event 0');

    // What each of them reports is its place in the whole list.
    expect(mounted[0].posInSet).toBe(1);
    expect(mounted[0].setSize).toBe(100000);
    expect(ui.getByRole('list')).toHaveSemantics({ role: 'list', name: 'Events' });
    expect(ui.textOf()).toContain('100,000 rows. Chosen: nothing');
  });

  it('re-renders the mounted rows in place when what an index means changes', () => {
    const ui = list();
    const before = rows(ui).length;

    ui.fireEvent.click(ui.getByRole('button', { name: 'Newest first' }));
    ui.frame();

    // The same window, the same offset, different content: this is the
    // `revision` prop, and it is what a sort or a filter needs.
    expect(texts(ui)[0]).toBe('Event 99999');
    expect(rows(ui).length).toBe(before);
    expect(ui.getByRole('list').properties.get('scrollY') ?? 0).toBe(0);
  });

  it('follows a count that changes', () => {
    const ui = list();

    ui.fireEvent.click(ui.getByRole('button', { name: '25 rows' }));
    ui.frame();
    expect(rows(ui)[0].setSize).toBe(25);
    expect(ui.textOf()).toContain('25 rows. Chosen: nothing');

    ui.fireEvent.click(ui.getByRole('button', { name: '100,000 rows' }));
    ui.frame();
    expect(rows(ui)[0].setSize).toBe(100000);
  });

  it('walks the whole list from the keyboard and scrolls to a row that is not mounted', () => {
    const ui = list();
    const node = ui.getByRole('list');
    ui.fireEvent.focus(node);
    ui.frame();

    ui.fireEvent.press('ArrowDown');
    ui.frame();
    expect(ui.textOf()).toContain('100,000 rows. Chosen: row 0');
    ui.fireEvent.press('ArrowDown');
    ui.frame();
    expect(ui.textOf()).toContain('100,000 rows. Chosen: row 1');
    ui.fireEvent.press('ArrowUp');
    ui.frame();
    expect(ui.textOf()).toContain('100,000 rows. Chosen: row 0');
    ui.fireEvent.press('PageDown');
    ui.frame();
    expect(ui.textOf()).toContain('100,000 rows. Chosen: row 10');
    ui.fireEvent.press('PageUp');
    ui.frame();
    expect(ui.textOf()).toContain('100,000 rows. Chosen: row 0');

    ui.fireEvent.press('End');
    ui.frame();
    expect(ui.textOf()).toContain('100,000 rows. Chosen: row 99999');
    // The last row is 100,000 rows of 26 less the 168 of the viewport.
    expect(node.properties.get('scrollY')).toBe(100000 * 26 - 168);
    expect(texts(ui)).toContain('Event 99999');
    // And the window is still a window.
    expect(rows(ui).length).toBeLessThan(20);

    ui.fireEvent.press('Home');
    ui.frame();
    expect(ui.textOf()).toContain('100,000 rows. Chosen: row 0');
    expect(node.properties.get('scrollY')).toBe(0);
    expect(texts(ui)[0]).toBe('Event 0');
  });

  it('does not scroll for a choice the application wrote itself', () => {
    // The page says the list scrolls to a row *the keyboard* reached.
    // A controlled index written from outside is drawn as chosen, and
    // that is all: nothing reveals it.
    const index = new BehaviorSubject(0);
    const ui = renderTest(
      createComponent(LazyList, {
        label: 'Events',
        count: 100000,
        height: 168,
        estimatedItemExtent: 26,
        selectedIndex: index,
        item: (row: number) => Box({ height: 26 }, Text({ text: `Event ${row}` }))
      }),
      SIZE
    );

    index.next(5000);
    ui.frame();
    expect(ui.getByRole('list').properties.get('scrollY') ?? 0).toBe(0);
    expect(ui.textOf()).not.toContain('Event 5000');
    expect(rows(ui).filter(record => record.states?.includes('selected'))).toHaveLength(0);
  });

  it('marks the chosen row selected, and only that row', () => {
    const ui = list();

    ui.fireEvent.click(ui.getAllByRole('listitem')[2]);
    ui.frame();
    const selected = rows(ui).filter(record => record.states?.includes('selected'));
    expect(selected).toHaveLength(1);
    expect(selected[0].posInSet).toBe(3);
    expect(ui.textOf()).toContain('100,000 rows. Chosen: row 2');
  });
});
