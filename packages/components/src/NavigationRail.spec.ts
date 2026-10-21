import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import {
  createComponent,
  OverlayService,
  RouterService,
  type ComponentProps,
  type ShellRequest
} from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import {
  Box,
  Button,
  Column,
  IconRasterizer,
  type IconSpec,
  type UiKeyboardEvent,
  type UiNode,
  type UiSemanticsRecord
} from 'gesso-core';

import { COLLAPSED_WIDTH, NavigationRail, type NavigationItem } from './NavigationRail';

const SQUARE = 'M4 4h16v16H4z';

/**
 * A mail client's rail: destinations with and without icons, a badge, a
 * disabled row, and a group holding a group.
 */
const ITEMS: readonly NavigationItem[] = [
  { key: 'inbox', label: 'Inbox', icon: SQUARE, badge: 3, badgeLabel: '3 unread' },
  { key: 'drafts', label: 'Drafts', icon: SQUARE },
  { key: 'outbox', label: 'Outbox', icon: SQUARE, disabled: true },
  {
    key: 'labels',
    label: 'Labels',
    icon: SQUARE,
    items: [
      { key: 'work', label: 'Work' },
      { key: 'family', label: 'Family', badge: 'New' },
      { key: 'archive', label: 'Archive', items: [{ key: 'archive-2023', label: '2023' }] }
    ]
  },
  { key: 'settings', label: 'Settings', icon: SQUARE }
];

interface Mounted {
  readonly ui: Rendered;
  readonly changes: string[];
  readonly opened: (readonly string[])[];
  /** Keys that reached the box around the rail: the ones it did not spend. */
  readonly heard: string[];
}

/** The rail in a 260 by `height` box, with a button after it so Tab has somewhere to go. */
function mount(
  props: Partial<ComponentProps<typeof NavigationRail>> = {},
  options: { direction?: 'ltr' | 'rtl'; height?: number } = {}
): Mounted {
  const changes: string[] = [];
  const opened: (readonly string[])[] = [];
  const heard: string[] = [];
  const height = options.height ?? 480;
  const ui = renderTest(
    Box(
      {
        width: 300,
        height,
        textDirection: options.direction ?? 'ltr',
        x: 'start',
        y: 'stretch',
        onKeyDown: (event: UiKeyboardEvent) => heard.push(event.key)
      },
      Column(
        { y: 'stretch', height },
        createComponent(NavigationRail, {
          items: ITEMS,
          label: 'Mail',
          flexGrow: 1,
          minHeight: 0,
          onChange: (key: string) => changes.push(key),
          onExpandedChange: (next: readonly string[]) => opened.push(next),
          ...props
        }),
        Button({ text: 'After', label: 'After', focusable: true })
      )
    ),
    { width: 300, height }
  );
  ui.frame();
  return { ui, changes, opened, heard };
}

function rows(ui: Rendered): UiSemanticsRecord[] {
  return ui.getAllByRole('treeitem').map(node => ui.getSemantics(node));
}
function labels(ui: Rendered): (string | undefined)[] {
  return rows(ui).map(record => record.label);
}
function current(ui: Rendered): (string | undefined)[] {
  return rows(ui)
    .filter(record => record.states?.includes('current'))
    .map(record => record.label);
}
function row(ui: Rendered, name: string): UiNode {
  return ui.getByRole('treeitem', { name });
}
function press(ui: Rendered, key: string): void {
  ui.fireEvent.press(key);
  ui.frame();
}

