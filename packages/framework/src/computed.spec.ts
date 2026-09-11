import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { Column, Text, UiManualFrameClock, UiNodeType, type UiNode } from '@gesso/core';

import { GessoRuntime } from './app/GessoRuntime';
import { mockCanvas } from './app/RuntimeTestUtils';
import type { FrameworkChild } from './ComponentElement';
import { select } from './select';
import { computed } from './computed';
import { createComponent } from './createComponent';
import type { Inputs } from './FunctionComponent';
import { input, withBodyOf } from './Input';
import { internalState } from './InternalState';

/** Mounts a tree and returns the texts it draws, for the two binding cases below. */
function mount(root: FrameworkChild) {
  let clock!: UiManualFrameClock;
  const runtime = new GessoRuntime({
    root,
    canvas: mockCanvas(300, 200),
    width: 300,
    height: 200,
    clock: cb => (clock = new UiManualFrameClock(cb))
  });
  runtime.start();
  if (clock.isPending) clock.tick(0);
  const texts = (): string[] => {
    const out: string[] = [];
    const visit = (node: UiNode): void => {
      if (node.type === UiNodeType.Text) {
        out.push(String(node.properties.get('text')));
      }
      for (let child = node.firstChild; child !== null; child = child.nextSibling) visit(child);
    };
    visit(runtime.debugRoot());
    return out;
  };
  return { texts, frame: () => (clock.isPending ? clock.tick(16) : undefined), runtime };
}

describe('computed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is the function of the cells it reads, fresh on every read when nothing follows it', () => {
    const quantity = internalState(2);
    const price = internalState(10);
    const total = computed(() => quantity.value * price.value);
    expect(total.value).toBe(20);
    quantity.value = 3;
    expect(total.value).toBe(30);
    expect(quantity.observed).toBe(false);
  });

  it('follows its sources while subscribed and emits only when the result changes', () => {
    const a = internalState(1);
    const b = internalState('x');
    const seen: string[] = [];
    const cell = computed(() => `${b.value}${a.value > 1 ? 'big' : 'small'}`);
    const subscription = cell.subscribe(value => seen.push(value));
    expect(a.observed).toBe(true);

    a.value = 1; // no change in the result
    a.value = 2;
    b.value = 'y';
    expect(seen).toEqual(['xsmall', 'xbig', 'ybig']);

    subscription.unsubscribe();
    expect(a.observed).toBe(false);
    expect(b.observed).toBe(false);
  });

  it('re-reads its sources each run, so a conditional read follows the branch taken', () => {
    const useMetric = internalState(true);
    const celsius = internalState(20);
    const fahrenheit = internalState(68);
    const shown = computed(() => (useMetric.value ? celsius.value : fahrenheit.value));
    const seen: number[] = [];
    shown.subscribe(value => seen.push(value));
    expect(fahrenheit.observed).toBe(false);

    useMetric.value = false;
    expect(fahrenheit.observed).toBe(true);
    expect(celsius.observed).toBe(false);
    fahrenheit.value = 70;
    celsius.value = 25; // not a source any more
    expect(seen).toEqual([20, 68, 70]);
  });

  it('composes: a computed reading a computed follows the cells underneath', () => {
    const count = internalState(1);
    const doubled = computed(() => count.value * 2);
    const label = computed(() => `${doubled.value} items`);
    const seen: string[] = [];
    label.subscribe(value => seen.push(value));
    count.value = 4;
    expect(seen).toEqual(['2 items', '8 items']);
    expect(label.value).toBe('8 items');
  });

  it('can compare structurally, so a rebuilt equal object is not a change', () => {
    const items = internalState(['a', 'b']);
    const byReference: unknown[] = [];
    const byContent: unknown[] = [];
    computed(() => ({ count: items.value.length })).subscribe(v => byReference.push(v));
    computed(() => ({ count: items.value.length }), { equal: 'structural' }).subscribe(v => byContent.push(v));
    items.value = ['c', 'd'];
    expect(byReference).toHaveLength(2);
    expect(byContent).toHaveLength(1);
  });

  it('binds like any cell: a text bound to it shows each result', () => {
    const count = internalState(1);
    const ui = mount(Column(Text({ text: computed(() => `${count.value} items`) })));
    expect(ui.texts()).toEqual(['1 items']);
    count.value = 3;
    ui.frame();
    expect(ui.texts()).toEqual(['3 items']);
    ui.runtime.dispose();
  });

  it('warns once when a body read it with .value and it later changes unfollowed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const count = internalState(1);
    const label = computed(() => `${count.value} items`, { label: 'Counter.label' });
    withBodyOf('Counter', () => label.value);
    count.value = 2;
    count.value = 3;
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("Component 'Counter' read `Counter.label` with .value while its body ran");
  });

  it('follows a plain BehaviorSubject, whose value announces nothing', () => {
    // A raw subject has a `value` and records no reads, so trusting the
    // property left a computed stuck on the first value it saw. Three
    // data-layer specs found it by feeding a subject where the
    // application feeds a channel view.
    const subject = new BehaviorSubject(1);
    const doubled = computed(read => read(subject) * 2);
    const picked = select(subject, value => value + 1);
    const seen: number[] = [];
    const chosen: number[] = [];
    const following = doubled.subscribe(value => seen.push(value));
    const choosing = picked.subscribe(value => chosen.push(value));
    subject.next(2);
    subject.next(3);
    following.unsubscribe();
    choosing.unsubscribe();
    expect(seen).toEqual([2, 4, 6]);
    expect(chosen).toEqual([2, 3, 4]);
  });

  it('reads an input cell like any other source', () => {
    function Price(inputs: Inputs<{ unit?: number }>) {
      const unit = input(inputs.unit, 10);
      const quantity = internalState(2);
      return Column(Text({ text: computed(() => `${unit.value * quantity.value}`) }));
    }
    const ui = mount(createComponent(Price, { unit: 5 }));
    expect(ui.texts()).toEqual(['10']);
    ui.runtime.dispose();
  });
});
