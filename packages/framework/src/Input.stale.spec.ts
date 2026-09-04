import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, map } from 'rxjs';

import { Column, Text, type UiChild } from '@gesso/core';
import { createComponent } from './createComponent';
import type { ComponentContext } from './FunctionComponent';
import type { Inputs } from './FunctionComponent';
import { input } from './Input';
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

  it('says nothing when the value does not actually change', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const label = new BehaviorSubject('A');
    mountRuntime(Column({}, createComponent(Snapshot, { label })));

    label.next('A');
    expect(warn).not.toHaveBeenCalled();
  });
});
