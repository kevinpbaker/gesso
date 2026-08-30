import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import {
  Box,
  Text,
  UiEnvironmentKeys,
  darkTheme,
  type UiNode,
  UiNodeType,
  type UiRole,
  type UiSemanticsRecord,
  fr
} from '@gesso/core';
import { DataTable } from './DataTable';
import { LazyList } from './LazyList';
import { Tree, type TreeNode } from './Tree';

function mount(root: Parameters<typeof renderTest>[0]) {
  const ui = renderTest(root, { width: 400, height: 300 });
  return {
    ...ui,
    recordsFor: (role: UiRole): UiSemanticsRecord[] => ui.getAllByRole(role).map(node => ui.getSemantics(node))
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
    const ui = mount(
      createComponent(LazyList, {
        label: 'Files',
        count: 100000,
        height: 100,
        estimatedItemExtent: 20,
        item: (index: number) => Text({ text: `file ${index}` })
      })
    );

    const items = ui.recordsFor('listitem');
    // A viewport of 100 at 20 a row mounts a handful, and every one of
    // them reports the size of the list rather than of the window.
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(100);
    expect(items[0].posInSet).toBe(1);
    expect(items[0].setSize).toBe(100000);
    expect(ui.recordsFor('list')[0].label).toBe('Files');
  });

  it('walks the whole list from the keyboard and scrolls to keep up', () => {
    const chosen: number[] = [];
    const ui = mount(
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
    const list = ui.getAllByRole('list')[0];
    ui.fireEvent.focus(list);
    ui.frame();

    ui.fireEvent.keyDown('End');
    ui.frame();

    expect(chosen[chosen.length - 1]).toBe(999);
    // The last row is 1000 × 20 tall less the 100 of the viewport.
    expect(list.properties.get('scrollY')).toBe(19900);
    // And the rows that exist are the ones at the end.
    expect(ui.textOf(list)).toContain('file 999');
  });
});

