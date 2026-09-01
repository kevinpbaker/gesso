import { describe, expect, it } from 'vitest';
import { BehaviorSubject, map } from 'rxjs';

import {
  Box,
  Button,
  Column,
  EditableText,
  Row,
  Text,
  type UiSemanticsPatch,
  type UiSemanticsUpdate
} from '@gesso/core';
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
      { onCreate: runtime => runtime.onSemantics(update => patches.push([...update.patches])) }
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
      { onCreate: runtime => runtime.onSemantics(update => patches.push([...update.patches])) }
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
      { onCreate: runtime => runtime.onSemantics(update => patches.push([...update.patches])) }
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

  it('removes the record of a node that was hidden, and brings it back', () => {
    // An invisible subtree is left out of the tree entirely, so
    // `visible` has to mark the node dirty for semantics the way
    // leaving the tree does. Without it the mirror keeps an element
    // for a node that is no longer drawn.
    const visible$ = new BehaviorSubject(true);
    const patches: UiSemanticsPatch[][] = [];
    const { frame } = mountRuntime(Row(Box({ role: 'alert', label: 'Saved', visible: visible$ })), {
      onCreate: runtime => runtime.onSemantics(update => patches.push([...update.patches]))
    });
    frame(0);
    expect(labels(patches[0])).toEqual(['Saved']);

    visible$.next(false);
    frame();
    expect(patches).toHaveLength(2);
    expect(patches[1].map(patch => patch.op)).toEqual(['remove']);

    visible$.next(true);
    frame();
    expect(patches).toHaveLength(3);
    expect(labels(patches[2])).toEqual(['Saved']);
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
    runtime.onSemantics(update => seen.push(...update.patches));

    expect(labels(seen)).toEqual(['Save']);
  });

  describe('a bound string', () => {
    it('updates the record a screen reader reads, not only the pixels', () => {
      // The defect this exists for: `text` marked the node dirty for
      // content and layout but not for semantics, so a counter
      // repainted and the mirror went on reading the number it first
      // saw. Nothing caught it, because what a press changes in the
      // other specs is a role or a state rather than prose.
      const count = new BehaviorSubject(0);
      const patches: UiSemanticsPatch[][] = [];
      const { frame } = mountRuntime(Column(Text({ text: count.pipe(map(value => `Clicks: ${value}`)) })), {
        onCreate: runtime => runtime.onSemantics(update => patches.push([...update.patches]))
      });
      frame(0);
      expect(labels(patches[0])).toEqual(['Clicks: 0']);

      count.next(1);
      frame();

      expect(patches).toHaveLength(2);
      expect(labels(patches[1])).toEqual(['Clicks: 1']);
    });

    it('updates the name a parent takes from its child', () => {
      // A container's accessible name is built from its children's
      // text, so a change below it has to reach the record above it.
      const label = new BehaviorSubject('Save');
      const patches: UiSemanticsPatch[][] = [];
      const { frame } = mountRuntime(Column(Button({}, Text({ text: label }))), {
        onCreate: runtime => runtime.onSemantics(update => patches.push([...update.patches]))
      });
      frame(0);

      label.next('Saving');
      frame();

      const names = patches.flat().map(patch => (patch.op === 'remove' ? undefined : patch.node.label));
      expect(names).toContain('Saving');
    });

    it('costs nothing while no mirror is listening, and is current when one asks', () => {
      // The other half of the fix: `text` now marks semantics dirty on
      // every bound label, so a runtime with no mirror must not walk
      // the tree once a frame for nobody.
      const count = new BehaviorSubject(0);
      const mounted = mountRuntime(Column(Text({ text: count.pipe(map(value => `Clicks: ${value}`)) })));
      mounted.frame(0);
      count.next(7);
      mounted.frame();

      // Built on demand rather than per frame, and current when built.
      const tree = [...mounted.runtime.semanticsTree().values()];
      expect(tree.map(record => record.label)).toEqual(['Clicks: 7']);
    });

    it('hands a mirror attached later the tree as it is now', () => {
      const count = new BehaviorSubject(0);
      const patches: UiSemanticsPatch[][] = [];
      const mounted = mountRuntime(Column(Text({ text: count.pipe(map(value => `Clicks: ${value}`)) })));
      mounted.frame(0);
      count.next(3);
      mounted.frame();

      mounted.runtime.onSemantics(update => patches.push([...update.patches]));

      expect(labels(patches[0])).toEqual(['Clicks: 3']);
    });
  });

  describe('the accessibility mirror (F6b)', () => {
    it('sends every mirrored node a box, and afterwards only the ones that moved', () => {
      const gap$ = new BehaviorSubject(0);
      const updates: UiSemanticsUpdate[] = [];
      const { frame } = mountRuntime(
        Column(
          { gap: gap$ },
          Button({ text: 'Save', width: 80, height: 30 }),
          Button({ text: 'Cancel', width: 80, height: 30 })
        ),
        { onCreate: runtime => runtime.onSemantics(update => updates.push(update)) }
      );
      frame(0);

      expect(updates).toHaveLength(1);
      expect(updates[0].boxes.map(entry => entry.box.y)).toEqual([0, 30]);

      // A gap pushes the second button down and leaves the first alone,
      // so only one box is worth sending.
      gap$.next(12);
      frame();

      const moved = updates.at(-1)!;
      expect(moved.patches).toHaveLength(0);
      expect(moved.boxes).toHaveLength(1);
      expect(moved.boxes[0].box.y).toBe(42);
    });

    it('reports the focused node when focus moves, and not when it has not', () => {
      const updates: UiSemanticsUpdate[] = [];
      const { runtime, frame } = mountRuntime(
        Column(Button({ text: 'Save', focusable: true }), Button({ text: 'Cancel', focusable: true })),
        { onCreate: run => run.onSemantics(update => updates.push(update)) }
      );
      frame(0);
      // Nothing has focus and nothing had it before, so the first
      // update says nothing about focus rather than saying "null".
      expect(updates[0].focused).toBeUndefined();

      runtime.input.keyboard.keyDown('Tab', { ctrl: false, shift: false, alt: false, meta: false });
      frame();

      const focusUpdate = updates.at(-1)!;
      const first = runtime.semanticsTree().values().next().value!;
      expect(focusUpdate.focused).toBe(first.id);

      // A frame that moved nothing and focused nothing says nothing.
      const count = updates.length;
      frame();
      expect(updates).toHaveLength(count);
    });

    it('routes a press from an assistive technology to the node an ordinary click reaches', () => {
      const presses: string[] = [];
      const { runtime, frame } = mountRuntime(Column(Button({ text: 'Save', onClick: () => presses.push('save') })));
      frame(0);
      const button = [...runtime.semanticsTree().values()].find(node => node.role === 'button')!;

      runtime.applySemanticsAction({ id: button.id, action: 'click' });

      expect(presses).toEqual(['save']);
    });

    it('moves focus for a focus action, and refuses an id that has left the tree', () => {
      const { runtime, frame } = mountRuntime(
        Column(Button({ text: 'Save', focusable: true }), Button({ text: 'Cancel', focusable: true }))
      );
      frame(0);
      const buttons = [...runtime.semanticsTree().values()];

      runtime.applySemanticsAction({ id: buttons[1].id, action: 'focus' });
      expect(runtime.input.focus.focusedNode?.id).toBe(buttons[1].id);

      runtime.applySemanticsAction({ id: 'no-such-node', action: 'focus' });
      expect(runtime.input.focus.focusedNode?.id).toBe(buttons[1].id);
    });

    it("sets an editable's value for a setValue action, as an edit the app can see", () => {
      const inputs: string[] = [];
      const { runtime, frame } = mountRuntime(
        Row(EditableText({ value: 'ada', label: 'Name', onInput: event => inputs.push(event.value) }))
      );
      frame(0);
      const field = [...runtime.semanticsTree().values()].find(node => node.role === 'textbox')!;

      runtime.applySemanticsAction({ id: field.id, action: 'setValue', value: 'grace' });

      expect(inputs).toEqual(['grace']);
    });

    it('costs nothing while nothing is mirroring it', () => {
      const gap$ = new BehaviorSubject(0);
      const { frame, frames } = mountRuntime(Column({ gap: gap$ }, Button({ text: 'Save' })));
      frame(0);

      gap$.next(8);
      frame();

      // A frame that laid out but changed no semantics: without a
      // listener there is no geometry to gather and the phase is idle.
      expect(frames.at(-1)?.phases.semantics).toBe(0);
    });
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
