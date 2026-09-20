import { describe, expect, it } from 'vitest';
import { BehaviorSubject, map } from 'rxjs';

import {
  Box,
  Button,
  Column,
  ScrollView,
  Text,
  buildSemanticsTree,
  type UiSemanticsPatch,
  type UiSemanticsUpdate
} from 'gesso-core';
import { noKeyModifiers } from 'gesso-core';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';

/**
 * How much of the tree a change in meaning costs.
 *
 * `text` marks a node semantics-dirty, so every bound label used to
 * rebuild the whole semantics tree and diff two maps — 2 ms on a five
 * thousand node tree, on any frame a clock ticked, against 0.03 ms for
 * the layout of the same change. The phase now walks only the subtree
 * of the nearest record holder above whatever changed, and falls back
 * to the full walk whenever the *shape* of the tree could have moved.
 *
 * The scoped path is deliberately not observable in the patches: the
 * ones it emits are the ones a rebuild would emit, which is the whole
 * point. What *is* observable is that it leaves untouched records
 * alone — a full rebuild allocates a new object for every record, so
 * an unrelated record keeping its identity means the tree was not
 * rebuilt. That is the assertion that fails if the scoping is ever
 * quietly lost.
 *
 * Correctness is asserted separately and more strongly: after every
 * change the tree the runtime holds is compared against a fresh full
 * build of the same graph, so a scoped update that disagreed with a
 * rebuild fails here whatever its patches said.
 */
describe('what a change in meaning walks', () => {
  /** Fails unless the tree the runtime holds is the one a full walk gives. */
  function agreesWithAFullBuild(mounted: MountedRuntime): void {
    const held = mounted.runtime.semanticsTree();
    const fresh = buildSemanticsTree(mounted.runtime.layoutRoot());
    expect([...held.keys()]).toEqual([...fresh.keys()]);
    for (const [id, record] of fresh) {
      expect(held.get(id), `record ${id}`).toEqual(record);
    }
  }

  it('leaves records it did not change alone, object for object', () => {
    const title = new BehaviorSubject('First');
    const mounted = mountRuntime(Column(Text({ text: title }), Text({ text: 'Second' }), Button({ text: 'Go' })), {
      onCreate: runtime => runtime.onSemantics(() => {})
    });
    mounted.frame(0);

    const untouchedBefore = [...mounted.runtime.semanticsTree().values()].find(record => record.label === 'Second');
    expect(untouchedBefore).toBeDefined();

    title.next('Changed');
    mounted.frame();

    const after = mounted.runtime.semanticsTree();
    const untouchedAfter = [...after.values()].find(record => record.label === 'Second');
    // The same object, not merely an equal one: a rebuild would have
    // made a new one for every node in the tree.
    expect(untouchedAfter).toBe(untouchedBefore);
    expect([...after.values()].some(record => record.label === 'Changed')).toBe(true);
    agreesWithAFullBuild(mounted);
  });

  it('renames a button from the text inside it, which has no record of its own', () => {
    const label = new BehaviorSubject('Save');
    const patches: UiSemanticsPatch[][] = [];
    const mounted = mountRuntime(Column(Button({}, Text({ text: label })), Text({ text: 'Aside' })), {
      onCreate: runtime => runtime.onSemantics(update => patches.push([...update.patches]))
    });
    mounted.frame(0);

    label.next('Saved');
    mounted.frame();

    // The dirty node is the Text, which the button claimed as its name,
    // so the record that has to change belongs to an ancestor of it.
    const last = patches[patches.length - 1]!;
    expect(last.map(patch => patch.op)).toEqual(['update']);
    const updated = last[0]!;
    expect(updated.op === 'update' && updated.node.label).toBe('Saved');
    expect(updated.op === 'update' && updated.node.role).toBe('button');
    agreesWithAFullBuild(mounted);
  });

  it('falls back to the full walk when the tree gains and loses children', () => {
    const rows = new BehaviorSubject([0, 1, 2]);
    const mounted = mountRuntime(
      Column(
        { role: 'list', label: 'Notes' },
        rows.pipe(map(all => all.map(row => Box({ key: String(row), role: 'listitem', label: `Row ${row}` }))))
      ),
      { onCreate: runtime => runtime.onSemantics(() => {}) }
    );
    mounted.frame(0);
    agreesWithAFullBuild(mounted);

    // Removing the middle row renumbers the one after it, which is
    // exactly the case a scoped walk must not try to answer.
    rows.next([0, 2]);
    mounted.frame();
    agreesWithAFullBuild(mounted);
    expect([...mounted.runtime.semanticsTree().values()].map(record => record.label)).toEqual([
      'Notes',
      'Row 0',
      'Row 2'
    ]);

    rows.next([0, 1, 2, 3]);
    mounted.frame();
    agreesWithAFullBuild(mounted);
  });

  it('agrees with a full build across a run of unrelated changes', () => {
    const a = new BehaviorSubject('a1');
    const b = new BehaviorSubject('b1');
    const states = new BehaviorSubject<readonly ('checked' | 'required')[]>(['required']);
    const disabled = new BehaviorSubject(false);
    const mounted = mountRuntime(
      Column(
        Box({ role: 'group', label: 'Controls', disabled }, Button({}, Text({ text: a })), Text({ text: b })),
        Box({ role: 'checkbox', label: 'Wrap', states })
      ),
      { onCreate: runtime => runtime.onSemantics(() => {}) }
    );
    mounted.frame(0);
    agreesWithAFullBuild(mounted);

    const steps: (() => void)[] = [
      () => a.next('a2'),
      () => b.next('b2'),
      () => states.next(['required', 'checked']),
      // A disabled ancestor: every record beneath it picks the flag up,
      // and none of them is itself dirty.
      () => disabled.next(true),
      () => a.next('a3'),
      () => disabled.next(false),
      () => b.next('b3')
    ];
    for (const step of steps) {
      step();
      mounted.frame();
      agreesWithAFullBuild(mounted);
    }
  });
});

