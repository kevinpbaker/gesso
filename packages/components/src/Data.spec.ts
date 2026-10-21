import { describe, expect, it } from 'vitest';
import { BehaviorSubject, map, type Observable } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import {
  Box,
  Column,
  Row,
  Text,
  UiEnvironmentKeys,
  darkTheme,
  type UiNode,
  UiNodeType,
  type UiRole,
  type UiSemanticsRecord,
  type UiColorValue,
  fr,
  LazyRow
} from 'gesso-core';
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
        description: 'Delete removes a file.',
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
    expect(ui.recordsFor('list')[0].description).toBe('Delete removes a file.');
  });

  it('with hover, lights the row under the pointer, and leaves the chosen row its own colour', () => {
    const ui = mount(
      createComponent(LazyList, {
        label: 'Commits',
        count: 10,
        height: 100,
        hover: true,
        defaultSelectedIndex: 0,
        estimatedItemExtent: 20,
        item: (index: number) => Box({ height: 20 }, Text({ text: `commit ${index}` }))
      })
    );
    ui.frame();
    const items = ui.getAllByRole('listitem');
    const background = (index: number) => items[index]!.properties.get('backgroundColor');
    const over = (index: number) => {
      const box = ui.getLayout(items[index]!);
      ui.fireEvent.pointerMove(box.x + box.width / 2, box.y + box.height / 2);
      ui.frame();
    };
    over(2);
    expect(background(2)).toBe('controlBackgroundHovered');
    expect(background(1)).toBe('transparent');
    over(0);
    expect(background(0)).toBe('selectionBackground');
    expect(background(2)).toBe('transparent');
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

  it('with revealSelected, scrolls to an item the application chooses, and not after it as the list shifts', () => {
    const selected = new BehaviorSubject(0);
    // Keys that move with the data: an item added at the top shifts every index by one.
    let shift = 0;
    const ui = mount(
      createComponent(LazyList, {
        label: 'Commits',
        count: 1000,
        height: 100,
        estimatedItemExtent: 20,
        selectedIndex: selected,
        revealSelected: true,
        itemKey: (index: number) => index - shift,
        item: (index: number) => Box({ height: 20 }, Text({ text: `commit ${index}` }))
      })
    );
    const list = ui.getAllByRole('list')[0];
    ui.frame();
    selected.next(500);
    ui.frame();
    expect(ui.textOf(list)).toContain('commit 500');
    const scrolled = list.properties.get('scrollY') as number;
    expect(scrolled).toBeGreaterThan(9000);

    // A new item at the top: the same item, one further down, is not scrolled to again.
    shift = 1;
    selected.next(501);
    ui.frame();
    expect(list.properties.get('scrollY')).toBe(scrolled);
  });

  it('chooses nothing on Home in an empty list, where there is no row 0 to report', () => {
    const chosen: number[] = [];
    const ui = mount(
      createComponent(LazyList, {
        label: 'Files',
        count: 0,
        height: 100,
        onSelect: (index: number) => chosen.push(index),
        item: (index: number) => Text({ text: `file ${index}` })
      })
    );
    ui.fireEvent.focus(ui.getByRole('list'));
    for (const key of ['Home', 'End', 'ArrowDown', 'PageDown']) {
      ui.fireEvent.keyDown(key);
      ui.frame();
    }
    expect(chosen).toEqual([]);
  });

  it("lays each row across the list's whole width, as a row of any column is", () => {
    const ui = mount(
      createComponent(LazyList, {
        label: 'Files',
        count: 3,
        width: 300,
        height: 100,
        // A name that takes what is left, and a count kept at the end: a
        // row sized to its content would put the count beside the name.
        item: (index: number) =>
          Row({ height: 20 }, Text({ text: `file ${index}`, flex: 1 }), Text({ text: `${index}` }))
      })
    );
    const list = ui.getLayout(ui.getAllByRole('list')[0]);
    const row = ui.getLayout(ui.getAllByRole('listitem')[0]);
    const count = ui.getLayout(ui.getByText('0'));
    expect(row.width).toBeGreaterThan(list.width - 8);
    expect(count.x + count.width).toBeGreaterThan(list.x + list.width - 8);
  });
});

