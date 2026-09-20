import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Observations } from './PaginationExample';

const mount = () => renderTest(createComponent(Observations, {}), { width: 720, height: 360 });

/**
 * The page claims five things about `Pagination`: that the strip is a
 * named landmark, that each numbered control is named as a sentence
 * while the screen shows a numeral, that the current page is
 * `selected` rather than only painted, that the ends are disabled
 * rather than absent, and that an ellipsis is never drawn where a
 * single page would do. Each is a test here, reached the way an
 * assistive technology reaches it.
 */
describe('the docs pagination example', () => {
  it('is a landmark with a name of its own', () => {
    const ui = mount();

    expect(ui.getByRole('navigation')).toHaveSemantics({ role: 'navigation', name: 'Observations' });
  });

  it('names each numbered control as a sentence and draws it as a numeral', () => {
    const ui = mount();

    expect(ui.getByRole('button', { name: 'Page 4' })).toBeTruthy();
    expect(ui.getByText('4')).toBeTruthy();
    // Never "…" where one page would have done: twelve pages, page 1,
    // so page 2 is drawn and page 11 is the one behind the elision.
    expect(ui.getByRole('button', { name: 'Page 2' })).toBeTruthy();
    expect(ui.queryByRole('button', { name: 'Page 11' })).toBeNull();
  });

  it('marks the page you are on, and only in a state the union has', () => {
    const ui = mount();

    expect(ui.getByRole('button', { name: 'Page 1' })).toHaveSemantics({ states: ['selected'] });
    expect(ui.getSemantics(ui.getByRole('button', { name: 'Page 2' })).states ?? []).toEqual([]);
  });

  it('disables the ends rather than removing them', () => {
    const ui = mount();

    expect(ui.getByRole('button', { name: 'Previous page', disabled: true })).toBeTruthy();
    expect(ui.getByRole('button', { name: 'Next page', disabled: false })).toBeTruthy();
  });

  it('moves the rows and the strip together', () => {
    const ui = mount();

    expect(ui.getByText('Showing 1 to 8 of 96')).toBeTruthy();
    expect(ui.getByText('01')).toBeTruthy();
    expect(ui.queryByText('09')).toBeNull();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Next page' }));
    ui.frame();

    expect(ui.getByText('Showing 9 to 16 of 96')).toBeTruthy();
    expect(ui.getByText('09')).toBeTruthy();
    expect(ui.getByRole('button', { name: 'Page 2' })).toHaveSemantics({ states: ['selected'] });
    // Previous is reachable now, and it was not before.
    expect(ui.getByRole('button', { name: 'Previous page', disabled: false })).toBeTruthy();
  });

  it('reaches the far end by name, and stops there', () => {
    const ui = mount();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Page 12' }));
    ui.frame();

    expect(ui.getByText('Showing 89 to 96 of 96')).toBeTruthy();
    expect(ui.getByRole('button', { name: 'Next page', disabled: true })).toBeTruthy();
    // The mirror of the first page: page 11 is drawn rather than
    // elided, because an ellipsis there would stand for it alone.
    expect(ui.getByRole('button', { name: 'Page 11' })).toBeTruthy();
    expect(ui.queryByRole('button', { name: 'Page 2' })).toBeNull();
  });
});
