import { describe, expect, it, vi } from 'vitest';

import { Box, Button, Column } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import type { UiChild } from '../composition/UiElement';
import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiInputDispatcher } from '../input/UiInputDispatcher';
import { UiEventType, UiPointerEvent, UiWheelEvent, noKeyModifiers } from '../input/UiInputEvent';
import { clickOutside } from './clickOutside';

function build(root: UiChild) {
  const graph = new UiGraph();
  const dispatcher = new UiInputDispatcher();
  const builder = new UiGraphBuilder(graph, { dispatcher });
  builder.reconcileChildren(graph.root, [root]);
  const press = (target: UiNode): void => {
    dispatcher.dispatch(new UiPointerEvent(UiEventType.PointerDown, 0, 0), target);
  };
  const wheel = (target: UiNode): void => {
    dispatcher.dispatch(new UiWheelEvent(UiEventType.Wheel, 0, 0, 0, 10, noKeyModifiers()), target);
  };
  const rebuild = (next: UiChild): void => {
    builder.reconcileChildren(graph.root, [next]);
  };
  return { graph, builder, press, wheel, rebuild };
}

/** The nth child of the tree's outermost column. */
function child(graph: UiGraph, index: number): UiNode {
  let node = graph.root.firstChild!.firstChild!;
  for (let i = 0; i < index; i++) {
    node = node.nextSibling!;
  }
  return node;
}

describe('clickOutside', () => {
  it('fires for a press on a node elsewhere in the tree', () => {
    const onOutside = vi.fn();
    const options = { onOutside };
    const { graph, press } = build(
      Column({}, Box({ modifiers: [clickOutside(options)] }), Button({ label: 'Elsewhere' }))
    );

    press(child(graph, 1));

    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('does not fire for a press inside the node', () => {
    const onOutside = vi.fn();
    const options = { onOutside };
    const { graph, press } = build(
      Column({}, Box({ modifiers: [clickOutside(options)] }, Button({ label: 'Inside' })), Box({}))
    );

    press(child(graph, 0));
    press(child(graph, 0).firstChild!);

    expect(onOutside).not.toHaveBeenCalled();
  });

  it('treats a node named by `except` as inside', () => {
    const onOutside = vi.fn();
    let opener: UiNode | null = null;
    const options = { onOutside, except: () => [opener] };
    const { graph, press } = build(
      Column({}, Box({ modifiers: [clickOutside(options)] }), Button({ label: 'Opener' }), Box({}))
    );
    opener = child(graph, 1);

    press(child(graph, 1));
    expect(onOutside).not.toHaveBeenCalled();

    press(child(graph, 2));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('fires for a wheel outside, and not when the caller turns that off', () => {
    const onOutside = vi.fn();
    const { graph, wheel, rebuild } = build(Column({}, Box({ modifiers: [clickOutside({ onOutside })] }), Box({})));

    wheel(child(graph, 1));
    expect(onOutside).toHaveBeenCalledTimes(1);

    rebuild(Column({}, Box({ modifiers: [clickOutside({ onOutside, wheel: false })] }), Box({})));
    wheel(child(graph, 1));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('runs before the node that was pressed', () => {
    const order: string[] = [];
    const options = { onOutside: () => order.push('outside') };
    const { graph, press } = build(
      Column(
        {},
        Box({ modifiers: [clickOutside(options)] }),
        Button({ label: 'Elsewhere', onPointerDown: () => order.push('target') })
      )
    );

    press(child(graph, 1));

    expect(order).toEqual(['outside', 'target']);
  });

  it('calls the newest handler after a re-render, without a second listener', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { graph, press, rebuild } = build(
      Column({}, Box({ modifiers: [clickOutside({ onOutside: first })] }), Box({}))
    );

    rebuild(Column({}, Box({ modifiers: [clickOutside({ onOutside: second })] }), Box({})));
    press(child(graph, 1));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the node goes away', () => {
    const onOutside = vi.fn();
    const options = { onOutside };
    const { graph, press, rebuild } = build(Column({}, Box({ modifiers: [clickOutside(options)] }), Box({})));
    const elsewhere = child(graph, 1);

    rebuild(Column({}, Box({}), Box({})));
    press(elsewhere);

    expect(onOutside).not.toHaveBeenCalled();
  });
});
