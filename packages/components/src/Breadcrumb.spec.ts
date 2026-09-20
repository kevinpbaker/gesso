import { describe, expect, it, vi } from 'vitest';

import { createComponent, internalState, type ComponentProps } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Column, type UiChild } from 'gesso-core';

import { Breadcrumb, type BreadcrumbItem } from './Breadcrumb';

/**
 * A trail at the top of a page, at its own size. A root fills the
 * window, so a breadcrumb mounted bare would be centred in 600 pixels
 * of nothing and every box assertion would be about the window.
 */
function mount(props: ComponentProps<typeof Breadcrumb>) {
  const trail: UiChild = createComponent(Breadcrumb, props);
  return renderTest(Column({ padding: 8, x: 'start', y: 'start', width: 640, height: 120 }, trail), {
    width: 640,
    height: 120
  });
}

function trail(...labels: readonly string[]): BreadcrumbItem[] {
  return labels.map(label => ({ value: label.toLowerCase(), label }));
}

const SITE = trail('Home', 'Projects', 'Gesso', 'Components', 'Breadcrumb');

describe('Breadcrumb: the last crumb', () => {
  it('is not a link, is not focusable, and never reports a selection', () => {
    const onSelect = vi.fn();
    const ui = mount({ items: trail('Home', 'Projects', 'Build'), onSelect });

    // Two links for three crumbs: the one you are on is not one.
    expect(ui.getAllByRole('link').map(node => ui.getSemantics(node).label)).toEqual(['Home', 'Projects']);
    expect(ui.queryByRole('link', { name: 'Build' })).toBeNull();

    // It is still read, as the content it is: the listitem holding it
    // is named by the words it draws.
    expect(ui.getByRole('listitem', { name: 'Build' })).toBeTruthy();
    expect(ui.getByText('Build').properties.get('focusable')).toBeUndefined();

    // Tab reaches every crumb but that one, so nobody spends a stop on
    // a control that could only take them where they already are.
    const stops: (string | undefined)[] = [];
    for (let at = 0; at < 3; at += 1) {
      ui.fireEvent.tab();
      stops.push(ui.querySemantics(ui.runtime.input.focus.focusedNode!)?.label);
    }
    expect(stops).toEqual(['Home', 'Projects', 'Home']);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('is heavier than the crumbs before it, which is a difference that is not colour', () => {
    const ui = mount({ items: trail('Home', 'Build') });

    const current = ui.getByText('Build');
    const before = ui.getByText('Home');
    expect(current.properties.get('fontWeight')).toBe(600);
    expect(before.properties.get('fontWeight')).toBeUndefined();
    // Not colour alone: both are the same token.
    expect(current.properties.get('color')).toBe('controlForeground');
    expect(before.properties.get('color')).toBe('controlForeground');
  });

  it('reports every other crumb, by value, on a click and on a key', () => {
    const onSelect = vi.fn();
    const ui = mount({ items: trail('Home', 'Projects', 'Build'), onSelect });

    ui.fireEvent.click(ui.getByRole('link', { name: 'Projects' }));
    expect(onSelect).toHaveBeenLastCalledWith('projects');

    // Enter and Space both press a focused link, because the runtime
    // presses anything whose role is `link` or `button`; the component
    // binds neither key and so has one activation path, not three.
    ui.fireEvent.focus(ui.getByRole('link', { name: 'Home' }));
    ui.fireEvent.press('Enter');
    expect(onSelect).toHaveBeenLastCalledWith('home');
    ui.fireEvent.press(' ');
    expect(onSelect).toHaveBeenLastCalledWith('home');
    expect(onSelect).toHaveBeenCalledTimes(3);
  });
});

describe('Breadcrumb: what it declares', () => {
  it('is a named landmark holding a list of the crumbs', () => {
    const ui = mount({ items: trail('Home', 'Projects', 'Build') });

    expect(ui.getByRole('navigation')).toHaveSemantics({ role: 'navigation', name: 'Breadcrumb' });
    expect(ui.getByRole('list')).toBeTruthy();
    expect(ui.getAllByRole('listitem')).toHaveLength(3);

    // A landmark with a name of the caller's, for a page with more
    // than one navigation on it.
    const named = mount({ items: trail('Home', 'Build'), label: 'You are here' });
    expect(named.getByRole('navigation')).toHaveSemantics({ role: 'navigation', name: 'You are here' });
  });

  it('names each crumb once, because a link is not named by a label here', () => {
    const ui = mount({ items: trail('Home', 'Projects', 'Build') });

    const link = ui.getByRole('link', { name: 'Home' });
    expect(ui.getSemantics(link).label).toBe('Home');
    // The text inside it is claimed as the link's name rather than
    // being a record of its own: `link` is not a role whose children
    // the tree makes presentational, so a `label` here would put
    // "Home" on the tree twice.
    expect(ui.querySemantics(ui.getByText('Home'))).toBeNull();
  });

  it('says where in the whole trail each crumb is, even when the middle is folded away', () => {
    const ui = mount({ items: SITE, maxItems: 3 });

    const positions = ui.getAllByRole('listitem').map(node => {
      const record = ui.getSemantics(node);
      return [record.posInSet, record.setSize];
    });
    // First, the fold, last: the fold stands for several and so claims
    // no position, and the two real crumbs carry their real ones. That
    // is how "5 of 5" says the last crumb is the end of the trail.
    expect(positions).toEqual([
      [1, 5],
      [undefined, undefined],
      [5, 5]
    ]);
  });

  it('keeps the separators out of the reading, while still drawing them', () => {
    const ui = mount({ items: trail('Home', 'Projects', 'Build'), separator: '>' });

    const marks = ui.getAllByText('>');
    expect(marks).toHaveLength(2);
    // Drawn, and muted, and never after the last crumb.
    expect(marks[0].properties.get('color')).toBe('textMuted');
    // Nameless furniture: "Home greater-than Projects" is not a
    // reading anyone wants, so the mark declares a separator with an
    // empty name and claims its own glyph.
    expect(ui.getSemantics(marks[0])).toMatchObject({ role: 'separator', label: '' });
    expect(ui.getAllByRole('separator')).toHaveLength(2);
    // And the crumbs' own names are not polluted by the mark beside
    // them: the listitem holding a link says nothing of its own.
    expect(ui.getSemantics(ui.getAllByRole('listitem')[0]).label).toBeUndefined();
  });

  it('turns a link into the page you are on without inheriting the mark that followed it', () => {
    const items = internalState<readonly BreadcrumbItem[]>(trail('Home', 'Projects', 'Build'));
    const ui = mount({ items });

    // Walking back up: "Projects" stops being a link and becomes the
    // page you are on, in a listitem that already held a link and a
    // separator. Unkeyed, the new crumb reconciled against whichever
    // node last held that position and kept its properties, which
    // announced the page you were on as a nameless separator.
    items.value = trail('Home', 'Projects');
    ui.frame();

    expect(ui.getByRole('listitem', { name: 'Projects' })).toBeTruthy();
    expect(ui.queryByRole('link', { name: 'Projects' })).toBeNull();
    expect(ui.getAllByRole('separator')).toHaveLength(1);
    expect(ui.getByText('Projects').properties.get('role')).toBeUndefined();
  });

  it('follows the trail as the caller navigates, rather than reading it once', () => {
    const items = internalState<readonly BreadcrumbItem[]>(trail('Home', 'Projects', 'Build'));
    const ui = mount({ items });

    expect(ui.getAllByRole('link')).toHaveLength(2);

    items.value = trail('Home', 'Settings');
    ui.frame();

    expect(ui.getAllByRole('link').map(node => ui.getSemantics(node).label)).toEqual(['Home']);
    expect(ui.getByRole('listitem', { name: 'Settings' })).toBeTruthy();
    expect(ui.queryByText('Projects')).toBeNull();
  });
});

describe('Breadcrumb: collapsing', () => {
  it('folds the middle and keeps the root and where you are', () => {
    const ui = mount({ items: SITE, maxItems: 3 });

    expect(ui.getAllByRole('listitem')).toHaveLength(3);
    expect(ui.getByRole('link', { name: 'Home' })).toBeTruthy();
    expect(ui.getByRole('listitem', { name: 'Breadcrumb' })).toBeTruthy();
    expect(ui.queryByText('Gesso')).toBeNull();
    // Named for the count it stands for: "…" is three full stops to a
    // screen reader.
    expect(ui.getByRole('button')).toHaveSemantics({ role: 'button', name: 'Show 3 hidden steps' });
    expect(ui.getSemantics(ui.getByRole('button')).states).toEqual(['collapsed']);
  });

  it('counts the hidden crumbs in the singular when there is one', () => {
    const ui = mount({ items: trail('Home', 'Projects', 'Build'), maxItems: 2 });

    expect(ui.getByRole('button')).toHaveSemantics({ role: 'button', name: 'Show 1 hidden step' });
  });

  it('never collapses by default, however long the trail is', () => {
    const ui = mount({ items: SITE });

    expect(ui.getAllByRole('listitem')).toHaveLength(5);
    expect(ui.queryByRole('button')).toBeNull();
  });

  it('expands in place, and puts the keyboard on the first crumb it revealed', () => {
    const ui = mount({ items: SITE, maxItems: 3 });

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    expect(ui.getAllByRole('listitem')).toHaveLength(5);
    expect(ui.queryByRole('button')).toBeNull();
    // The button that was pressed no longer exists. Without moving
    // focus the keyboard would be back at the top of the document,
    // which is worse than not having expanded.
    expect(ui.querySemantics(ui.runtime.input.focus.focusedNode!)?.label).toBe('Projects');
  });

  it('collapses again when the trail changes, because that is a different question', () => {
    const items = internalState<readonly BreadcrumbItem[]>(SITE);
    const ui = mount({ items, maxItems: 3 });

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();
    expect(ui.getAllByRole('listitem')).toHaveLength(5);

    items.value = trail('Home', 'Projects', 'Gesso', 'Components', 'Chip');
    ui.frame();

    // A breadcrumb is rebuilt on every navigation, and the last page's
    // "show me the middle" is not an answer about this page's trail.
    expect(ui.getAllByRole('listitem')).toHaveLength(3);
    expect(ui.getByRole('button')).toHaveSemantics({ role: 'button', name: 'Show 3 hidden steps' });
  });

  it('draws no fold when there is nothing between the ends to fold', () => {
    // `maxItems` below 3 asks for a trail shorter than the collapsed
    // form, which is itself three crumbs. It collapses as far as it
    // can and never draws a mark standing for no crumbs.
    const two = mount({ items: trail('Home', 'Build'), maxItems: 1 });
    expect(two.queryByRole('button')).toBeNull();
    expect(two.getAllByRole('listitem')).toHaveLength(2);

    const three = mount({ items: trail('Home', 'Projects', 'Build'), maxItems: 1 });
    expect(three.getAllByRole('listitem')).toHaveLength(3);
    expect(three.getByRole('button')).toHaveSemantics({ role: 'button', name: 'Show 1 hidden step' });
  });
});

describe('Breadcrumb: the ends of the range', () => {
  it('is not a landmark at all when there is no trail', () => {
    const ui = mount({ items: [] });

    // A `navigation` landmark with nothing in it is one more entry in
    // a reader's landmark list that leads nowhere.
    expect(ui.queryByRole('navigation')).toBeNull();
    expect(ui.queryByRole('list')).toBeNull();
  });

  it('draws one crumb as the page you are on, with nothing to follow', () => {
    const onSelect = vi.fn();
    const ui = mount({ items: trail('Home'), onSelect });

    expect(ui.getByRole('navigation')).toBeTruthy();
    expect(ui.queryByRole('link')).toBeNull();
    expect(ui.getByRole('listitem', { name: 'Home' })).toBeTruthy();
    // One crumb, so no separator is drawn after it.
    expect(ui.queryByRole('separator')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('passes the caller its layout props and its root modifiers', () => {
    const ui = mount({ items: trail('Home', 'Build'), marginLeft: 6 });

    expect(ui.getByRole('navigation').properties.get('marginLeft')).toBe(6);
  });
});
