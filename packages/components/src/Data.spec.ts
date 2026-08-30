import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, type GessoRuntime } from '@gesso/framework';
import { mountRuntime } from '@gesso/framework/testing';
import {
  Box,
  Text,
  UiEnvironmentKeys,
  darkTheme,
  type UiNode,
  UiNodeType,
  UiEventType,
  UiPointerEvent,
  noKeyModifiers,
  type UiSemanticsRecord,
  fr
} from '@gesso/core';
import { DataTable } from './DataTable';
import { LazyList } from './LazyList';
import { Tree, type TreeNode } from './Tree';

/** Every node under the root, in document order. */
function nodes(runtime: GessoRuntime): UiNode[] {
  const result: UiNode[] = [];
  const visit = (node: UiNode): void => {
    result.push(node);
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(runtime.layoutRoot());
  return result;
}

function byRole(runtime: GessoRuntime, role: string): UiNode[] {
  return nodes(runtime).filter(candidate => candidate.properties.get('role') === role);
}

function records(runtime: GessoRuntime, role: string): UiSemanticsRecord[] {
  return [...runtime.semanticsTree().values()].filter(record => record.role === role);
}

/** The text a node and its descendants draw, in order. */
function textOf(node: UiNode): string[] {
  const out: string[] = [];
  const visit = (current: UiNode): void => {
    const text = current.properties.get('text');
    if (typeof text === 'string' && text.length > 0) {
      out.push(text);
    }
    for (let child = current.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(node);
  return out;
}

function mount(root: Parameters<typeof mountRuntime>[0]) {
  const mounted = mountRuntime(root, { width: 400, height: 300 });
  mounted.frame(0);
  const { runtime } = mounted;
  return {
    ...mounted,
    press: (key: string) => runtime.input.keyboard.keyDown(key),
    click: (node: UiNode) => runtime.input.dispatcher.dispatch(new UiPointerEvent(UiEventType.Click, 0, 0), node),
    wheel: (dy: number) => runtime.input.wheel.wheel(10, 10, 0, dy, noKeyModifiers())
  };
}

interface Person {
  readonly name: string;
  readonly age: number;
}

const PEOPLE: readonly Person[] = [
  { name: 'Ravi', age: 41 },
  { name: 'Ana', age: 27 },
  { name: 'Mikael', age: 34 }
];

const COLUMNS = [
  {
    key: 'name',
    header: 'Name',
    width: fr(1),
    compare: (a: Person, b: Person) => a.name.localeCompare(b.name),
    cell: (person: Person) => Text({ text: person.name })
  },
  {
    key: 'age',
    header: 'Age',
    width: 60,
    compare: (a: Person, b: Person) => a.age - b.age,
    cell: (person: Person) => Text({ text: String(person.age) })
  }
];

describe('LazyList', () => {
  it('says where a mounted row sits in the whole list, not in the mounted window', () => {
    const { runtime } = mount(
      createComponent(LazyList, {
        label: 'Files',
        count: 100000,
        height: 100,
        estimatedItemExtent: 20,
        item: (index: number) => Text({ text: `file ${index}` })
      })
    );

    const items = records(runtime, 'listitem');
    // A viewport of 100 at 20 a row mounts a handful, and every one of
    // them reports the size of the list rather than of the window.
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(100);
    expect(items[0].posInSet).toBe(1);
    expect(items[0].setSize).toBe(100000);
    expect(records(runtime, 'list')[0].label).toBe('Files');
  });

  it('walks the whole list from the keyboard and scrolls to keep up', () => {
    const chosen: number[] = [];
    const { runtime, press, frame } = mount(
      createComponent(LazyList, {
        label: 'Files',
        count: 1000,
        height: 100,
        estimatedItemExtent: 20,
        defaultSelectedIndex: 0,
        onSelect: (index: number) => chosen.push(index),
        // A definite height, so the estimate is the truth and the
        // arithmetic below is exact rather than nearly right.
        item: (index: number) => Box({ height: 20 }, Text({ text: `file ${index}` }))
      })
    );
    const list = byRole(runtime, 'list')[0];
    runtime.input.focus.focus(list);
    frame();

    press('End');
    frame();

    expect(chosen[chosen.length - 1]).toBe(999);
    // The last row is 1000 × 20 tall less the 100 of the viewport.
    expect(list.properties.get('scrollY')).toBe(19900);
    // And the rows that exist are the ones at the end.
    expect(textOf(list)).toContain('file 999');
  });
});

describe('DataTable', () => {
  it('sizes one set of tracks across the header and every mounted row', () => {
    const { runtime } = mount(
      createComponent(DataTable<Person>, {
        label: 'People',
        columns: COLUMNS,
        rows: PEOPLE,
        width: 300,
        height: 200,
        rowHeight: 24
      })
    );

    const cellsOf = (row: UiNode): UiNode[] => {
      const out: UiNode[] = [];
      for (let child = row.firstChild; child !== null; child = child.nextSibling) {
        out.push(child);
      }
      return out;
    };
    const rows = byRole(runtime, 'row');
    // The header plus one row per person; every one is a subgrid.
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.type).toBe(UiNodeType.Grid);
      expect(row.properties.get('subgrid')).toBe('columns');
    }
    // The tracks are the table's, so every row's cells agree with the
    // header's on where the columns are — which is the whole point of
    // the subgrid, and what a row that laid itself out could not do.
    const columnsOf = (row: UiNode) => cellsOf(row).map(cell => runtime.debugLayoutBox(cell).x);
    const header = columnsOf(rows[0]);
    expect(header).toHaveLength(2);
    for (const row of rows.slice(1)) {
      expect(columnsOf(row)).toEqual(header);
    }
    // 60 for the age column leaves the rest for the 1fr name column.
    expect(runtime.debugLayoutBox(cellsOf(rows[1])[1]).width).toBe(60);
  });

  it('sorts on a header press and re-renders the rows in place', () => {
    const { runtime, click } = mount(
      createComponent(DataTable<Person>, {
        label: 'People',
        columns: COLUMNS,
        rows: PEOPLE,
        width: 300,
        height: 200,
        rowHeight: 24
      })
    );
    const body = () =>
      byRole(runtime, 'row')
        .slice(1)
        .map(row => textOf(row)[0]);
    expect(body()).toEqual(['Ravi', 'Ana', 'Mikael']);

    const name = byRole(runtime, 'columnheader')[0];
    click(name);
    expect(body()).toEqual(['Ana', 'Mikael', 'Ravi']);

    click(name);
    expect(body()).toEqual(['Ravi', 'Mikael', 'Ana']);

    // A third press clears the sort and the natural order comes back.
    click(name);
    expect(body()).toEqual(['Ravi', 'Ana', 'Mikael']);
  });

  it('says how a column is sorted, and keeps the chosen row through a sort', () => {
    const chosen: number[] = [];
    const { runtime, click, frame } = mount(
      createComponent(DataTable<Person>, {
        label: 'People',
        columns: COLUMNS,
        rows: PEOPLE,
        width: 300,
        height: 200,
        defaultSelectedRow: 1,
        onSelect: (index: number) => chosen.push(index)
      })
    );

    click(byRole(runtime, 'columnheader')[0]);
    frame();
    const headers = records(runtime, 'columnheader');
    expect(headers.map(record => record.label)).toEqual(['Name', 'Age']);
    expect(headers[0].description).toBe('sorted ascending');
    expect(headers[1].description).toBeUndefined();

    // Ana was chosen before the sort and is still chosen after it,
    // because the selection is the row, not the position.
    const selected = records(runtime, 'row').filter(record => record.states?.includes('selected'));
    expect(selected).toHaveLength(1);
    expect(selected[0].posInSet).toBe(1);
    expect(chosen).toEqual([]);
  });

  it('mounts only the visible rows of a hundred thousand, and follows a changing count', () => {
    const rows = new BehaviorSubject<readonly Person[]>(
      Array.from({ length: 100000 }, (_, index) => ({ name: `Person ${index}`, age: index % 90 }))
    );
    const { runtime, frame, wheel } = mount(
      createComponent(DataTable<Person>, {
        label: 'People',
        columns: COLUMNS,
        rows,
        width: 300,
        height: 200,
        rowHeight: 24
      })
    );

    const bodyRows = () => byRole(runtime, 'row').length - 1;
    const mounted = bodyRows();
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(40);
    expect(records(runtime, 'row')[1].setSize).toBe(100000);

    // Scrolling mounts the rows it reveals on the same frame.
    wheel(10000);
    frame();
    expect(textOf(byRole(runtime, 'row')[1])[0]).toMatch(/^Person \d{3}/);
    expect(bodyRows()).toBeLessThan(40);

    // A shorter table drops the rows it no longer has.
    rows.next([{ name: 'Only', age: 1 }]);
    frame();
    expect(bodyRows()).toBe(1);
    expect(records(runtime, 'row')[1].setSize).toBe(1);
  });

  it('builds a column that cannot be sorted, with no handlers on its header', () => {
    const { runtime } = mount(
      createComponent(DataTable<Person>, {
        label: 'People',
        // No `compare`: the header takes no click, no focus and no
        // keymap. An `onClick` of undefined is a build error, so this
        // is the difference between a column and a crash.
        columns: [{ key: 'name', header: 'Name', cell: (person: Person) => Text({ text: person.name }) }],
        rows: PEOPLE,
        width: 300,
        height: 200
      })
    );

    const header = byRole(runtime, 'columnheader')[0];
    expect(header.properties.get('focusable')).toBeUndefined();
    expect(records(runtime, 'columnheader')[0].label).toBe('Name');
  });

  it('paints a row mounted after the first frame in the theme it inherits', () => {
    const expanded = new BehaviorSubject<readonly string[]>([]);
    const { runtime, frame } = mount(
      Box(
        { theme: darkTheme },
        createComponent(Tree, {
          nodes: FOLDERS,
          expanded,
          defaultSelectedKey: 'src',
          width: 150,
          height: 120
        })
      )
    );
    expanded.next(['src']);
    frame();

    // Every mounted row resolves its palette names against the dark
    // theme the card above it provides — including the ones that did
    // not exist when the root's environment was built.
    for (const item of byRole(runtime, 'treeitem')) {
      expect(item.environment?.get(UiEnvironmentKeys.theme)).toBe(darkTheme);
    }
    expect(byRole(runtime, 'treeitem')).toHaveLength(4);
  });

  it('refuses both a value and a default, naming the component', () => {
    expect(() =>
      mount(
        createComponent(DataTable<Person>, {
          columns: COLUMNS,
          rows: PEOPLE,
          sort: null,
          defaultSort: { column: 'name', direction: 'ascending' }
        })
      )
    ).toThrow(/DataTable was given both 'sort' and 'defaultSort'/);
  });
});

const FOLDERS: readonly TreeNode[] = [
  {
    key: 'src',
    label: 'src',
    children: [
      { key: 'ui', label: 'ui', children: [{ key: 'graph', label: 'graph' }] },
      { key: 'components', label: 'components' }
    ]
  },
  { key: 'docs', label: 'docs' }
];

describe('Tree', () => {
  function tree(props: Record<string, unknown> = {}) {
    return mount(
      createComponent(Tree, {
        label: 'Files',
        nodes: FOLDERS,
        height: 200,
        rowHeight: 20,
        ...props
      })
    );
  }

  it('renders only the open part of the model, and says how deep each row is', () => {
    const { runtime } = tree({ defaultExpanded: ['src'] });

    const items = records(runtime, 'treeitem');
    expect(items.map(record => record.label)).toEqual(['src', 'ui', 'components', 'docs']);
    expect(items.map(record => record.level)).toEqual([1, 2, 2, 1]);
    // posInSet is among siblings, as ARIA means it — not the row number.
    expect(items.map(record => record.posInSet)).toEqual([1, 1, 2, 2]);
    expect(items.map(record => record.setSize)).toEqual([2, 2, 2, 2]);
    // A branch says which way it is; a leaf says nothing about opening.
    expect(items[0].states).toEqual(['expanded']);
    expect(items[1].states).toEqual(['collapsed']);
    expect(items[3].states).toBeUndefined();
    expect(records(runtime, 'tree')[0].label).toBe('Files');
  });

  it('opens with Right, steps into the branch, and closes with Left', () => {
    const opened: readonly string[][] = [];
    const { runtime, press, frame } = tree({
      defaultSelectedKey: 'src',
      onExpandedChange: (next: readonly string[]) => (opened as string[][]).push([...next])
    });
    runtime.input.focus.focus(byRole(runtime, 'tree')[0]);
    frame();

    // Closed: Right opens it. Open: Right walks into the first child.
    press('ArrowRight');
    frame();
    expect(records(runtime, 'treeitem').map(r => r.label)).toEqual(['src', 'ui', 'components', 'docs']);
    press('ArrowRight');
    frame();
    expect(records(runtime, 'treeitem').find(r => r.states?.includes('selected'))?.label).toBe('ui');

    // On a leaf's parent, Left closes; from a leaf, Left steps out.
    press('ArrowDown');
    frame();
    press('ArrowLeft');
    frame();
    expect(records(runtime, 'treeitem').find(r => r.states?.includes('selected'))?.label).toBe('src');
    press('ArrowLeft');
    frame();
    expect(records(runtime, 'treeitem').map(r => r.label)).toEqual(['src', 'docs']);
    expect(opened).toEqual([['src'], []]);
  });

  it('refuses both a value and a default, naming the component', () => {
    expect(() => tree({ expanded: [], defaultExpanded: ['src'] })).toThrow(
      /Tree was given both 'expanded' and 'defaultExpanded'/
    );
  });
});
