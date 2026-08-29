import { describe, expect, it, vi } from 'vitest';

import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { defineModifier, type UiModifierHost } from '../modifiers';
import { Box, Column, Text } from './UiComponents';
import { UiGraphBuilder } from './UiGraphBuilder';
import type { UiChild } from './UiElement';

/** A modifier that records every lifecycle call it receives. */
function tracked(name = 'tracked') {
  const calls: string[] = [];
  const owned: string[] = [];
  const factory = defineModifier<{ label: string }>({
    name,
    attach(host: UiModifierHost, args) {
      calls.push(`attach:${args.label}`);
      host.own(() => owned.push(`released:${args.label}`));
    },
    update(_host, args, previous) {
      calls.push(`update:${previous.label}->${args.label}`);
    },
    detach() {
      calls.push('detach');
    }
  });
  return { factory, calls, owned };
}

/** One with no update, so a changed argument is a re-attach. */
function replaceable() {
  const calls: string[] = [];
  const factory = defineModifier<number>({
    name: 'replaceable',
    attach(_host, args) {
      calls.push(`attach:${args}`);
    },
    detach() {
      calls.push('detach');
    }
  });
  return { factory, calls };
}

function build(root: UiChild) {
  const graph = new UiGraph();
  const builder = new UiGraphBuilder(graph);
  const host = graph.root;
  builder.reconcileChildren(host, [root]);
  return { graph, builder, host, node: (): UiNode => host.firstChild! };
}

describe('UiGraphBuilder modifiers', () => {
  it('attaches once when the node is built', () => {
    const { factory, calls } = tracked();
    build(Box({ modifiers: [factory({ label: 'a' })] }));
    expect(calls).toEqual(['attach:a']);
  });

  it('hands the modifier its node', () => {
    let seen: UiNode | null = null;
    const factory = defineModifier<void>({
      name: 'capture',
      attach(host) {
        seen = host.node;
      }
    });
    const { node } = build(Box({ modifiers: [factory(undefined)] }));
    expect(seen).toBe(node());
  });

  it('does nothing on an identical re-reconcile', () => {
    const { factory, calls } = tracked();
    const modifier = factory({ label: 'a' });
    const { builder, host } = build(Box({ modifiers: [modifier] }));
    calls.length = 0;

    builder.reconcileChildren(host, [Box({ modifiers: [modifier] })]);

    expect(calls).toEqual([]);
  });

  it('updates in place when only the arguments changed', () => {
    const { factory, calls } = tracked();
    const { builder, host } = build(Box({ modifiers: [factory({ label: 'a' })] }));
    calls.length = 0;

    builder.reconcileChildren(host, [Box({ modifiers: [factory({ label: 'b' })] })]);

    expect(calls).toEqual(['update:a->b']);
  });

  it('re-attaches a kind that cannot describe a change', () => {
    const { factory, calls } = replaceable();
    const { builder, host } = build(Box({ modifiers: [factory(1)] }));
    calls.length = 0;

    builder.reconcileChildren(host, [Box({ modifiers: [factory(2)] })]);

    expect(calls).toEqual(['detach', 'attach:2']);
  });

  it('detaches exactly once when the modifier leaves the list', () => {
    const { factory, calls, owned } = tracked();
    const { builder, host } = build(Box({ modifiers: [factory({ label: 'a' })] }));
    calls.length = 0;

    builder.reconcileChildren(host, [Box({ modifiers: [] })]);
    builder.reconcileChildren(host, [Box({ modifiers: [] })]);

    expect(calls).toEqual(['detach']);
    expect(owned).toEqual(['released:a']);
  });

  it('detaches when the element stops declaring modifiers at all', () => {
    const { factory, calls } = tracked();
    const { builder, host } = build(Box({ modifiers: [factory({ label: 'a' })] }));
    calls.length = 0;

    builder.reconcileChildren(host, [Box({})]);

    expect(calls).toEqual(['detach']);
  });

  it('detaches exactly once when the subtree is removed', () => {
    const { factory, calls, owned } = tracked();
    const { builder, host } = build(Column(Box({ modifiers: [factory({ label: 'a' })] })));
    calls.length = 0;

    builder.reconcileChildren(host, [Column()]);

    expect(calls).toEqual(['detach']);
    expect(owned).toEqual(['released:a']);
  });

  it('keeps keyed instances of one kind through a reorder', () => {
    const { factory, calls } = tracked();
    // Arguments are compared by identity, as props are, so a factory
    // that rebuilds its object every render updates every render. Real
    // modifiers take Observables in their arguments for what changes.
    const firstArgs = { label: 'first' };
    const secondArgs = { label: 'second' };
    const { builder, host } = build(Box({ modifiers: [factory(firstArgs, 'first'), factory(secondArgs, 'second')] }));
    expect(calls).toEqual(['attach:first', 'attach:second']);
    calls.length = 0;

    builder.reconcileChildren(host, [Box({ modifiers: [factory(secondArgs, 'second'), factory(firstArgs, 'first')] })]);

    // Same slots, same arguments: nothing was torn down to reorder.
    expect(calls).toEqual([]);
  });

  it('matches unkeyed instances of one kind by their position among that kind', () => {
    const { factory, calls } = tracked();
    const a = { label: 'a' };
    const { builder, host } = build(Box({ modifiers: [factory(a), factory({ label: 'b' })] }));
    calls.length = 0;

    builder.reconcileChildren(host, [Box({ modifiers: [factory(a), factory({ label: 'c' })] })]);

    expect(calls).toEqual(['update:b->c']);
  });

  it('releases owned teardowns in reverse order', () => {
    const order: string[] = [];
    const factory = defineModifier<void>({
      name: 'owner',
      attach(host) {
        host.own(() => order.push('first'));
        host.own({ unsubscribe: () => order.push('second') });
      }
    });
    const { builder, host } = build(Box({ modifiers: [factory(undefined)] }));

    builder.reconcileChildren(host, [Box({})]);

    expect(order).toEqual(['second', 'first']);
  });

  it('marks the node for repaint when a modifier asks for a frame', () => {
    let ask: (() => void) | null = null;
    const factory = defineModifier<void>({
      name: 'painter',
      attach(host) {
        ask = () => host.requestFrame();
      }
    });
    const { graph, node } = build(Box({ modifiers: [factory(undefined)] }));
    graph.getDirtyNodes().take();

    ask!();

    expect(graph.getDirtyNodes().take()).toEqual([node()]);
  });

  it('rejects a modifiers prop that is not a list of modifiers', () => {
    expect(() => build(Box({ modifiers: 'hoverable' as never }))).toThrow(/must be an array/);
    expect(() => build(Box({ modifiers: [{ nope: true }] as never }))).toThrow(/defineModifier/);
  });

  it('rejects modifiers on a component element', () => {
    const { factory } = tracked();
    const graph = new UiGraph();
    const builder = new UiGraphBuilder(graph, {
      components: { resolve: () => Text({ text: 'x' }), release: () => undefined, dispose: () => undefined } as never
    });
    const host = graph.root;

    expect(() =>
      builder.reconcileChildren(host, [
        { kind: 'component', tag: 'thing', props: { modifiers: [factory({ label: 'a' })] } } as never
      ])
    ).toThrow(/cannot take 'modifiers'/);
  });

  it('does not disturb the rest of the props', () => {
    const { factory } = tracked();
    const onClick = vi.fn();
    const { node } = build(Box({ width: 40, modifiers: [factory({ label: 'a' })], onClick }));

    expect(node().properties.get('width')).toBe(40);
    expect(node().properties.has('modifiers')).toBe(false);
  });
});
