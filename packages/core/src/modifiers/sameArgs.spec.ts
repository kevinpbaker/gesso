import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { Box } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import type { UiChild } from '../composition/UiElement';
import { UiGraph } from '../graph/UiGraph';
import { UiInputDispatcher } from '../input/UiInputDispatcher';
import { defineModifier } from './UiModifier';
import { sameArgs } from './sameArgs';

function build(root: UiChild) {
  const graph = new UiGraph();
  const builder = new UiGraphBuilder(graph, { dispatcher: new UiInputDispatcher() });
  builder.reconcileChildren(graph.root, [root]);
  const rebuild = (next: UiChild): void => {
    builder.reconcileChildren(graph.root, [next]);
  };
  return { node: graph.root.firstChild!, rebuild };
}

describe('sameArgs', () => {
  it('compares plain data by value and everything else by identity', () => {
    const fn = (): void => {};
    const stream = new BehaviorSubject(1);
    expect(sameArgs({ a: 1, b: ['x', { c: true }] }, { a: 1, b: ['x', { c: true }] })).toBe(true);
    expect(sameArgs({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameArgs({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameArgs([1, 2], [1, 2, 3])).toBe(false);
    expect(sameArgs({ on: fn }, { on: fn })).toBe(true);
    expect(sameArgs({ on: fn }, { on: (): void => {} })).toBe(false);
    expect(sameArgs({ state: stream }, { state: stream })).toBe(true);
    expect(sameArgs({ state: stream }, { state: new BehaviorSubject(1) })).toBe(false);
    expect(sameArgs(undefined, undefined)).toBe(true);
    expect(sameArgs(null, {})).toBe(false);
  });

  it('keeps a modifier attached across a rebuild with equal arguments written inline', () => {
    const attached = vi.fn();
    const detached = vi.fn();
    const counted = defineModifier<{ label: string }>({
      name: 'counted',
      attach: (_host, args) => attached(args.label),
      detach: () => detached()
    });
    const { rebuild } = build(Box({ modifiers: [counted({ label: 'a' })] }));
    expect(attached).toHaveBeenCalledTimes(1);

    rebuild(Box({ modifiers: [counted({ label: 'a' })] }));
    expect(attached).toHaveBeenCalledTimes(1);
    expect(detached).not.toHaveBeenCalled();

    rebuild(Box({ modifiers: [counted({ label: 'b' })] }));
    expect(detached).toHaveBeenCalledTimes(1);
    expect(attached).toHaveBeenCalledTimes(2);
    expect(attached).toHaveBeenLastCalledWith('b');
  });
});
