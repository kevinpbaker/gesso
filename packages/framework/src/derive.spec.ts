import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { bind } from './bind';
import { derive } from './derive';
import { internalState } from './InternalState';

describe('derive', () => {
  it('projects the latest of each source and emits only on change', () => {
    const a = new BehaviorSubject(1);
    const b = new BehaviorSubject('x');
    const seen: string[] = [];
    derive([a, b], (n, s) => `${s}${n}`).subscribe(value => seen.push(value));

    a.next(1);
    b.next('x');
    a.next(2);
    expect(seen).toEqual(['x1', 'x2']);
  });

  it('can compare structurally, so a rebuilt equal object is not a change', () => {
    const list = new BehaviorSubject(['a', 'b']);
    const byReference: unknown[] = [];
    const byContent: unknown[] = [];
    derive([list], items => ({ count: items.length, first: items[0] })).subscribe(v => byReference.push(v));
    derive([list], items => ({ count: items.length, first: items[0] }), { equal: 'structural' }).subscribe(v =>
      byContent.push(v)
    );

    list.next(['a', 'c']);
    expect(byReference).toHaveLength(2);
    expect(byContent).toHaveLength(1);
  });

  it('takes a rule of its own', () => {
    const n = new BehaviorSubject(1.0);
    const seen: number[] = [];
    derive([n], x => x, { equal: (p, q) => Math.round(p) === Math.round(q) }).subscribe(v => seen.push(v));
    n.next(1.2);
    n.next(1.8);
    expect(seen).toEqual([1.0, 1.8]);
  });
});

describe('bind', () => {
  it('spreads a cell as value and onChange, and writes changes back', () => {
    const volume = internalState(0.5);
    const props = bind(volume);
    expect(props.value).toBe(volume);
    props.onChange(0.8);
    expect(volume.value).toBe(0.8);
  });

  it('names the pair for a control that calls them differently', () => {
    const muted = internalState(false);
    const props = bind(muted, 'checked');
    expect(props.checked).toBe(muted);
    props.onChange(true);
    expect(muted.value).toBe(true);
    const custom = bind(muted, 'open', 'onOpenChange');
    custom.onOpenChange(false);
    expect(muted.value).toBe(false);
  });
});