describe('NavigationRail, rendering and semantics', () => {
  it('is a named navigation landmark with a tree of the open rows inside', () => {
    const { ui } = mount({ defaultValue: 'inbox' });

    expect(ui.getByRole('navigation')).toHaveSemantics({ role: 'navigation', name: 'Mail' });
    expect(ui.getByRole('tree')).toHaveSemantics({ role: 'tree', name: 'Mail' });
    // The group is shut, so what it holds has no rows.
    expect(labels(ui)).toEqual(['Inbox', 'Drafts', 'Outbox', 'Labels', 'Settings']);
    expect(rows(ui).map(record => record.level)).toEqual([1, 1, 1, 1, 1]);
    expect(rows(ui).map(record => record.posInSet)).toEqual([1, 2, 3, 4, 5]);
    expect(rows(ui).map(record => record.setSize)).toEqual([5, 5, 5, 5, 5]);
  });

  it('marks the active destination current, not selected, and a group by whether it is open', () => {
    const { ui } = mount({ defaultValue: 'inbox' });

    expect(row(ui, 'Inbox')).toHaveSemantics({ states: ['current'] });
    expect(row(ui, 'Drafts')).toHaveSemantics({ states: [] });
    expect(row(ui, 'Labels')).toHaveSemantics({ states: ['collapsed'] });
    expect(current(ui)).toEqual(['Inbox']);
  });

  it('says what a badge means after the label, and announces a disabled row rather than hiding it', () => {
    const { ui } = mount({ defaultExpanded: ['labels'] });

    expect(ui.getSemantics(row(ui, 'Inbox')).description).toBe('3 unread');
    // With no badgeLabel, the badge's own text.
    expect(ui.getSemantics(row(ui, 'Family')).description).toBe('New');
    expect(ui.getSemantics(row(ui, 'Drafts')).description).toBeUndefined();
    expect(ui.getByRole('treeitem', { name: 'Outbox', disabled: true })).toBeTruthy();
    expect(ui.textOf()).toContain('3');
  });

  it('reports a nested row’s level and its place among its own siblings', () => {
    const { ui } = mount({ defaultExpanded: ['labels', 'archive'] });

    expect(labels(ui)).toEqual([
      'Inbox',
      'Drafts',
      'Outbox',
      'Labels',
      'Work',
      'Family',
      'Archive',
      '2023',
      'Settings'
    ]);
    const archive = ui.getSemantics(row(ui, 'Archive'));
    expect([archive.level, archive.posInSet, archive.setSize]).toEqual([2, 3, 3]);
    expect(ui.getSemantics(row(ui, '2023')).level).toBe(3);
    // Indented from the start side by its level.
    expect(ui.getLayout(row(ui, '2023')).x).toBe(ui.getLayout(row(ui, 'Inbox')).x);
    const text = (name: string) => ui.getLayout(ui.getByText(name));
    expect(text('2023').x).toBeGreaterThan(text('Archive').x);
    expect(text('Archive').x).toBeGreaterThan(text('Labels').x);
  });

  it('opens groups marked defaultExpanded when the rail owns its open set', () => {
    const items: NavigationItem[] = [
      { key: 'a', label: 'Alpha', defaultExpanded: true, items: [{ key: 'a1', label: 'Alpha one' }] },
      { key: 'b', label: 'Beta', items: [{ key: 'b1', label: 'Beta one' }] }
    ];
    const { ui } = mount({ items });

    expect(labels(ui)).toEqual(['Alpha', 'Alpha one', 'Beta']);
  });

  it('draws a shut group that holds the active page in a heavier weight', () => {
    const { ui } = mount({ defaultValue: 'work' });

    expect(ui.getByText('Labels').properties.get('fontWeight')).toBe(600);
    expect(ui.getByText('Drafts').properties.get('fontWeight')).toBe(400);
  });
});

describe('NavigationRail, controlled and uncontrolled', () => {
  it('moves its own value when uncontrolled, and reports every press', () => {
    const { ui, changes } = mount({ defaultValue: 'inbox' });

    ui.fireEvent.click(row(ui, 'Drafts'));
    ui.frame();

    expect(changes).toEqual(['drafts']);
    expect(current(ui)).toEqual(['Drafts']);
  });

  it('draws only what it is handed when controlled, and follows a write', () => {
    const value = new BehaviorSubject<string | null>('inbox');
    const { ui, changes } = mount({ value });

    ui.fireEvent.click(row(ui, 'Settings'));
    ui.frame();
    // Asked for, and declined: nothing wrote it back.
    expect(changes).toEqual(['settings']);
    expect(current(ui)).toEqual(['Inbox']);

    value.next('drafts');
    ui.frame();
    expect(current(ui)).toEqual(['Drafts']);

    // Null is no active destination at all.
    value.next(null);
    ui.frame();
    expect(current(ui)).toEqual([]);
  });

  it('throws, naming itself, when given both forms', () => {
    expect(() => mount({ value: 'inbox', defaultValue: 'inbox' })).toThrow(/NavigationRail was given both 'value'/);
  });

  it('leaves a controlled open set to its owner', () => {
    const expanded = new BehaviorSubject<readonly string[]>([]);
    const { ui, opened } = mount({ expanded });

    ui.fireEvent.click(row(ui, 'Labels'));
    ui.frame();
    expect(opened).toEqual([['labels']]);
    expect(labels(ui)).not.toContain('Work');

    expanded.next(['labels']);
    ui.frame();
    expect(labels(ui)).toContain('Work');
    expect(row(ui, 'Labels')).toHaveSemantics({ states: ['expanded'] });
  });
});