describe('DataTable', () => {
  it('sizes one set of tracks across the header and every mounted row', () => {
    const ui = mount(
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
    const rows = ui.getAllByRole('row');
    // The header plus one row per person; every one is a subgrid.
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.type).toBe(UiNodeType.Grid);
      expect(row.properties.get('subgrid')).toBe('columns');
    }
    // The tracks are the table's, so every row's cells agree with the
    // header's on where the columns are — which is the whole point of
    // the subgrid, and what a row that laid itself out could not do.
    const columnsOf = (row: UiNode) => cellsOf(row).map(cell => ui.getLayout(cell).x);
    const header = columnsOf(rows[0]);
    expect(header).toHaveLength(2);
    for (const row of rows.slice(1)) {
      expect(columnsOf(row)).toEqual(header);
    }
    // 60 for the age column leaves the rest for the 1fr name column.
    expect(ui.getLayout(cellsOf(rows[1])[1]).width).toBe(60);
  });

  it('sorts on a header press and re-renders the rows in place', () => {
    const ui = mount(
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
      ui
        .getAllByRole('row')
        .slice(1)
        .map(row => ui.textOf(row)[0]);
    expect(body()).toEqual(['Ravi', 'Ana', 'Mikael']);

    const name = ui.getAllByRole('columnheader')[0];
    ui.fireEvent.click(name);
    expect(body()).toEqual(['Ana', 'Mikael', 'Ravi']);

    ui.fireEvent.click(name);
    expect(body()).toEqual(['Ravi', 'Mikael', 'Ana']);

    // A third press clears the sort and the natural order comes back.
    ui.fireEvent.click(name);
    expect(body()).toEqual(['Ravi', 'Ana', 'Mikael']);
  });

  it('says how a column is sorted, and keeps the chosen row through a sort', () => {
    const chosen: number[] = [];
    const ui = mount(
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

    ui.fireEvent.click(ui.getAllByRole('columnheader')[0]);
    ui.frame();
    const headers = ui.recordsFor('columnheader');
    expect(headers.map(record => record.label)).toEqual(['Name', 'Age']);
    expect(headers[0].description).toBe('sorted ascending');
    expect(headers[1].description).toBeUndefined();

    // Ana was chosen before the sort and is still chosen after it,
    // because the selection is the row, not the position.
    const selected = ui.recordsFor('row').filter(record => record.states?.includes('selected'));
    expect(selected).toHaveLength(1);
    expect(selected[0].posInSet).toBe(1);
    expect(chosen).toEqual([]);
  });

  it('mounts only the visible rows of a hundred thousand, and follows a changing count', () => {
    const rows = new BehaviorSubject<readonly Person[]>(
      Array.from({ length: 100000 }, (_, index) => ({ name: `Person ${index}`, age: index % 90 }))
    );
    const ui = mount(
      createComponent(DataTable<Person>, {
        label: 'People',
        columns: COLUMNS,
        rows,
        width: 300,
        height: 200,
        rowHeight: 24
      })
    );

    const bodyRows = () => ui.getAllByRole('row').length - 1;
    const mounted = bodyRows();
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(40);
    expect(ui.recordsFor('row')[1].setSize).toBe(100000);

    // Scrolling mounts the rows it reveals on the same frame.
    ui.fireEvent.wheel({ x: 10, y: 10, deltaY: 10000 });
    ui.frame();
    expect(ui.textOf(ui.getAllByRole('row')[1])[0]).toMatch(/^Person \d{3}/);
    expect(bodyRows()).toBeLessThan(40);

    // A shorter table drops the rows it no longer has.
    rows.next([{ name: 'Only', age: 1 }]);
    ui.frame();
    expect(bodyRows()).toBe(1);
    expect(ui.recordsFor('row')[1].setSize).toBe(1);
  });

  it('builds a column that cannot be sorted, with no handlers on its header', () => {
    const ui = mount(
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

    const header = ui.getAllByRole('columnheader')[0];
    expect(header.properties.get('focusable')).toBeUndefined();
    expect(ui.recordsFor('columnheader')[0].label).toBe('Name');
  });

  it('paints a row mounted after the first frame in the theme it inherits', () => {
    const expanded = new BehaviorSubject<readonly string[]>([]);
    const ui = mount(
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
    ui.frame();

    // Every mounted row resolves its palette names against the dark
    // theme the card above it provides — including the ones that did
    // not exist when the root's environment was built.
    for (const item of ui.getAllByRole('treeitem')) {
      expect(item.environment?.get(UiEnvironmentKeys.theme)).toBe(darkTheme);
    }
    expect(ui.getAllByRole('treeitem')).toHaveLength(4);
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
    const ui = tree({ defaultExpanded: ['src'] });

    const items = ui.recordsFor('treeitem');
    expect(items.map(record => record.label)).toEqual(['src', 'ui', 'components', 'docs']);
    expect(items.map(record => record.level)).toEqual([1, 2, 2, 1]);
    // posInSet is among siblings, as ARIA means it — not the row number.
    expect(items.map(record => record.posInSet)).toEqual([1, 1, 2, 2]);
    expect(items.map(record => record.setSize)).toEqual([2, 2, 2, 2]);
    // A branch says which way it is; a leaf says nothing about opening.
    expect(items[0].states).toEqual(['expanded']);
    expect(items[1].states).toEqual(['collapsed']);
    expect(items[3].states).toBeUndefined();
    expect(ui.recordsFor('tree')[0].label).toBe('Files');
  });

  it('opens with Right, steps into the branch, and closes with Left', () => {
    const opened: readonly string[][] = [];
    const ui = tree({
      defaultSelectedKey: 'src',
      onExpandedChange: (next: readonly string[]) => (opened as string[][]).push([...next])
    });
    ui.fireEvent.focus(ui.getAllByRole('tree')[0]);
    ui.frame();

    // Closed: Right opens it. Open: Right walks into the first child.
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(ui.recordsFor('treeitem').map(r => r.label)).toEqual(['src', 'ui', 'components', 'docs']);
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(ui.recordsFor('treeitem').find(r => r.states?.includes('selected'))?.label).toBe('ui');

    // On a leaf's parent, Left closes; from a leaf, Left steps out.
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();
    ui.fireEvent.keyDown('ArrowLeft');
    ui.frame();
    expect(ui.recordsFor('treeitem').find(r => r.states?.includes('selected'))?.label).toBe('src');
    ui.fireEvent.keyDown('ArrowLeft');
    ui.frame();
    expect(ui.recordsFor('treeitem').map(r => r.label)).toEqual(['src', 'docs']);
    expect(opened).toEqual([['src'], []]);
  });

  it('refuses both a value and a default, naming the component', () => {
    expect(() => tree({ expanded: [], defaultExpanded: ['src'] })).toThrow(
      /Tree was given both 'expanded' and 'defaultExpanded'/
    );
  });
});
