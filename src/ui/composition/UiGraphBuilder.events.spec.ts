import { describe, expect, it, vi } from 'vitest';

import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiInputDispatcher } from '../input/UiInputDispatcher';
import { UiEventType, UiPointerEvent } from '../input/UiInputEvent';
import { Box, Column } from './UiComponents';
import { UiGraphBuilder } from './UiGraphBuilder';

function createHarness() {
  const graph = new UiGraph();
  const dispatcher = new UiInputDispatcher();
  const builder = new UiGraphBuilder(graph, { dispatcher });
  return { graph, dispatcher, builder };
}

function click(dispatcher: UiInputDispatcher, node: UiNode): void {
  dispatcher.dispatch(new UiPointerEvent(UiEventType.Click, 0, 0, 0), node);
}

function firstChild(node: UiNode): UiNode {
  const child = node.firstChild;
  if (child === null) {
    throw new Error('expected a child');
  }
  return child;
}

describe('UiGraphBuilder event props', () => {
  it('registers an on* handler and invokes it on dispatch', () => {
    const { dispatcher, builder } = createHarness();
    const onClick = vi.fn();

    const column = builder.build(Column(Box({ onClick })));
    click(dispatcher, firstChild(column));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not write the handler as a node property', () => {
    const { builder } = createHarness();

    const column = builder.build(Column(Box({ onClick: () => {} })));

    expect(firstChild(column).getProperty('onClick')).toBeUndefined();
  });

  it('keeps the existing binding when the handler identity is unchanged', () => {
    const { graph, builder } = createHarness();
    const onClick = vi.fn();

    const column = builder.build(Column(Box({ onClick })));
    const node = firstChild(column);
    const before = graph.getEventBindingsForNode(node)[0];

    builder.build(Column(Box({ onClick })));

    expect(graph.getEventBindingsForNode(node)[0]).toBe(before);
  });

  it('replaces the binding when the handler changes', () => {
    const { dispatcher, builder } = createHarness();
    const first = vi.fn();
    const second = vi.fn();

    const column = builder.build(Column(Box({ onClick: first })));
    builder.build(Column(Box({ onClick: second })));
    click(dispatcher, firstChild(column));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('removes the binding when the prop disappears', () => {
    const { graph, dispatcher, builder } = createHarness();
    const onClick = vi.fn();

    const column = builder.build(Column(Box({ onClick })));
    const node = firstChild(column);

    builder.build(Column(Box({})));
    click(dispatcher, node);

    expect(onClick).not.toHaveBeenCalled();
    expect(graph.getEventBindingsForNode(node)).toHaveLength(0);
    expect(dispatcher.hasListeners(UiEventType.Click)).toBe(false);
  });

  it('tears down handlers when the node is removed', () => {
    const { dispatcher, builder } = createHarness();
    const onClick = vi.fn();

    const column = builder.build(Column(Box({ onClick })));
    const node = firstChild(column);

    builder.build(Column());

    click(dispatcher, node);
    expect(onClick).not.toHaveBeenCalled();
    expect(dispatcher.hasListeners(UiEventType.Click)).toBe(false);
  });

  it('binds several event types on one node independently', () => {
    const { dispatcher, builder } = createHarness();
    const onClick = vi.fn();
    const onPointerDown = vi.fn();

    const column = builder.build(Column(Box({ onClick, onPointerDown })));
    const node = firstChild(column);

    click(dispatcher, node);
    dispatcher.dispatch(new UiPointerEvent(UiEventType.PointerDown, 0, 0, 1), node);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it('throws on an unrecognized on* handler name', () => {
    const { builder } = createHarness();

    expect(() => builder.build(Column(Box({ onClicked: () => {} })))).toThrow(/Unknown event prop 'onClicked'/);
  });

  it('rejects a non-function value on a known on* prop', () => {
    const { builder } = createHarness();

    expect(() => builder.build(Column(Box({ onClick: 'label' })))).toThrow(
      /Event prop 'onClick' on node '.*' must be a function, got a string/
    );
  });

  it('warns once and ignores handlers when built without a dispatcher', () => {
    const graph = new UiGraph();
    const builder = new UiGraphBuilder(graph);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      builder.build(Column(Box({ onClick: () => {} }), Box({ onPointerDown: () => {} })));

      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toMatch(/without a dispatcher/);
    } finally {
      warn.mockRestore();
    }
  });
});
