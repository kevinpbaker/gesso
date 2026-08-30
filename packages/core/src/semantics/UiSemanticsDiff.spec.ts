import { describe, expect, it } from 'vitest';

import { diffSemantics } from './UiSemanticsDiff';
import type { UiSemanticsRecord } from './UiSemanticsTree';

function map(...records: UiSemanticsRecord[]): ReadonlyMap<string, UiSemanticsRecord> {
  return new Map(records.map(record => [record.id, record]));
}

const button: UiSemanticsRecord = { id: 'a', parent: null, index: 0, role: 'button', label: 'Save' };
const row: UiSemanticsRecord = { id: 'b', parent: 'a', index: 0, role: 'listitem', label: 'One' };

describe('diffSemantics', () => {
  it('adds every record of a tree that was empty', () => {
    expect(diffSemantics(map(), map(button, row))).toEqual([
      { op: 'add', node: button },
      { op: 'add', node: row }
    ]);
  });

  it('emits nothing when nothing changed', () => {
    expect(diffSemantics(map(button, row), map({ ...button }, { ...row }))).toEqual([]);
  });

  it('updates a record whose value changed', () => {
    const renamed = { ...button, label: 'Save note' };
    expect(diffSemantics(map(button), map(renamed))).toEqual([{ op: 'update', node: renamed }]);
  });

  it('updates a record that gained or lost a member', () => {
    const disabled = { ...button, disabled: true } as UiSemanticsRecord;
    expect(diffSemantics(map(button), map(disabled))).toEqual([{ op: 'update', node: disabled }]);
    expect(diffSemantics(map(disabled), map(button))).toEqual([{ op: 'update', node: button }]);
  });

  it('ignores a states array that was rebuilt with the same states', () => {
    const before = { ...button, states: ['checked'] } as UiSemanticsRecord;
    const after = { ...button, states: ['checked'] } as UiSemanticsRecord;
    expect(diffSemantics(map(before), map(after))).toEqual([]);
  });

  it('reports removals before additions', () => {
    const replacement: UiSemanticsRecord = { id: 'c', parent: null, index: 0, role: 'dialog' };
    expect(diffSemantics(map(button), map(replacement))).toEqual([
      { op: 'remove', id: 'a' },
      { op: 'add', node: replacement }
    ]);
  });

  it('reports a move as an update, since the index is part of the record', () => {
    const moved = { ...row, index: 3 };
    expect(diffSemantics(map(button, row), map(button, moved))).toEqual([{ op: 'update', node: moved }]);
  });
});
