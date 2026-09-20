import { describe, expect, it } from 'vitest';

import { matchRangesOf, selectionRangeOf } from 'gesso-core';
import { createComponent, FindService, FocusService } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { FindablePage, PAGE } from './FindExample';

const SIZE = { width: 520, height: 360 };

const mount = () => renderTest(createComponent(FindablePage, {}), SIZE);

/** The reactive face of the session, which is what the bar binds to. */
const service = (ui: Rendered) => ui.runtime.services.get(FindService);

/** Opens a session the way the button does, then types into the bar's field. */
function search(ui: Rendered, query: string): void {
  ui.fireEvent.click(ui.getByLabel('Search this page'));
  ui.frame();
  ui.fireEvent.type(query);
  ui.frame();
}

/**
 * The page claims the bar finds every match in the app's own text,
 * counts them, steps through them with the active one selected, and
 * leaves opted-out text out of the search. Each is a test.
 */
describe('the docs find example', () => {
  it('opens a session and puts the caret in the bar', () => {
    const ui = mount();
    expect(service(ui).open.value).toBe(false);

    ui.fireEvent.click(ui.getByLabel('Search this page'));
    ui.frame();

    expect(service(ui).open.value).toBe(true);
    // The bar registers its field with the service, so the session it
    // opens has somewhere to put the caret.
    expect(ui.runtime.services.get(FocusService).focused.value).toBe(ui.getByRole('searchbox'));
  });

  it('finds every match in the app text and none in the opted-out line', () => {
    const ui = mount();
    search(ui, 'canvas');

    // "canvas" is in both paragraphs and in the line that sets
    // `selectable={false}`, which is not part of the corpus.
    expect(service(ui).matchCount.value).toBe(2);
    expect(matchRangesOf(ui.getByText(PAGE.first))).toHaveLength(1);
    expect(matchRangesOf(ui.getByText(PAGE.second))).toHaveLength(1);
    expect(matchRangesOf(ui.getByText(PAGE.excluded))).toBeUndefined();
  });

  it('makes the active match a real selection, and moves it with Enter', () => {
    const ui = mount();
    search(ui, 'canvas');

    const first = ui.getByText(PAGE.first);
    const second = ui.getByText(PAGE.second);
    const at = PAGE.first.indexOf('canvas');
    expect(service(ui).activeMatch.value).toBe(1);
    expect(selectionRangeOf(first)).toEqual({ start: at, end: at + 'canvas'.length });
    expect(ui.getByText('1 of 2')).toBeDefined();

    // Enter is the app's in a single-line field, so the bar takes it.
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    expect(service(ui).activeMatch.value).toBe(2);
    expect(selectionRangeOf(first)).toBeUndefined();
    expect(selectionRangeOf(second)).toEqual({
      start: PAGE.second.indexOf('canvas'),
      end: PAGE.second.indexOf('canvas') + 'canvas'.length
    });
    expect(ui.getByText('2 of 2')).toBeDefined();

    // Two matches, so the next step wraps back to the first.
    ui.fireEvent.click(ui.getByLabel('Next match'));
    ui.frame();
    expect(service(ui).activeMatch.value).toBe(1);

    ui.fireEvent.click(ui.getByLabel('Previous match'));
    ui.frame();
    expect(service(ui).activeMatch.value).toBe(2);
  });

  it('ignores case unless it is asked not to', () => {
    const ui = mount();
    search(ui, 'CANVAS');
    expect(service(ui).matchCount.value).toBe(2);

    // `matchCase` is the engine's option; the bar does not offer it.
    expect(ui.runtime.input.find.search('CANVAS', { matchCase: true })).toBe(0);
  });

  it('says so when a query matches nothing', () => {
    const ui = mount();
    search(ui, 'zebra');

    expect(service(ui).matchCount.value).toBe(0);
    expect(service(ui).activeMatch.value).toBe(0);
    expect(ui.getByText('No results')).toBeDefined();
  });

  it('closes on Escape and leaves the last match selected', () => {
    const ui = mount();
    search(ui, 'canvas');
    const first = ui.getByText(PAGE.first);

    ui.fireEvent.keyDown('Escape');
    ui.frame();

    expect(service(ui).open.value).toBe(false);
    // The highlights go with the session; the selection stays, as it
    // does when a browser's find bar closes.
    expect(matchRangesOf(first)).toBeUndefined();
    expect(selectionRangeOf(first)).toEqual({
      start: PAGE.first.indexOf('canvas'),
      end: PAGE.first.indexOf('canvas') + 'canvas'.length
    });
  });
});