/** The colour each drawn string was filled with, last one wins. */
function textColours(ui: { draws: readonly { name: string; args: unknown[] }[] }): Map<string, string> {
  const out = new Map<string, string>();
  let style = '';
  for (const call of ui.draws) {
    if (call.name === 'set:fillStyle') {
      style = String(call.args[0]);
    } else if (call.name === 'fillText') {
      out.set(String(call.args[0]), style);
    }
  }
  return out;
}

function hex(color: { r: number; g: number; b: number }): string {
  return `#${[color.r, color.g, color.b]
    .map(channel =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

describe('DataTable', () => {
  it('hands each cell the colour of its row, the selection colour while it is chosen', () => {
    const chosen = new BehaviorSubject(1);
    const ui = mount(
      Column(
        { theme: darkTheme, height: 200 },
        createComponent(DataTable<Person>, {
          label: 'People',
          columns: [
            {
              key: 'name',
              header: 'Name',
              cell: (person: Person, _index: number, color: Observable<UiColorValue>) =>
                Text({ text: person.name, color })
            }
          ],
          rows: PEOPLE,
          selectedRow: chosen,
          height: 200
        })
      )
    );
    const drawn = textColours(ui);
    expect(drawn.get(PEOPLE[0].name)).toBe(hex(darkTheme.colors.controlForeground));
    expect(drawn.get(PEOPLE[1].name)).toBe(hex(darkTheme.colors.selectionForeground));

    chosen.next(0);
    ui.clearDraws();
    ui.frame();
    const after = textColours(ui);
    expect(after.get(PEOPLE[0].name)).toBe(hex(darkTheme.colors.selectionForeground));
    expect(after.get(PEOPLE[1].name)).toBe(hex(darkTheme.colors.controlForeground));
  });

  it('leaves a cell that does not bind its colour in that colour when its row is chosen: nothing is inherited', () => {
    const ui = mount(
      Column(
        { theme: darkTheme, height: 200 },
        createComponent(DataTable<Person>, {
          label: 'People',
          columns: [{ key: 'name', header: 'Name', cell: (person: Person) => Text({ text: person.name }) }],
          rows: PEOPLE,
          defaultSelectedRow: 1,
          height: 200
        })
      )
    );
    const drawn = textColours(ui);
    // The chosen row's text is drawn as the others are, which is why
    // `DataColumn.cell` asks for the colour to be bound.
    expect(drawn.get(PEOPLE[1].name)).toBe(drawn.get(PEOPLE[0].name));
    expect(drawn.get(PEOPLE[1].name)).not.toBe(hex(darkTheme.colors.selectionForeground));
  });

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

  it('scrolls sideways to columns wider than the table, header and rows together', () => {
    const ui = mount(
      createComponent(DataTable<Person>, {
        label: 'People',
        columns: [
          { key: 'name', header: 'Name', width: 250, cell: (person: Person) => Text({ text: person.name }) },
          { key: 'age', header: 'Age', width: 250, cell: (person: Person) => Text({ text: String(person.age) }) }
        ],
        rows: PEOPLE,
        width: 300,
        height: 200
      })
    );
    const age = ui.getByText(String(PEOPLE[0].age));
    const heading = ui.getByText('Age');
    // The second column starts at 250 in a 300-wide table, so most of
    // it is past the edge.
    expect(ui.getVisibleBox(age).x).toBeGreaterThan(250);

    ui.fireEvent.wheel({ x: 150, y: 100, deltaX: 400, deltaY: 0 });
    ui.frame();
    ui.frame(400);

    // 500 of columns in 300 of table scroll 200 and no further. A
    // sideways wheel used to move nothing: the scroller measured its
    // content as the table's own width, so there was nothing to scroll
    // to, and the second column stayed cut off at the edge.
    expect(ui.getVisibleBox(age).x).toBeCloseTo(ui.getLayout(age).x - 200, 5);
    // The header scrolls with the rows, so the columns still line up.
    expect(ui.getVisibleBox(heading).x).toBeCloseTo(ui.getLayout(heading).x - 200, 5);
  });

  it('scrolls sideways toward its end when it reads right to left, starting at its right edge', () => {
    const ui = mount(
      Box(
        { width: 300, height: 200, textDirection: 'rtl' },
        createComponent(DataTable<Person>, {
          label: 'People',
          columns: [
            { key: 'name', header: 'Name', width: 250, cell: (person: Person) => Text({ text: person.name }) },
            { key: 'age', header: 'Age', width: 250, cell: (person: Person) => Text({ text: String(person.age) }) }
          ],
          rows: PEOPLE,
          width: 300,
          height: 200
        })
      )
    );
    const name = ui.getByText(PEOPLE[0].name);
    const age = ui.getByText(String(PEOPLE[0].age));
    // The first column takes the right 250, and the second starts 50
    // from the left edge and runs 200 past it.
    expect(ui.getVisibleBox(name).x).toBeGreaterThan(50);
    const atStart = ui.getVisibleBox(age).x;

    // At its start, a swipe further toward the start has nothing to move.
    ui.fireEvent.wheel({ x: 150, y: 100, deltaX: 400, deltaY: 0 });
    ui.frame();
    ui.frame(400);
    expect(ui.getVisibleBox(age).x).toBe(atStart);

    // Toward the end it goes 200, the overflow, and no further. It used
    // to go nowhere: the offset was clamped at 0, the start edge.
    ui.fireEvent.wheel({ x: 150, y: 100, deltaX: -400, deltaY: 0 });
    ui.frame();
    ui.frame(400);
    expect(ui.getVisibleBox(age).x).toBeCloseTo(atStart + 200, 5);
  });

  it('keeps the rows a lazy row mounts in step with a right-to-left scroll', () => {
    const ui = mount(
      Box(
        { width: 200, height: 100, textDirection: 'rtl' },
        LazyRow({ width: 200, height: 100, count: 100, estimatedExtent: 50 }, index =>
          Box({ width: 50, height: 100 }, Text({ text: `item ${index}` }))
        )
      )
    );
    // The first item is at the start, the right edge.
    expect(ui.getVisibleBox(ui.getByText('item 0')).x).toBeGreaterThanOrEqual(150);

    ui.fireEvent.wheel({ x: 100, y: 50, deltaX: -1000, deltaY: 0 });
    for (let frame = 0; frame < 6; frame++) {
      ui.frame(400 + frame * 16);
    }
    // 1000 toward the end is twenty items along: item 20 is mounted,
    // and in view, rather than the window still holding the first few
    // because it read the negative offset as the start.
    const twenty = ui.getVisibleBox(ui.getByText('item 20'));
    expect(twenty.x).toBeGreaterThanOrEqual(0);
    expect(twenty.x).toBeLessThan(200);
    expect(ui.queryByText('item 0')).toBeNull();
  });

  it('leaves a table whose columns share its width with nothing to scroll sideways', () => {
    const ui = mount(
      createComponent(DataTable<Person>, {
        label: 'People',
        columns: COLUMNS,
        rows: PEOPLE,
        width: 300,
        height: 200
      })
    );
    const name = ui.getByText(PEOPLE[0].name);
    const before = ui.getVisibleBox(name).x;

    ui.fireEvent.wheel({ x: 150, y: 100, deltaX: 400, deltaY: 0 });
    ui.frame();
    ui.frame(400);

    expect(ui.getVisibleBox(name).x).toBe(before);
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

describe('DataTable revealSelected', () => {
  const MANY: readonly Person[] = Array.from({ length: 1000 }, (_, index) => ({
    name: `Person ${String(index).padStart(4, '0')}`,
    age: index % 90
  }));

  /** Whether the text is drawn wholly inside the table and below its sticky header. */
  function shown(ui: ReturnType<typeof mount>, text: string): boolean {
    const found = ui.queryByText(text);
    if (found === null) return false;
    const box = ui.getVisibleBox(found);
    const table = ui.getVisibleBox(ui.getByRole('grid'));
    const header = ui.getVisibleBox(ui.getAllByRole('row')[0]);
    return box.y >= header.y + header.height - 0.5 && box.y + box.height <= table.y + table.height + 0.5;
  }

  function table(props: Record<string, unknown>) {
    return mount(
      createComponent(DataTable<Person>, {
        label: 'People',
        columns: COLUMNS,
        rows: MANY,
        width: 300,
        height: 200,
        // The height a row is drawn at: a reveal of a row never mounted
        // goes by the estimate, and a wrong one lands it short.
        rowHeight: 28,
        ...props
      })
    );
  }

  it('lands a row it reveals in view when the estimate of a row is short of the real height', () => {
    // Rows drawn at about 28 under an estimate of 24. A row that was
    // never mounted is placed by the estimate, so the jump fell short
    // and the row it was for ended up below the bottom edge. It is
    // placed again once it has been measured.
    const selected = new BehaviorSubject(0);
    const ui = table({ selectedRow: selected, revealSelected: true, rowHeight: 24 });
    ui.frame();
    for (const row of [999, 500, 3]) {
      selected.next(row);
      for (let frame = 0; frame < 4; frame++) {
        ui.frame();
      }
      expect(shown(ui, `Person ${String(row).padStart(4, '0')}`), `row ${row}`).toBe(true);
    }

    // The keyboard goes the same way.
    ui.fireEvent.focus(ui.getByRole('grid'));
    ui.fireEvent.keyDown('End');
    for (let frame = 0; frame < 4; frame++) {
      ui.frame();
    }
    expect(shown(ui, 'Person 0999')).toBe(true);
  });

  it('scrolls to a row the application chooses, mounted or not, clear of the header both ways', () => {
    const selected = new BehaviorSubject(0);
    const ui = table({ selectedRow: selected, revealSelected: true });
    ui.frame();

    // Far below the window: not mounted, so the reveal goes by the window's offsets.
    selected.next(500);
    ui.frame();
    expect(shown(ui, 'Person 0500')).toBe(true);

    // Above it: the row lands below the sticky header, not under it.
    selected.next(480);
    ui.frame();
    expect(shown(ui, 'Person 0480')).toBe(true);
  });

  it('reveals a row chosen before the table has a height, once it has one', () => {
    const ui = table({ defaultSelectedRow: 700, revealSelected: true });
    ui.frame();
    ui.frame();
    expect(shown(ui, 'Person 0700')).toBe(true);
  });

  it('does not scroll after the chosen row again when a sort moves it', () => {
    const selected = new BehaviorSubject(500);
    const ui = table({ selectedRow: selected, revealSelected: true });
    ui.frame();
    ui.frame();
    const grid = ui.getByRole('grid');
    const scrolled = grid.properties.get('scrollY');
    expect(shown(ui, 'Person 0500')).toBe(true);

    // Age order puts Person 0500 somewhere else entirely; the reader's place is kept.
    ui.fireEvent.click(ui.getAllByRole('columnheader')[1]);
    ui.frame();
    expect(grid.properties.get('scrollY')).toBe(scrolled);
  });

  it('leaves a written selection unscrolled without it', () => {
    const selected = new BehaviorSubject(0);
    const ui = table({ selectedRow: selected });
    ui.frame();
    selected.next(500);
    ui.frame();
    expect(ui.queryByText('Person 0500')).toBeNull();
  });

  it('still scrolls to a row the keyboard reaches, with or without it', () => {
    for (const revealSelected of [true, false]) {
      const ui = table({ defaultSelectedRow: 0, revealSelected });
      ui.frame();
      ui.fireEvent.focus(ui.getByRole('grid'));
      ui.fireEvent.keyDown('End');
      ui.frame();
      expect(shown(ui, 'Person 0999')).toBe(true);
      ui.fireEvent.keyDown('Home');
      ui.frame();
      expect(shown(ui, 'Person 0000')).toBe(true);
    }
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

  it('draws its labels in the control colours of the theme it is under, and the chosen one in the selection colour', () => {
    const textColour = (ui: ReturnType<typeof tree>, text: string): string => textColours(ui).get(text) ?? '';
    const ui = mount(
      Column(
        { theme: darkTheme, height: 200 },
        createComponent(Tree, { label: 'Files', nodes: FOLDERS, height: 200, defaultSelectedKey: 'docs' })
      )
    );
    expect(textColour(ui, 'src')).toBe(hex(darkTheme.colors.controlForeground));
    expect(textColour(ui, 'docs')).toBe(hex(darkTheme.colors.selectionForeground));
  });

  it('asks for a row’s menu on a right click, choosing it, and on Shift+F10 for the chosen one', () => {
    const asked: [string, { x: number; y: number } | undefined][] = [];
    const chosen: (string | null)[] = [];
    const ui = tree({
      onContextMenu: (key: string, at?: { x: number; y: number }) => asked.push([key, at]),
      onSelect: (key: string | null) => chosen.push(key)
    });
    ui.frame();
    const docs = ui.getByRole('treeitem', { name: 'docs' });
    const box = ui.getLayout(docs);
    ui.fireEvent.contextMenu(docs, { x: box.x + 4, y: box.y + 4 });
    ui.frame();
    expect(asked).toEqual([['docs', { x: box.x + 4, y: box.y + 4 }]]);
    expect(chosen.at(-1)).toBe('docs');
    ui.fireEvent.focus(ui.getByRole('tree'));
    ui.fireEvent.keyDown('F10', { shift: true });
    expect(asked.at(-1)).toEqual(['docs', undefined]);
  });

  it('sits flush in what holds it when asked: no frame, no background, square corners', () => {
    const framed = tree().getByRole('tree');
    const flush = tree({ flush: true }).getByRole('tree');
    expect(framed.properties.get('backgroundColor')).toBe('controlBackground');
    const edge = (node: UiNode) =>
      (node.decorations ?? []).some(shape => shape.kind === 'stroke' && shape.color === 'controlBorder');
    expect(edge(framed)).toBe(true);
    expect(edge(flush)).toBe(false);
    expect(flush.properties.get('backgroundColor')).toBe('transparent');
    expect(flush.properties.get('borderRadius')).toBe(0);
  });

  it('draws what leading gives before each label, open or not, and still announces only the label', () => {
    const ui = tree({
      defaultExpanded: ['src'],
      leading: (node: TreeNode, open: Observable<boolean>) =>
        Text({
          text: open.pipe(
            map(on => (node.children === undefined ? `file:${node.key}` : on ? `open:${node.key}` : `shut:${node.key}`))
          )
        })
    });
    const drawn = [...textColours(ui).keys()];
    expect(drawn).toEqual(expect.arrayContaining(['open:src', 'shut:ui', 'file:components', 'file:docs']));
    expect(ui.recordsFor('treeitem').map(record => record.label)).toEqual(['src', 'ui', 'components', 'docs']);
  });

  it('colours a decorated row and its badge, says what they mean, and follows a change', () => {
    const marks = new BehaviorSubject<Record<string, { color?: UiColorValue; badge?: string; description?: string }>>({
      docs: { color: 'danger', badge: '2', description: '2 errors' }
    });
    const ui = mount(
      Column(
        { theme: darkTheme, height: 200 },
        createComponent(Tree, {
          label: 'Files',
          nodes: FOLDERS,
          height: 200,
          decoration: (node: TreeNode) => marks.pipe(map(all => all[node.key] ?? null))
        })
      )
    );
    expect(textColours(ui).get('docs')).toBe(hex(darkTheme.colors.danger));
    expect(textColours(ui).get('2')).toBe(hex(darkTheme.colors.danger));
    expect(textColours(ui).get('src')).toBe(hex(darkTheme.colors.controlForeground));
    expect(ui.recordsFor('treeitem').map(record => record.label)).toEqual(['src', 'docs, 2 errors']);

    marks.next({});
    ui.frame();
    expect(textColours(ui).get('docs')).toBe(hex(darkTheme.colors.controlForeground));
    expect(ui.recordsFor('treeitem').map(record => record.label)).toEqual(['src', 'docs']);
  });

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

  it('takes a branch with no children yet as a branch, so it can be opened and its children fetched', () => {
    const opened: string[][] = [];
    const ui = tree({
      nodes: [
        { key: 'lazy', label: 'lazy', branch: true },
        { key: 'empty', label: 'empty', branch: true, children: [] },
        { key: 'file', label: 'file' }
      ],
      onExpandedChange: (next: readonly string[]) => opened.push([...next])
    });
    const items = ui.recordsFor('treeitem');
    expect(items.map(record => record.states)).toEqual([['collapsed'], ['collapsed'], undefined]);
    ui.fireEvent.click(ui.getAllByRole('treeitem')[0]);
    ui.frame();
    expect(opened).toEqual([['lazy']]);
    // Open with nothing in it yet: no rows under it, and no throw.
    expect(ui.recordsFor('treeitem').map(record => record.label)).toEqual(['lazy', 'empty', 'file']);
    expect(ui.recordsFor('treeitem')[0].states).toEqual(['expanded', 'selected']);
  });

  it('activates a row on a double click, as Enter does', () => {
    const activated: string[] = [];
    const ui = tree({ onActivate: (key: string) => activated.push(key) });
    ui.fireEvent.doubleClick(ui.getAllByRole('treeitem')[1]);
    expect(activated).toEqual(['docs']);
  });

  it('steps over a disabled row, and neither chooses nor activates one', () => {
    const chosen: (string | null)[] = [];
    const activated: string[] = [];
    const nodes: readonly TreeNode[] = [
      { key: 'a', label: 'a' },
      { key: 'b', label: 'b', disabled: true },
      { key: 'c', label: 'c' },
      { key: 'd', label: 'd', disabled: true }
    ];
    const ui = tree({
      nodes,
      defaultSelectedKey: 'a',
      onSelect: (key: string | null) => chosen.push(key),
      onActivate: (key: string) => activated.push(key)
    });
    const press = (key: string) => {
      ui.fireEvent.keyDown(key);
      ui.frame();
    };
    ui.fireEvent.focus(ui.getByRole('tree'));
    press('ArrowDown');
    expect(chosen).toEqual(['c']);
    // Nothing after c can be chosen, so Down and End stay on it.
    press('ArrowDown');
    press('End');
    press('ArrowUp');
    press('Enter');
    // Each move, without the repeats of a key that stayed where it was.
    const moves = () => chosen.filter((key, i) => key !== chosen[i - 1]);
    expect(moves()).toEqual(['c', 'a']);
    expect(activated).toEqual(['a']);
    ui.fireEvent.click(ui.getByRole('treeitem', { name: 'b' }));
    ui.frame();
    expect(moves()).toEqual(['c', 'a']);

    // A selection written from outside can name a disabled row; Enter
    // on it is still not an activation.
    const written = tree({ nodes, selectedKey: 'b', onActivate: (key: string) => activated.push(key) });
    written.fireEvent.focus(written.getByRole('tree'));
    written.fireEvent.keyDown('Enter');
    expect(activated).toEqual(['a']);
  });

  it('keeps the choice on Right in an open folder with nothing in it, rather than moving to the next one', () => {
    const chosen: (string | null)[] = [];
    const ui = tree({
      nodes: [
        { key: 'empty', label: 'empty', branch: true },
        { key: 'next', label: 'next' }
      ],
      defaultSelectedKey: 'empty',
      defaultExpanded: ['empty'],
      onSelect: (key: string | null) => chosen.push(key)
    });
    ui.fireEvent.focus(ui.getByRole('tree'));
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(chosen).toEqual([]);
  });

  it('moves ten rows on Page Down and Page Up, as the other lists do', () => {
    const chosen: (string | null)[] = [];
    const ui = tree({
      nodes: Array.from({ length: 30 }, (_, i) => ({ key: `f${i}`, label: `f${i}` })),
      defaultSelectedKey: 'f0',
      onSelect: (key: string | null) => chosen.push(key)
    });
    ui.fireEvent.focus(ui.getByRole('tree'));
    for (const key of ['PageDown', 'PageDown', 'PageDown', 'PageUp']) {
      ui.fireEvent.keyDown(key);
      ui.frame();
    }
    expect(chosen).toEqual(['f10', 'f20', 'f29', 'f19']);
  });

  it('opens a tree deeper than the call stack is tall', () => {
    // Twenty thousand folders, one inside the next, all open.
    let node: TreeNode = { key: 'leaf', label: 'leaf' };
    const open: string[] = [];
    for (let depth = 0; depth < 20000; depth += 1) {
      node = { key: `d${depth}`, label: `d${depth}`, children: [node] };
      open.push(node.key);
    }
    const chosen: (string | null)[] = [];
    const ui = tree({ nodes: [node], defaultExpanded: open, onSelect: (key: string | null) => chosen.push(key) });
    ui.fireEvent.focus(ui.getByRole('tree'));
    ui.fireEvent.keyDown('End');
    ui.frame();
    expect(chosen).toEqual(['leaf']);
    expect(ui.getSemantics(ui.getByRole('treeitem', { name: 'leaf' })).level).toBe(20001);
  });

  it('refuses both a value and a default, naming the component', () => {
    expect(() => tree({ expanded: [], defaultExpanded: ['src'] })).toThrow(
      /Tree was given both 'expanded' and 'defaultExpanded'/
    );
  });

  it('scrolls to the row revealKey names, waiting for its folder to open and its children to arrive', () => {
    const many = (folder: string): TreeNode[] =>
      Array.from({ length: 100 }, (_, i) => ({ key: `${folder}/${i}`, label: `${folder} ${i}` }));
    const nodes = new BehaviorSubject<readonly TreeNode[]>([{ key: 'a', label: 'a', branch: true }]);
    const expanded = new BehaviorSubject<readonly string[]>([]);
    const reveal = new BehaviorSubject<{ readonly key: string } | null>(null);
    const ui = tree({ nodes, expanded, revealKey: reveal, height: 100 });
    const list = ui.getAllByRole('tree')[0];
    const scrolled = (): number => Number(list.properties.get('scrollY') ?? 0);

    // Asked for before the row exists: nothing moves yet.
    reveal.next({ key: 'a/80' });
    ui.frame();
    expect(scrolled()).toBe(0);

    // The folder opens and its children arrive: the row is brought into view.
    expanded.next(['a']);
    nodes.next([{ key: 'a', label: 'a', children: many('a') }]);
    ui.frame();
    ui.frame();
    expect(scrolled()).toBeGreaterThan(0);
    expect(ui.textOf(list)).toContain('a 80');

    // Scrolled away, a fresh request for the same row brings it back.
    list.properties.set('scrollY', 0);
    ui.frame();
    reveal.next({ key: 'a/80' });
    ui.frame();
    ui.frame();
    expect(ui.textOf(list)).toContain('a 80');
  });

  it('does not scroll when only its selection is written from outside', () => {
    const ui = tree({
      nodes: [
        { key: 'a', label: 'a', children: Array.from({ length: 100 }, (_, i) => ({ key: `a/${i}`, label: `a ${i}` })) }
      ],
      expanded: ['a'],
      selectedKey: 'a/80',
      height: 100
    });
    ui.frame();
    expect(Number(ui.getAllByRole('tree')[0].properties.get('scrollY') ?? 0)).toBe(0);
  });
});
