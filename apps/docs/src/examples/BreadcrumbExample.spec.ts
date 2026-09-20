import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';
import type { UiNode } from 'gesso-core';

import { Trail } from './BreadcrumbExample';

const mount = () => renderTest(createComponent(Trail, {}), { width: 720, height: 300 });

type Ui = ReturnType<typeof mount>;

/** The crumbs of one of the two trails, by the landmark that holds them. */
function crumbsOf(ui: Ui, landmark: string): string[] {
  const nav = ui.getByRole('navigation', { name: landmark });
  return ui
    .getAllByRole('listitem')
    .filter(node => within(nav, node))
    .map(node => ui.getSemantics(node).label ?? nameOfChild(ui, node));
}

/** The link names inside one landmark, which is what Tab and Enter reach. */
function linksOf(ui: Ui, landmark: string): string[] {
  const nav = ui.getByRole('navigation', { name: landmark });
  return ui
    .getAllByRole('link')
    .filter(node => within(nav, node))
    .map(node => ui.getSemantics(node).label ?? '');
}

/** A listitem holding a link says nothing itself; the link inside it does. */
function nameOfChild(ui: Ui, listItem: UiNode): string {
  const link = ui.getAllByRole('link').find(node => within(listItem, node));
  return link === undefined ? '' : (ui.getSemantics(link).label ?? '');
}

function within(ancestor: UiNode, node: UiNode): boolean {
  for (let current: UiNode | null = node; current !== null; current = current.parent) {
    if (current === ancestor) {
      return true;
    }
  }
  return false;
}

/**
 * The page claims four things about `Breadcrumb`: that the last crumb
 * is not a link and takes no tab stop, that following a crumb cuts the
 * trail back to it, that a long trail folds its middle into one named
 * button, and that pressing the button unfolds the trail in place and
 * keeps the keyboard inside it. Each is a test here, reached the way
 * an assistive technology reaches it.
 */
describe('the docs breadcrumb example', () => {
  it('draws a named landmark for each trail, holding a list of crumbs', () => {
    const ui = mount();

    expect(ui.getByRole('navigation', { name: 'Where you are' })).toBeTruthy();
    expect(ui.getByRole('navigation', { name: 'Repository path' })).toBeTruthy();
    expect(crumbsOf(ui, 'Where you are')).toEqual(['Home', 'Projects', 'Gesso', 'Components', 'Breadcrumb']);
  });

  it('leaves the page you are on out of the links', () => {
    const ui = mount();

    expect(linksOf(ui, 'Where you are')).toEqual(['Home', 'Projects', 'Gesso', 'Components']);
    expect(ui.queryByRole('link', { name: 'Breadcrumb' })).toBeNull();
    // Read, and read as content: the listitem holding it is named by
    // the words it draws.
    expect(ui.getByRole('listitem', { name: 'Breadcrumb' })).toBeTruthy();
  });

  it('cuts the trail back to the crumb that was followed', () => {
    const ui = mount();

    ui.fireEvent.click(ui.getByRole('link', { name: 'Projects' }));
    ui.frame();

    expect(crumbsOf(ui, 'Where you are')).toEqual(['Home', 'Projects']);
    // The crumb that was followed is where you are now, so it has
    // stopped being a link.
    expect(linksOf(ui, 'Where you are')).toEqual(['Home']);
    expect(ui.getByText('You are on Projects.')).toBeTruthy();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Go deeper' }));
    ui.frame();
    expect(crumbsOf(ui, 'Where you are')).toEqual(['Home', 'Projects', 'Gesso']);
    expect(linksOf(ui, 'Where you are')).toEqual(['Home', 'Projects']);
  });

  it('answers the keyboard on the crumb that has focus', () => {
    const ui = mount();

    ui.fireEvent.focus(ui.getByRole('link', { name: 'Gesso' }));
    ui.fireEvent.press('Enter');
    ui.frame();

    expect(crumbsOf(ui, 'Where you are')).toEqual(['Home', 'Projects', 'Gesso']);
  });

  it('folds the long path into one crumb named for what it hides', () => {
    const ui = mount();

    expect(crumbsOf(ui, 'Repository path')).toEqual(['gesso', '', 'Breadcrumb.ts']);
    const fold = ui.getByRole('button', { name: 'Show 3 hidden steps' });
    expect(ui.getSemantics(fold).states).toEqual(['collapsed']);
    expect(ui.queryByText('packages')).toBeNull();
  });

  it('unfolds the path in place and keeps the keyboard inside it', () => {
    const ui = mount();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Show 3 hidden steps' }));
    ui.frame();

    expect(crumbsOf(ui, 'Repository path')).toEqual(['gesso', 'packages', 'components', 'src', 'Breadcrumb.ts']);
    expect(ui.queryByRole('button', { name: 'Show 3 hidden steps' })).toBeNull();
    // The button that was pressed is gone, so focus is on the first
    // crumb it revealed rather than back at the top of the page.
    expect(ui.querySemantics(ui.runtime.input.focus.focusedNode!)?.label).toBe('packages');

    ui.fireEvent.press('Enter');
    ui.frame();
    expect(ui.getByText('Opened packages.')).toBeTruthy();
  });
});