/**
 * How many rectangles a scrolled frame hands the main thread.
 *
 * The box sweep runs on every frame that laid out, and a scroll counts
 * as one — so on a scrolled frame every box under the container has
 * moved. Each one that crosses to the shell is written as four inline
 * styles on an element, on the thread this architecture exists to keep
 * free, so the count is the cost.
 */
describe('what a scrolled frame reports to the mirror', () => {
  const ROWS = 200;
  const ROW_HEIGHT = 20;

  function longList() {
    const rows = [];
    for (let i = 0; i < ROWS; i++) {
      rows.push(Box({ height: ROW_HEIGHT }, Text({ text: `Row number ${i}` })));
    }
    return ScrollView({ width: 300, height: 100 }, ...rows);
  }

  it('reports the rows on screen, not every row in the list', () => {
    const updates: UiSemanticsUpdate[] = [];
    const mounted = mountRuntime(longList(), {
      width: 300,
      height: 100,
      onCreate: runtime => runtime.onSemantics(update => updates.push(update))
    });
    mounted.frame(0);
    let guard = 0;
    while (mounted.clock.isPending && guard++ < 50) {
      mounted.frame();
    }
    expect(mounted.runtime.semanticsTree().size).toBe(ROWS);

    const before = updates.length;
    mounted.runtime.input.wheel.wheel(10, 10, 0, 2000, noKeyModifiers());
    guard = 0;
    while (mounted.clock.isPending && guard++ < 50) {
      mounted.frame();
    }

    const scrolled = updates.slice(before);
    const reported = scrolled.reduce((total, update) => total + update.boxes.length, 0);
    expect(reported).toBeGreaterThan(0);
    // A hundred-pixel viewport over four thousand pixels of rows. The
    // margin deliberately reports more than strictly fits, but nothing
    // like the whole list.
    expect(reported).toBeLessThan(ROWS / 2);
  });
});
