import { describe, expect, it } from 'vitest';

import { UiNodeType, type UiNode } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Activity } from './RecipeFeedExample';

const SIZE = { width: 460, height: 380 };
/** 200 px of list over entries of about 46, plus three of overscan each side. */
const WINDOW_CEILING = 16;

function screen(): Rendered {
  return renderTest(createComponent(Activity, {}), SIZE);
}

/** The scroll container that is the feed. */
function feed(ui: Rendered): UiNode {
  const found: UiNode[] = [];
  const visit = (node: UiNode): void => {
    if (node.type === UiNodeType.ScrollView) {
      found.push(node);
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(ui.runtime.debugRoot());
  return found[0]!;
}

/** The entries that exist right now, top to bottom. */
function entries(ui: Rendered): UiNode[] {
  return ui.getAllByRole('listitem');
}

/** The `#1042 Ravi` line of every mounted entry, top to bottom. */
function numbers(ui: Rendered): string[] {
  return entries(ui).map(node => ui.textOf(node)[0].split(' ')[0]);
}

/**
 * Where a mounted entry is on screen, by its number.
 *
 * A layout box is where the entry sits in the scrolled content, so the
 * scroll offset has to come off it: what the reader sees move is the
 * difference between the two.
 */
function yOf(ui: Rendered, number: string): number {
  const found = entries(ui).find(node => ui.textOf(node)[0].startsWith(`${number} `));
  if (found === undefined) {
    throw new Error(`entry ${number} is not mounted`);
  }
  return ui.getLayout(found).y - (ui.explain(feed(ui)).scroll?.scrollY ?? 0);
}

/** The caption under the feed. */
function caption(ui: Rendered): string {
  const line = ui.textOf().find(text => text.includes('entries, #'));
  if (line === undefined) {
    throw new Error('the example has no caption');
  }
  return line;
}

function press(ui: Rendered, name: string): void {
  ui.fireEvent.click(ui.getByRole('button', { name }));
  ui.frame();
  ui.frame();
}

function wheel(ui: Rendered, deltaY: number): void {
  const box = ui.getLayout(feed(ui));
  ui.fireEvent.wheel({ x: box.x + box.width / 2, y: box.y + box.height / 2, deltaY });
  ui.frame();
  ui.frame();
}

/**
 * What the page claims: the feed mounts a window whatever the count
 * does; entries arriving at the end leave the reader exactly where they
 * are; entries arriving at the start move the feed under the reader
 * unless the offset is moved with them, and the anchored button moves
 * it; and the jump lands on the newest entry by asking for more scroll
 * than there is.
 */
describe('the virtualized feed recipe', () => {
  it('mounts a window of the feed, and says how long the feed really is', () => {
    const ui = screen();

    const mounted = entries(ui);
    // 200 px of viewport over entries of 42 to 56, plus three of
    // overscan on each side.
    expect(mounted.length).toBe(8);
    expect(mounted.length).toBeLessThan(WINDOW_CEILING);
    expect(ui.getByRole('list')).toHaveSemantics({ role: 'list', name: 'Activity' });
    expect(ui.getSemantics(mounted[0])).toMatchObject({ posInSet: 1, setSize: 120 });
    // 120 entries at an estimate of 46 is 5,520 px of scroll range, and
    // the eight that are mounted have been measured, which is the 2.8 px
    // of correction in this figure. The other 112 are still estimates.
    expect(ui.explain(feed(ui)).scroll?.contentHeight).toBeCloseTo(5517.2, 0);
    expect(numbers(ui)[0]).toBe('#1000');
    expect(caption(ui)).toBe('120 entries, #1000 to #1119, 0 px down');
  });

  it('stays a window as the feed grows', () => {
    const ui = screen();

    press(ui, '3 newer');
    press(ui, '3 newer');
    press(ui, '3 newer');

    expect(caption(ui)).toBe('129 entries, #1000 to #1128, 0 px down');
    // Every mounted entry reports the new length of the feed, and there
    // are no more of them than there were.
    expect(ui.getSemantics(entries(ui)[0]).setSize).toBe(129);
    expect(entries(ui).length).toBeLessThan(WINDOW_CEILING);
  });

  it('leaves the reader where they are when entries arrive at the end', () => {
    const ui = screen();
    wheel(ui, 1200);
    const top = numbers(ui)[0];
    const where = yOf(ui, top);

    press(ui, '3 newer');

    // Appending changes no index, so nothing is re-rendered and nothing
    // moves: the same entries are mounted, in the same places.
    expect(numbers(ui)[0]).toBe(top);
    expect(yOf(ui, top)).toBe(where);
    expect(caption(ui)).toContain('1,200 px down');
  });

  it('moves the feed under the reader when entries arrive at the start', () => {
    const ui = screen();
    wheel(ui, 1200);
    const top = numbers(ui)[0];
    const where = yOf(ui, top);

    press(ui, '10 older, naive');

    // The offset did not move, and ten entries were pushed in above it,
    // so the same offset now names an entry ten places earlier and the
    // entry the reader was on has moved a screenful down.
    expect(caption(ui)).toContain('1,200 px down');
    expect(numbers(ui)[0]).toBe('#1013');
    expect(yOf(ui, top) - where).toBeCloseTo(462, 0);
  });

  it('keeps the reader on the same entry when the offset is anchored', () => {
    const ui = screen();
    wheel(ui, 1200);
    const top = numbers(ui)[0];
    const where = yOf(ui, top);

    press(ui, '10 older');

    expect(caption(ui)).toContain('130 entries, #990 to #1119');
    // The same entry, within half an entry of where it was, with ten
    // more above it. Not exact: the ten that arrived have never been
    // measured, so what the offset moves by is the window's estimate of
    // them. 28 px downward here, against 462 for the naive load, on
    // entries of 42 to 56.
    expect(yOf(ui, top) - where).toBeCloseTo(28, 0);
    expect(entries(ui).length).toBeLessThan(WINDOW_CEILING);
  });

  it('jumps to the newest entry by asking for more scroll than there is', () => {
    const ui = screen();

    press(ui, 'Jump to newest');

    const scroll = ui.explain(feed(ui)).scroll;
    // The offset the list settled on is the bottom of the content, and
    // the caption reports that rather than the number the button wrote.
    expect(scroll?.scrollY).toBe((scroll?.contentHeight ?? 0) - 200);
    // The range has settled from 5,517 to 5,482 on the way: the entries
    // that were mounted are measured, and the rest are still estimates.
    expect(scroll?.contentHeight).toBeCloseTo(5482, 0);
    expect(caption(ui)).toContain(`${Math.round(scroll?.scrollY ?? 0).toLocaleString('en-US')} px down`);
    expect(numbers(ui)).toContain('#1119');
    expect(entries(ui).length).toBeLessThan(WINDOW_CEILING);
  });
});