describe('NavigationRail, pointer', () => {
  it('opens and closes a group on a press, which never becomes the value', () => {
    const { ui, changes, opened } = mount({ defaultValue: 'inbox' });

    ui.fireEvent.click(row(ui, 'Labels'));
    ui.frame();
    expect(labels(ui)).toContain('Work');
    ui.fireEvent.click(row(ui, 'Labels'));
    ui.frame();
    expect(labels(ui)).not.toContain('Work');

    expect(opened).toEqual([['labels'], []]);
    expect(changes).toEqual([]);
    expect(current(ui)).toEqual(['Inbox']);
  });

  it('ignores a press on a disabled row', () => {
    const { ui, changes } = mount({ defaultValue: 'inbox' });

    ui.fireEvent.click(row(ui, 'Outbox'));
    ui.frame();

    expect(changes).toEqual([]);
    expect(current(ui)).toEqual(['Inbox']);
  });
});

describe('NavigationRail, keyboard', () => {
  it('is one tab stop, on the active destination', () => {
    const { ui } = mount({ defaultValue: 'drafts' });

    ui.fireEvent.tab();
    ui.frame();
    expect(row(ui, 'Drafts')).toHaveFocus();

    // The next Tab leaves the rail rather than walking its rows.
    ui.fireEvent.tab();
    ui.frame();
    expect(ui.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('starts on the first row with nothing active, and comes back to where it was left', () => {
    const { ui } = mount();

    ui.fireEvent.tab();
    ui.frame();
    expect(row(ui, 'Inbox')).toHaveFocus();
    press(ui, 'ArrowDown');
    ui.fireEvent.tab();
    ui.frame();
    ui.fireEvent.shiftTab();
    ui.frame();
    expect(row(ui, 'Drafts')).toHaveFocus();
  });

  it('moves focus with the arrows and leaves the value alone until Enter or Space', () => {
    const { ui, changes } = mount({ defaultValue: 'inbox' });
    ui.fireEvent.tab();
    ui.frame();

    press(ui, 'ArrowDown');
    expect(row(ui, 'Drafts')).toHaveFocus();
    // Outbox is disabled, and the arrows step over it.
    press(ui, 'ArrowDown');
    expect(row(ui, 'Labels')).toHaveFocus();
    press(ui, 'ArrowUp');
    expect(row(ui, 'Drafts')).toHaveFocus();
    expect(changes).toEqual([]);
    expect(current(ui)).toEqual(['Inbox']);

    press(ui, 'Enter');
    expect(changes).toEqual(['drafts']);
    expect(current(ui)).toEqual(['Drafts']);

    press(ui, 'End');
    expect(row(ui, 'Settings')).toHaveFocus();
    press(ui, ' ');
    expect(changes).toEqual(['drafts', 'settings']);
  });

  it('clamps at the ends rather than wrapping', () => {
    const { ui } = mount({ defaultValue: 'inbox' });
    ui.fireEvent.tab();
    ui.frame();

    press(ui, 'ArrowUp');
    expect(row(ui, 'Inbox')).toHaveFocus();
    press(ui, 'End');
    press(ui, 'ArrowDown');
    expect(row(ui, 'Settings')).toHaveFocus();
    press(ui, 'Home');
    expect(row(ui, 'Inbox')).toHaveFocus();
  });

  it('opens a group with Right, steps into it with Right, and comes back out with Left', () => {
    const { ui, opened } = mount({ defaultValue: 'inbox' });
    ui.fireEvent.focus(row(ui, 'Labels'));
    ui.frame();

    press(ui, 'ArrowRight');
    expect(labels(ui)).toContain('Work');
    // Focus stays on the group's row through the rows arriving under it.
    expect(row(ui, 'Labels')).toHaveFocus();

    press(ui, 'ArrowRight');
    expect(row(ui, 'Work')).toHaveFocus();
    // On a destination, Right does nothing.
    press(ui, 'ArrowRight');
    expect(row(ui, 'Work')).toHaveFocus();

    press(ui, 'ArrowLeft');
    expect(row(ui, 'Labels')).toHaveFocus();
    press(ui, 'ArrowLeft');
    expect(labels(ui)).not.toContain('Work');
    expect(opened).toEqual([['labels'], []]);
  });

  it('opens and closes a group with Enter, as a press does', () => {
    const { ui, changes } = mount();
    ui.fireEvent.focus(row(ui, 'Labels'));
    ui.frame();

    press(ui, 'Enter');
    expect(row(ui, 'Labels')).toHaveSemantics({ states: ['expanded'] });
    press(ui, ' ');
    expect(row(ui, 'Labels')).toHaveSemantics({ states: ['collapsed'] });
    expect(changes).toEqual([]);
  });

  it('jumps to the next row starting with a typed letter, and leaves other letters alone', () => {
    const { ui, heard } = mount({ defaultExpanded: ['labels'] });
    ui.fireEvent.focus(row(ui, 'Inbox'));
    ui.frame();

    press(ui, 's');
    expect(row(ui, 'Settings')).toHaveFocus();
    // Wraps, and is not case sensitive.
    press(ui, 'D');
    expect(row(ui, 'Drafts')).toHaveFocus();
    // Outbox is disabled, so O finds nothing, and the key goes on up to
    // the application rather than being spent on nothing.
    press(ui, 'o');
    expect(row(ui, 'Drafts')).toHaveFocus();
    expect(heard).toEqual(['o']);
  });

  it('keeps the Tab stop on a visible row when the one it was on is closed away', () => {
    const { ui } = mount({ defaultExpanded: ['labels'] });
    ui.fireEvent.focus(row(ui, 'Work'));
    ui.frame();
    ui.fireEvent.blur();
    ui.frame();

    ui.fireEvent.click(row(ui, 'Labels'));
    ui.frame();
    expect(labels(ui)).not.toContain('Work');
    ui.fireEvent.blur();
    ui.fireEvent.tab();
    ui.frame();
    // Work is gone, so the stop fell back to the first row rather than
    // to nothing, which would have taken the rail out of the Tab order.
    expect(row(ui, 'Inbox')).toHaveFocus();
  });
});

describe('NavigationRail, right to left', () => {
  it('opens a group with Left and closes it with Right', () => {
    const { ui, opened } = mount({}, { direction: 'rtl' });
    ui.fireEvent.focus(row(ui, 'Labels'));
    ui.frame();

    press(ui, 'ArrowLeft');
    expect(opened).toEqual([['labels']]);
    press(ui, 'ArrowLeft');
    expect(row(ui, 'Work')).toHaveFocus();
    press(ui, 'ArrowRight');
    expect(row(ui, 'Labels')).toHaveFocus();
    press(ui, 'ArrowRight');
    expect(opened).toEqual([['labels'], []]);
  });

  it('indents from the right and puts the badge at the left end', () => {
    const { ui } = mount({ defaultExpanded: ['labels'] }, { direction: 'rtl' });
    const text = (name: string) => ui.getLayout(ui.getByText(name));

    // A nested label ends further from the right edge than a top one.
    expect(text('Work').x + text('Work').width).toBeLessThan(text('Labels').x + text('Labels').width);
    // The badge's figure sits to the left of its label.
    expect(text('3').x).toBeLessThan(text('Inbox').x);
  });
});

describe('NavigationRail, collapsed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws icons only, at the collapsed width, and keeps every label as the accessible name', () => {
    const { ui } = mount({ collapsed: true, defaultValue: 'inbox' });

    expect(ui.getLayout(ui.getByRole('navigation')).width).toBe(COLLAPSED_WIDTH);
    expect(ui.queryByText('Inbox')).toBeNull();
    expect(ui.queryByText('Drafts')).toBeNull();
    expect(labels(ui)).toEqual(['Inbox', 'Drafts', 'Outbox', 'Labels', 'Settings']);
    expect(row(ui, 'Inbox')).toHaveSemantics({ states: ['current'] });
  });

  it('draws a row with no icon as its first letter', () => {
    const { ui } = mount({ collapsed: true, defaultExpanded: ['labels'] });

    expect(ui.getByText('W')).toBeTruthy();
    expect(ui.getByText('F')).toBeTruthy();
  });

  it('shows the label as a tooltip on keyboard focus, and not while expanded', () => {
    const collapsed = new BehaviorSubject(true);
    const { ui } = mount({ collapsed, defaultValue: 'inbox' });
    const entries = () => ui.runtime.services.get(OverlayService).entries.value;

    ui.fireEvent.tab();
    ui.frame();
    expect(entries()).toHaveLength(1);
    press(ui, 'ArrowDown');
    expect(entries()).toHaveLength(1);
    expect(ui.getAllByRole('tooltip').map(node => ui.getSemantics(node).label)).toEqual(['Drafts']);

    collapsed.next(false);
    ui.frame();
    press(ui, 'ArrowUp');
    expect(entries()).toHaveLength(0);
    expect(ui.getByText('Inbox')).toBeTruthy();
    expect(ui.getLayout(ui.getByRole('navigation')).width).toBe(240);
  });
});

describe('NavigationRail, collapsed under right to left', () => {
  it('opens its labels toward the content, which is to its left', () => {
    // A rail reading right to left sits at the right of what it serves,
    // so its labels belong on its left. Asked for the right side, they
    // went over whatever is beyond the rail whenever there was room
    // there, and only came back when the window's edge flipped them.
    const ui = renderTest(
      Box(
        { width: 600, height: 400, x: 'start', y: 'stretch' },
        Box(
          { width: 300, height: 400, textDirection: 'rtl', x: 'start', y: 'stretch' },
          createComponent(NavigationRail, { items: ITEMS, label: 'Mail', collapsed: true, defaultValue: 'inbox' })
        )
      ),
      { width: 600, height: 400 }
    );
    ui.fireEvent.tab();
    ui.frame();
    const tip = ui.getLayout(ui.getAllByRole('tooltip')[0]);
    const focused = ui.getLayout(row(ui, 'Inbox'));
    expect(tip.x + tip.width).toBeLessThanOrEqual(focused.x);
  });
});

describe('NavigationRail, scrolling', () => {
  const MANY: NavigationItem[] = Array.from({ length: 40 }, (_, at) => ({
    key: `page-${at + 1}`,
    label: `Page ${at + 1}`
  }));

  it('scrolls the active destination into view when the value moves to it', () => {
    const value = new BehaviorSubject<string | null>('page-1');
    const { ui } = mount({ items: MANY, value }, { height: 200 });
    const tree = ui.getVisibleBox(ui.getByRole('tree'));

    expect(ui.getVisibleBox(row(ui, 'Page 1')).y).toBeGreaterThanOrEqual(tree.y);

    value.next('page-38');
    ui.frame();
    const shown = ui.getVisibleBox(row(ui, 'Page 38'));
    expect(shown.y).toBeGreaterThanOrEqual(tree.y);
    expect(shown.y + shown.height).toBeLessThanOrEqual(tree.y + tree.height);
  });

  it('starts scrolled to an active destination far down the list', () => {
    const { ui } = mount({ items: MANY, defaultValue: 'page-30' }, { height: 200 });
    ui.frame();
    const tree = ui.getVisibleBox(ui.getByRole('tree'));
    const shown = ui.getVisibleBox(row(ui, 'Page 30'));

    expect(shown.y + shown.height).toBeLessThanOrEqual(tree.y + tree.height);
  });

  it('follows keyboard focus down a list taller than its box', () => {
    const { ui } = mount({ items: MANY }, { height: 200 });
    ui.fireEvent.tab();
    ui.frame();

    press(ui, 'End');
    const tree = ui.getVisibleBox(ui.getByRole('tree'));
    const shown = ui.getVisibleBox(row(ui, 'Page 40'));
    expect(row(ui, 'Page 40')).toHaveFocus();
    expect(shown.y + shown.height).toBeLessThanOrEqual(tree.y + tree.height);
  });
});

describe('NavigationRail, rows', () => {
  it('cuts a long label with an ellipsis inside a narrow rail rather than widening it', () => {
    const items: NavigationItem[] = [
      { key: 'long', label: 'Quarterly reports for every region, reviewed and approved', icon: SQUARE }
    ];
    const { ui } = mount({ items, width: 160 });

    expect(ui.getLayout(ui.getByRole('navigation')).width).toBe(160);
    const label = ui.getLayout(ui.getByText(/Quarterly/));
    expect(label.x + label.width).toBeLessThanOrEqual(160);
  });

  it('keeps an icon-less row’s label in line with its neighbours’', () => {
    const items: NavigationItem[] = [
      { key: 'a', label: 'With icon', icon: SQUARE },
      { key: 'b', label: 'Without' }
    ];
    const { ui } = mount({ items });

    expect(ui.getLayout(ui.getByText('Without')).x).toBe(ui.getLayout(ui.getByText('With icon')).x);
  });

  it('still draws when it has nothing in it, and the keys do nothing', () => {
    const { ui } = mount({ items: [] });

    expect(ui.getByRole('navigation')).toBeTruthy();
    expect(ui.queryByRole('treeitem')).toBeNull();
    ui.fireEvent.tab();
    ui.frame();
    expect(ui.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('keeps a long label off the badge', () => {
    const items: NavigationItem[] = [{ key: 'x', label: 'A very long destination name indeed', badge: 120 }];
    const { ui } = mount({ items, width: 180 });
    const label = ui.getLayout(ui.getByText(/A very long/));
    const badge = ui.getLayout(ui.getByText('99+'));

    expect(label.x + label.width).toBeLessThanOrEqual(badge.x);
  });
});

/** A press of the middle button alone, through the pointer controller, released where it landed. */
function middleClick(ui: Rendered, node: UiNode): void {
  const box = ui.getLayout(node);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  ui.fireEvent.pointerDown(x, y, { buttons: 4 });
  ui.fireEvent.pointerUp(x, y);
  ui.frame();
}

describe('NavigationRail, opening a destination somewhere new', () => {
  it('reports a Cmd-click, a Ctrl-click and a middle click apart from onChange, and leaves the value alone', () => {
    const elsewhere: string[] = [];
    const { ui, changes } = mount({ defaultValue: 'inbox', onOpenElsewhere: key => elsewhere.push(key) });

    ui.fireEvent.click(row(ui, 'Drafts'), { modifiers: { meta: true } });
    ui.fireEvent.click(row(ui, 'Settings'), { modifiers: { ctrl: true } });
    middleClick(ui, row(ui, 'Drafts'));
    ui.frame();

    expect(elsewhere).toEqual(['drafts', 'settings', 'drafts']);
    expect(changes).toEqual([]);
    expect(current(ui)).toEqual(['Inbox']);

    // The middle press is forgotten: the next plain click is a plain one.
    ui.fireEvent.click(row(ui, 'Drafts'));
    ui.frame();
    expect(changes).toEqual(['drafts']);
    expect(elsewhere).toHaveLength(3);
  });

  it('opens the focused destination somewhere new on Cmd-Enter or Ctrl-Enter', () => {
    const elsewhere: string[] = [];
    const { ui, changes } = mount({ defaultValue: 'inbox', onOpenElsewhere: key => elsewhere.push(key) });
    ui.fireEvent.focus(row(ui, 'Drafts'));
    ui.frame();

    ui.fireEvent.press('Enter', { meta: true });
    ui.fireEvent.press('Enter', { ctrl: true });
    ui.frame();
    expect(elsewhere).toEqual(['drafts', 'drafts']);
    expect(changes).toEqual([]);
    expect(current(ui)).toEqual(['Inbox']);
  });

  it('treats a modified press as a plain one when nothing asked to hear about it', () => {
    const { ui, changes } = mount({ defaultValue: 'inbox' });

    ui.fireEvent.click(row(ui, 'Drafts'), { modifiers: { meta: true } });
    ui.frame();
    ui.fireEvent.focus(row(ui, 'Settings'));
    ui.fireEvent.press('Enter', { ctrl: true });
    ui.frame();

    expect(changes).toEqual(['drafts', 'settings']);
  });

  it('opens or closes a group on a modified press, and ignores one on a disabled row', () => {
    const elsewhere: string[] = [];
    const { ui, changes, opened } = mount({ onOpenElsewhere: key => elsewhere.push(key) });

    ui.fireEvent.click(row(ui, 'Labels'), { modifiers: { meta: true } });
    ui.fireEvent.click(row(ui, 'Outbox'), { modifiers: { meta: true } });
    ui.frame();

    expect(opened).toEqual([['labels']]);
    expect(elsewhere).toEqual([]);
    expect(changes).toEqual([]);
  });

  it('follows a destination’s `to` in place on a plain press, and through the shell on a modified one', () => {
    const items: NavigationItem[] = [
      { key: 'inbox', label: 'Inbox', to: '/inbox' },
      { key: 'drafts', label: 'Drafts', to: '/drafts?sort=new' }
    ];
    const { ui, changes } = mount({ items, defaultValue: 'inbox' });
    const requests: ShellRequest[] = [];
    ui.runtime.onShellRequest(request => requests.push(request));
    const router = ui.runtime.services.get(RouterService);
    const opens = () => requests.filter(request => request.type === 'openRoute');

    ui.fireEvent.click(row(ui, 'Drafts'), { modifiers: { meta: true } });
    ui.frame();
    // Somewhere new, with nothing moved here.
    expect(opens()).toEqual([{ type: 'openRoute', url: '/drafts?sort=new' }]);
    expect(router.url.value).toBe('/');
    expect(changes).toEqual([]);
    expect(current(ui)).toEqual(['Inbox']);

    ui.fireEvent.click(row(ui, 'Drafts'));
    ui.frame();
    expect(changes).toEqual(['drafts']);
    expect(router.url.value).toBe('/drafts?sort=new');
    expect(opens()).toHaveLength(1);
  });
});

describe('NavigationRail, a disabled group', () => {
  const LOCKED: readonly NavigationItem[] = [
    { key: 'inbox', label: 'Inbox' },
    {
      key: 'labels',
      label: 'Labels',
      disabled: true,
      items: [
        { key: 'work', label: 'Work' },
        { key: 'family', label: 'Family' }
      ]
    },
    { key: 'shut', label: 'Shut', disabled: true, items: [{ key: 'inside', label: 'Inside' }] },
    { key: 'settings', label: 'Settings' }
  ];

  it('announces the group and everything in it as disabled, and draws them so', () => {
    const { ui } = mount({ items: LOCKED, defaultExpanded: ['labels'] });

    expect(ui.getByRole('treeitem', { name: 'Labels', disabled: true })).toBeTruthy();
    expect(ui.getByRole('treeitem', { name: 'Work', disabled: true })).toBeTruthy();
    expect(ui.getByRole('treeitem', { name: 'Family', disabled: true })).toBeTruthy();
    expect(ui.getByRole('treeitem', { name: 'Inbox' })).not.toHaveSemantics({ disabled: true });
    // Still says whether it is open: a disabled group is not a hidden one.
    expect(row(ui, 'Labels')).toHaveSemantics({ states: ['expanded'] });
    expect(ui.getByText('Labels').properties.get('color')).toBe('controlForegroundDisabled');
    expect(ui.getByText('Work').properties.get('color')).toBe('controlForegroundDisabled');
    expect(ui.getByText('Inbox').properties.get('color')).toBe('controlForeground');
  });

  it('neither opens nor closes on a press, and ignores a press on a row inside it', () => {
    const { ui, changes, opened } = mount({ items: LOCKED, defaultExpanded: ['labels'] });

    ui.fireEvent.click(row(ui, 'Shut'));
    ui.fireEvent.click(row(ui, 'Labels'));
    ui.fireEvent.click(row(ui, 'Work'));
    ui.frame();

    expect(opened).toEqual([]);
    expect(changes).toEqual([]);
    expect(labels(ui)).toEqual(['Inbox', 'Labels', 'Work', 'Family', 'Shut', 'Settings']);
  });

  it('is skipped by the arrows and by type-ahead, with what it holds', () => {
    const { ui, heard } = mount({ items: LOCKED, defaultExpanded: ['labels'] });
    ui.fireEvent.tab();
    ui.frame();
    expect(row(ui, 'Inbox')).toHaveFocus();

    press(ui, 'ArrowDown');
    expect(row(ui, 'Settings')).toHaveFocus();
    press(ui, 'w');
    expect(row(ui, 'Settings')).toHaveFocus();
    expect(heard).toEqual(['w']);
    press(ui, 'ArrowUp');
    expect(row(ui, 'Inbox')).toHaveFocus();
  });
});

describe('NavigationRail, icons', () => {
  let drawn: IconSpec[] = [];
  beforeEach(() => {
    drawn = [];
    vi.spyOn(IconRasterizer.prototype, 'raster').mockImplementation((spec: IconSpec) => {
      drawn.push(spec);
      return new Promise(() => {});
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const STROKE = 'M4 6h16M4 12h16M4 18h16';
  const CIRCLE = 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z';
  const DOT = 'M12 11a1 1 0 1 0 0 2 1 1 0 1 0 0-2z';
  const OUTLINED: readonly NavigationItem[] = [
    { key: 'filled', label: 'Filled', icon: SQUARE },
    { key: 'outline', label: 'Outline', icon: { path: STROKE, style: 'stroke', strokeWidth: 1.5 } },
    { key: 'two', label: 'Two', icon: { path: [CIRCLE, DOT], style: 'stroke' } },
    {
      key: 'group',
      label: 'Group',
      icon: { path: SQUARE, fillRule: 'evenodd' },
      items: [{ key: 'inside', label: 'Inside' }]
    }
  ];
  // The rows' icons are 18 square; the group's arrow is drawn through
  // `Icon` too, smaller, and is not what these specs are about.
  const summary = () =>
    drawn
      .filter(spec => spec.size === 18)
      .map(spec => [spec.path, spec.style, spec.strokeWidth, spec.fillRule ?? 'nonzero']);

  it('fills a string icon exactly as before', () => {
    mount({ items: [{ key: 'a', label: 'A', icon: SQUARE }] });

    expect(summary()).toEqual([[SQUARE, 'fill', 2, 'nonzero']]);
  });

  it('strokes an outline icon, draws each of several paths, and passes a fill rule through', () => {
    mount({ items: OUTLINED });

    expect(summary()).toEqual([
      [SQUARE, 'fill', 2, 'nonzero'],
      [STROKE, 'stroke', 1.5, 'nonzero'],
      [CIRCLE, 'stroke', 2, 'nonzero'],
      [DOT, 'stroke', 2, 'nonzero'],
      [SQUARE, 'fill', 2, 'evenodd']
    ]);
  });

  it('draws the same glyphs in a collapsed rail', () => {
    const { ui } = mount({ items: OUTLINED, collapsed: true });

    expect(summary().map(([path, style]) => [path, style])).toEqual([
      [SQUARE, 'fill'],
      [STROKE, 'stroke'],
      [CIRCLE, 'stroke'],
      [DOT, 'stroke'],
      [SQUARE, 'fill']
    ]);
    // An outline icon is an icon: no monogram stands in for it.
    expect(ui.queryByText('O')).toBeNull();
    expect(ui.queryByText('T')).toBeNull();
  });
});
