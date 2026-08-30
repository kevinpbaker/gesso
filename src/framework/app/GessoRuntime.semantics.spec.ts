import { describe, expect, it } from 'vitest';
import { BehaviorSubject, map } from 'rxjs';

import { Box, Button, Column, EditableText, Text } from '../../ui/composition/UiComponents';
import type { UiSemanticsPatch } from '../../ui/semantics';
import { mountRuntime } from './RuntimeTestUtils';

/** The records a run of patches leaves behind, by label. */
function labels(patches: readonly UiSemanticsPatch[]): (string | undefined)[] {
  return patches.map(patch => (patch.op === 'remove' ? undefined : patch.node.label));
}

describe('GessoRuntime semantics', () => {
  it('emits the tree for a login form on the first frame', () => {
    const patches: UiSemanticsPatch[][] = [];
    const { frame } = mountRuntime(
      Column(
        Text({ text: 'Sign in' }),
        Box(
          { role: 'form', label: 'Sign in' },
          EditableText({ value: 'ada@example.com', label: 'Email' }),
          Button({ text: 'Continue' })
        )
      ),
      { onCreate: runtime => runtime.onSemantics(next => patches.push([...next])) }
    );
    frame(0);

    expect(patches).toHaveLength(1);
    expect(patches[0].map(patch => patch.op)).toEqual(['add', 'add', 'add', 'add']);
    const added = patches[0].map(patch => (patch.op === 'add' ? patch.node : null));
    expect(added.map(node => node?.role)).toEqual([undefined, 'form', 'textbox', 'button']);
    expect(added.map(node => node?.label)).toEqual(['Sign in', 'Sign in', 'Email', 'Continue']);
    expect(added[2]?.valueText).toBe('ada@example.com');
    // The form is a record, so its controls hang off it rather than the root.
    expect(added[2]?.parent).toBe(added[1]?.id);
    expect(added[3]?.parent).toBe(added[1]?.id);
  });

  it('emits one update when a control changes state, and nothing else', () => {
    const states$ = new BehaviorSubject<readonly ('checked' | 'required')[]>(['required']);
    const patches: UiSemanticsPatch[][] = [];
    const { frame } = mountRuntime(
      Column(Box({ role: 'checkbox', label: 'Wrap lines', states: states$ }), Text({ text: 'Editor' })),
      { onCreate: runtime => runtime.onSemantics(next => patches.push([...next])) }
    );
    frame(0);
    expect(patches).toHaveLength(1);

    states$.next(['required', 'checked']);
    frame();

    expect(patches).toHaveLength(2);
    expect(patches[1]).toHaveLength(1);
    const patch = patches[1][0];
    expect(patch.op).toBe('update');
    expect(patch.op === 'update' && patch.node.states).toEqual(['checked', 'required']);
  });

  it('removes the records of a subtree that left the tree', () => {
    const rows$ = new BehaviorSubject([0, 1, 2]);
    const patches: UiSemanticsPatch[][] = [];
    const { frame } = mountRuntime(
      Column(
        { role: 'list', label: 'Notes' },
        rows$.pipe(map(rows => rows.map(row => Box({ key: String(row), role: 'listitem', label: `Row ${row}` }))))
      ),
      { onCreate: runtime => runtime.onSemantics(next => patches.push([...next])) }
    );
    frame(0);
    expect(labels(patches[0])).toEqual(['Notes', 'Row 0', 'Row 1', 'Row 2']);

    rows$.next([0, 2]);
    frame();

    // The removed row goes; the one that moved up reports its new index.
    const last = patches.at(-1)!;
    expect(last.filter(patch => patch.op === 'remove')).toHaveLength(1);
    const update = last.find(patch => patch.op === 'update');
    expect(update?.op === 'update' && update.node.label).toBe('Row 2');
    expect(update?.op === 'update' && update.node.index).toBe(1);
  });

  it('costs nothing on a frame that changed no semantics', () => {
    const color$ = new BehaviorSubject('#111111');
    const { runtime, frame, frames } = mountRuntime(
      Column(Box({ role: 'group', label: 'Panel', backgroundColor: color$ }, Text({ text: 'Inside' })))
    );
    frame(0);
    const before = runtime.semanticsTree().size;
    const framesSoFar = frames.length;

    // A colour change is paint; nothing about the tree means anything new.
    color$.next('#222222');
    frame();

    expect(frames.length).toBe(framesSoFar + 1);
    expect(frames.at(-1)?.phases.semantics).toBe(0);
    expect(runtime.semanticsTree().size).toBe(before);
  });

  it('hands a listener attached later the tree that already exists', () => {
    const { runtime, frame } = mountRuntime(Column(Button({ text: 'Save' })));
    frame(0);

    const seen: UiSemanticsPatch[] = [];
    runtime.onSemantics(patches => seen.push(...patches));

    expect(labels(seen)).toEqual(['Save']);
  });

  it('rejects an unknown role at build time, with the nearest name', () => {
    expect(() => mountRuntime(Column(Box({ role: 'buton' as 'button' })))).toThrow(/Did you mean 'button'/);
  });

  it('rejects an unknown state the same way', () => {
    expect(() => mountRuntime(Column(Box({ role: 'checkbox', states: ['checkd' as 'checked'] })))).toThrow(
      /Did you mean 'checked'/
    );
  });
});
