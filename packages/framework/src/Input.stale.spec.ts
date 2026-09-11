import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, map } from 'rxjs';

import { Column, Text, type UiChild } from '@gesso/core';
import { computed } from './computed';
import { createComponent } from './createComponent';
import type { ComponentContext } from './FunctionComponent';
import type { Inputs } from './FunctionComponent';
import { input } from './Input';
import { internalState } from './InternalState';
import { show } from './show';
import { mountRuntime } from './app/RuntimeTestUtils';

/** Reads its label once, the way a body should not. */
function Snapshot(inputs: Inputs<{ label: string }>, _ctx: ComponentContext): UiChild {
  return Text({ text: `Hello ${inputs.label.value}` });
}

/** Binds its label, the way a body should. */
function Bound(inputs: Inputs<{ label: string }>, _ctx: ComponentContext): UiChild {
  return Text({ text: inputs.label.pipe(map(label => `Hello ${label}`)) });
}

/** Reads a fallback cell once. */
function WithFallback(inputs: Inputs<{ size?: number }>, _ctx: ComponentContext): UiChild {
  const size = input(inputs.size, 16).value;
  return Text({ text: `Size ${size}` });
}

/** Reads the value later, in a handler, which is the ordinary way to read a current value. */
function InHandler(
  inputs: Inputs<{ label: string; onRead: (label: string) => void }>,
  _ctx: ComponentContext
): UiChild {
  return Text({ text: 'Press', onClick: () => inputs.onRead.emit(inputs.label.value) });
}

function FirstRow(inputs: Inputs<{ first: string }>, _ctx: ComponentContext): UiChild {
  return Text({ text: inputs.first });
}

describe('the stale-read warning', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says, once, which component read which prop when that prop changes with nobody following it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const label = new BehaviorSubject('A');
    mountRuntime(Column({}, createComponent(Snapshot, { label })));

    expect(warn).not.toHaveBeenCalled();
    label.next('B');
    label.next('C');

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain("Component 'Snapshot'");
    expect(message).toContain('`Snapshot.label`');
    expect(message).toContain('from "A" to "B"');
    expect(message).toContain('bind the cell');
  });

  it('says nothing for a bound prop, and nothing for a value read in a handler', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const label = new BehaviorSubject('A');
    const seen: string[] = [];
    mountRuntime(
      Column(
        {},
        createComponent(Bound, { label }),
        createComponent(InHandler, { label, onRead: (l: string) => seen.push(l) })
      )
    );

    label.next('B');
    expect(warn).not.toHaveBeenCalled();
  });

  it('names the prop a fallback cell came from', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const size = new BehaviorSubject<number | undefined>(undefined);
    mountRuntime(Column({}, createComponent(WithFallback, { size })));

    size.next(24);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('`WithFallback.size`');
    expect(String(warn.mock.calls[0][0])).toContain('from 16 to 24');
  });

  it('names the field that changed when the value is an object', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const track = new BehaviorSubject({ id: 't1', title: 'One', art: 'a.jpg' });
    function Row(inputs: Inputs<{ track: { id: string; title: string; art: string } }>): UiChild {
      return Text({ text: inputs.track.value.title });
    }
    mountRuntime(Column({}, createComponent(Row, { track })));

    track.next({ id: 't1', title: 'One', art: 'b.jpg' });

    expect(String(warn.mock.calls[0][0])).toContain('at .art, from "a.jpg" to "b.jpg"');
  });

  it('does not blame a body for a read a computed made on its behalf, even once that computed has let go', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A cell that outlives any component, as a channel key does.
    const windows = input<{ rows: readonly string[] }>({ rows: ['a'] });
    windows.label = 'rows.windows';
    // Hands a child a `computed` over that cell. The computed first runs
    // when the child's input subscribes to it, which is inside the
    // child's body, so the cell is read while a body is on record and
    // while a computed is collecting the read.
    function Window(_inputs: Inputs<{}>, _ctx: ComponentContext): UiChild {
      const first = computed(() => windows.value.rows[0] ?? '');
      return createComponent(FirstRow, { first });
    }
    const shown = internalState(true);
    const mounted = mountRuntime(
      Column(
        {},
        show(shown, () => createComponent(Window, {}))
      )
    );

    // Followed by the computed while the row is up: nothing to say.
    windows.next({ rows: ['b'] });
    // The row leaves, its computed lets go of the cell, and the cell
    // changes with nothing following it. That was the false positive: a
    // screen row whose input was a computed over a channel key was
    // reported as a stale body read after it had been unmounted.
    shown.value = false;
    mounted.frame();
    windows.next({ rows: ['c'] });

    expect(warn).not.toHaveBeenCalled();
  });

  it('says nothing when the value does not actually change', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const label = new BehaviorSubject('A');
    mountRuntime(Column({}, createComponent(Snapshot, { label })));

    label.next('A');
    expect(warn).not.toHaveBeenCalled();
  });
});
