import { afterEach, describe, expect, it, vi } from 'vitest';

import { Box, Column } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import type { UiChild } from '../composition/UiElement';
import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiInputDispatcher } from '../input/UiInputDispatcher';
import { UiEventType, UiGestureEvent, UiPointerEvent } from '../input/UiInputEvent';
import { dragSessionFor, type UiDragPayload } from '../input/UiDragSession';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { UiModifierLayout } from './UiModifierSet';
import { dragSource, dropTarget, reorderable } from './drop';

/**
 * Layout, supplied by hand.
 *
 * The runtime gives a modifier its box from the layout engine, and a
 * drop target is nothing but a box, so a spec that could not place the
 * boxes would be testing arithmetic against a null. `place` is what a
 * frame does: it writes a box and tells the listeners, which is both
 * how a zone learns it has been linked into the tree and how a reorder
 * underneath a carried row is reproduced here.
 */
class Boxes implements UiModifierLayout {
  private readonly boxes = new Map<UiNode, LayoutBox>();
  private readonly scrolls = new Map<UiNode, { x: number; y: number }>();
  private readonly listeners = new Map<UiNode, Set<(box: LayoutBox) => void>>();

  /** A frame that placed or moved a node: the box, then the notification. */
  place(node: UiNode, box: LayoutBox): void {
    this.boxes.set(node, box);
    for (const listener of this.listeners.get(node) ?? []) {
      listener(box);
    }
  }

  scroll(node: UiNode): { x: number; y: number } | null {
    return this.scrolls.get(node) ?? null;
  }

  scrollable(node: UiNode, at = { x: 0, y: 0 }): void {
    this.scrolls.set(node, at);
  }

  box(node: UiNode): LayoutBox | null {
    return this.boxes.get(node) ?? null;
  }

  flowBox(node: UiNode): LayoutBox | null {
    return this.box(node);
  }

  onLayout(node: UiNode, listener: (box: LayoutBox) => void): () => void {
    let set = this.listeners.get(node);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(node, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }
}

function build(root: UiChild, layout: Boxes) {
  const graph = new UiGraph();
  const dispatcher = new UiInputDispatcher();
  const builder = new UiGraphBuilder(graph, { dispatcher, layout });
  builder.reconcileChildren(graph.root, [root]);
  const send = (node: UiNode, type: UiEventType, x: number, y: number): void => {
    dispatcher.dispatch(new UiPointerEvent(type, x, y), node);
  };
  const endWith = (node: UiNode, type: UiEventType, x: number, y: number, vx: number, vy: number): void => {
    dispatcher.dispatch(new UiGestureEvent(type, x, y, 0, undefined, undefined, vx, vy), node);
  };
  const rebuild = (next: UiChild): void => {
    builder.reconcileChildren(graph.root, [next]);
  };
  return { graph, dispatcher, send, endWith, rebuild };
}

/** The children of the built root, which is the list in these specs. */
function childrenOf(node: UiNode): UiNode[] {
  const children: UiNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

const transform = (node: UiNode): Record<string, number> | undefined =>
  node.properties.get('transform') as Record<string, number> | undefined;

const CARD: UiDragPayload = { type: 'board/card', data: 'c1' };

afterEach(() => {
  vi.useRealTimers();
});

describe('dropTarget', () => {
  it('takes a payload it accepts and refuses one it does not', () => {
    const layout = new Boxes();
    const onDrop = vi.fn();
    const { graph } = build(
      Column({ modifiers: [dropTarget({ accepts: 'board/card', onDrop })] }, Box({ width: 10 })),
      layout
    );
    const list = graph.root.firstChild!;
    layout.place(list, { x: 0, y: 0, width: 200, height: 200 });
    const session = dragSessionFor(graph.root);

    session.begin({ type: 'board/other', data: null }, 10, 10, null);
    expect(session.accepted).toBe(false);
    session.cancel();

    session.begin(CARD, 10, 10, null);
    expect(session.accepted).toBe(true);
    session.end();
    expect(onDrop).toHaveBeenCalledWith(CARD, { x: 10, y: 10 });
  });

  it('shows its state while an accepted payload is over it', () => {
    const layout = new Boxes();
    const { graph } = build(
      Column(
        {
          borderColor: 'border',
          modifiers: [dropTarget({ accepts: 'board/card', onDrop: () => {}, over: { borderColor: 'accent' } })]
        },
        Box({ width: 10 })
      ),
      layout
    );
    const list = graph.root.firstChild!;
    layout.place(list, { x: 0, y: 0, width: 200, height: 200 });
    const session = dragSessionFor(graph.root);

    expect(list.properties.get('borderColor')).toBe('border');
    session.begin(CARD, 10, 10, null);
    expect(list.properties.get('borderColor')).toBe('accent');

    // And the element's own value comes back when the drag leaves.
    session.move(500, 500);
    expect(list.properties.get('borderColor')).toBe('border');
  });

  it('scrolls itself while a drag is held near its edge', () => {
    vi.useFakeTimers();
    const layout = new Boxes();
    const { graph } = build(
      Column(
        { modifiers: [dropTarget({ accepts: 'board/card', onDrop: () => {}, autoScroll: { edge: 40, speed: 600 } })] },
        Box({ width: 10 })
      ),
      layout
    );
    const list = graph.root.firstChild!;
    layout.place(list, { x: 0, y: 0, width: 200, height: 200 });
    layout.scrollable(list, { x: 0, y: 0 });
    const session = dragSessionFor(graph.root);

    // The middle of the list: nothing to do.
    session.begin(CARD, 100, 100, null);
    vi.advanceTimersByTime(100);
    expect(list.properties.get('scrollY')).toBeUndefined();

    // Held at the bottom edge, without moving again.
    session.move(100, 195);
    vi.advanceTimersByTime(100);
    expect(list.properties.get('scrollY')).toBeGreaterThan(0);
  });

  it('stops scrolling when the drag leaves', () => {
    vi.useFakeTimers();
    const layout = new Boxes();
    const { graph } = build(
      Column({ modifiers: [dropTarget({ accepts: 'board/card', onDrop: () => {}, autoScroll: true })] }, Box({})),
      layout
    );
    const list = graph.root.firstChild!;
    layout.place(list, { x: 0, y: 0, width: 200, height: 200 });
    layout.scrollable(list, { x: 0, y: 0 });
    const session = dragSessionFor(graph.root);

    session.begin(CARD, 100, 199, null);
    vi.advanceTimersByTime(64);
    const scrolled = list.properties.get('scrollY') as number;
    expect(scrolled).toBeGreaterThan(0);

    session.cancel();
    vi.advanceTimersByTime(200);
    expect(list.properties.get('scrollY')).toBe(scrolled);
  });
});

describe('dragSource', () => {
  it('carries a payload and reports where it was put down', () => {
    const layout = new Boxes();
    const onEnd = vi.fn();
    const onDrop = vi.fn();
    const { graph, send, endWith } = build(
      Column(
        { modifiers: [dropTarget({ accepts: 'board/card', onDrop })] },
        Box({ width: 40, height: 40, modifiers: [dragSource({ payload: CARD, onEnd })] })
      ),
      layout
    );
    const list = graph.root.firstChild!;
    const card = list.firstChild!;
    layout.place(list, { x: 0, y: 0, width: 200, height: 200 });
    layout.place(card, { x: 0, y: 0, width: 40, height: 40 });

    send(card, UiEventType.PanStart, 20, 20);
    send(card, UiEventType.PanMove, 100, 100);
    endWith(card, UiEventType.PanEnd, 100, 100, 500, -250);

    expect(onDrop).toHaveBeenCalledWith(CARD, { x: 100, y: 100 });
    expect(onEnd).toHaveBeenCalledWith({ node: list, effect: 'move' }, { x: 500, y: -250 });
  });

  it('reports nothing taken when the drag ends over empty space', () => {
    const layout = new Boxes();
    const onEnd = vi.fn();
    const { graph, send, endWith } = build(
      Column({}, Box({ width: 40, height: 40, modifiers: [dragSource({ payload: CARD, onEnd })] })),
      layout
    );
    const card = graph.root.firstChild!.firstChild!;
    layout.place(card, { x: 0, y: 0, width: 40, height: 40 });

    send(card, UiEventType.PanStart, 20, 20);
    endWith(card, UiEventType.PanEnd, 20, 20, 0, 0);

    expect(onEnd).toHaveBeenCalledWith(null, { x: 0, y: 0 });
  });

  it('writes the properties it was given for the duration of the drag', () => {
    const layout = new Boxes();
    const { graph, send, endWith } = build(
      Column({}, Box({ width: 40, modifiers: [dragSource({ payload: CARD, dragging: { opacity: 0.5 } })] })),
      layout
    );
    const card = graph.root.firstChild!.firstChild!;
    layout.place(card, { x: 0, y: 0, width: 40, height: 40 });

    send(card, UiEventType.PanStart, 20, 20);
    expect(card.properties.get('opacity')).toBe(0.5);
    endWith(card, UiEventType.PanEnd, 20, 20, 0, 0);
    expect(card.properties.get('opacity')).toBeUndefined();
  });
});

describe('reorderable', () => {
  const ROW = 40;

  /** Three rows in a column, each 40 tall, each reorderable. */
  function list(onMove: (from: number, to: number) => void) {
    const layout = new Boxes();
    const rows = [0, 1, 2].map(index =>
      Box({ key: index, width: 200, height: ROW, modifiers: [reorderable({ list: 'queue', index, onMove })] })
    );
    const built = build(Column({}, ...rows), layout);
    const column = built.graph.root.firstChild!;
    const nodes = childrenOf(column);
    layout.place(column, { x: 0, y: 0, width: 200, height: 120 });
    nodes.forEach((node, index) => layout.place(node, { x: 0, y: index * ROW, width: 200, height: ROW }));
    return { ...built, layout, nodes };
  }

  it('moves the row it is dragged past, as it crosses it', () => {
    const onMove = vi.fn();
    const { send, nodes } = list(onMove);

    // Take hold of the first row and carry it over the second.
    send(nodes[0], UiEventType.PanStart, 100, 20);
    send(nodes[0], UiEventType.PanMove, 100, 50);

    expect(onMove).toHaveBeenCalledWith(0, 1);
  });

  it('commits each crossing rather than one move at the end', () => {
    const onMove = vi.fn();
    const { send, nodes, layout } = list(onMove);

    send(nodes[0], UiEventType.PanStart, 100, 20);
    send(nodes[0], UiEventType.PanMove, 100, 50);
    // The list reorders under the carried row, which is a new layout.
    layout.place(nodes[0], { x: 0, y: ROW, width: 200, height: ROW });
    layout.place(nodes[1], { x: 0, y: 0, width: 200, height: ROW });
    send(nodes[0], UiEventType.PanMove, 100, 90);

    expect(onMove.mock.calls).toEqual([
      [0, 1],
      [1, 2]
    ]);
  });

  it('does not undo a move when the list re-renders inside onMove', () => {
    // An application's `onMove` writes the new order and the list
    // re-renders on the spot, so every row has its new index before the
    // call returns. The payload has to have been pointed at the carried
    // row's new place before that, or it points at the row that took
    // its old one and the next crossing swaps them straight back.
    const layout = new Boxes();
    let order = [0, 1, 2];
    const onMove = vi.fn((from: number, to: number) => {
      const next = [...order];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      order = next;
      rebuild(render());
    });
    const render = (): UiChild =>
      Column(
        {},
        ...order.map((key, index) =>
          Box({ key, width: 200, height: ROW, modifiers: [reorderable({ list: 'queue', index, onMove })] })
        )
      );
    const { send, rebuild, graph } = build(render(), layout);
    const column = graph.root.firstChild!;
    const place = (): void => {
      layout.place(column, { x: 0, y: 0, width: 200, height: 120 });
      childrenOf(column).forEach((node, index) =>
        layout.place(node, { x: 0, y: index * ROW, width: 200, height: ROW })
      );
    };
    place();
    const [first] = childrenOf(column);

    send(first, UiEventType.PanStart, 100, 20);
    send(first, UiEventType.PanMove, 100, 50);
    expect(order).toEqual([1, 0, 2]);
    // The layout catches up with the new order, and the pointer moves
    // a little further inside the carried row's new place.
    place();
    send(first, UiEventType.PanMove, 100, 55);
    expect(order).toEqual([1, 0, 2]);

    send(first, UiEventType.PanMove, 100, 90);
    expect(order).toEqual([1, 2, 0]);
    expect(onMove.mock.calls).toEqual([
      [0, 1],
      [1, 2]
    ]);
  });

  it('keeps the carried row under the pointer across a reorder', () => {
    const { send, nodes, layout } = list(() => {});

    // Grabbed 20px down the first row.
    send(nodes[0], UiEventType.PanStart, 100, 20);
    send(nodes[0], UiEventType.PanMove, 100, 50);
    // Held at y=50 with a grab offset of 20, the row's top belongs at
    // 30; it is still laid out at 0, so the translation is 30.
    expect(transform(nodes[0])).toMatchObject({ translateY: 30 });

    // The reorder moves it down one row in the layout. The pointer has
    // not moved, so neither should the row: the translation absorbs it.
    layout.place(nodes[0], { x: 0, y: ROW, width: 200, height: ROW });
    expect(transform(nodes[0])).toMatchObject({ translateY: -10 });
  });

  it('puts the row back in the flow when it is let go', () => {
    const { send, endWith, nodes } = list(() => {});

    send(nodes[0], UiEventType.PanStart, 100, 20);
    send(nodes[0], UiEventType.PanMove, 100, 50);
    expect(transform(nodes[0])).toBeDefined();

    endWith(nodes[0], UiEventType.PanEnd, 100, 50, 0, 0);
    expect(transform(nodes[0]) ?? null).toBeNull();
  });

  it('does not take a row from a different list', () => {
    const layout = new Boxes();
    const onMove = vi.fn();
    const { graph, send } = build(
      Column(
        {},
        Box({ key: 'a', width: 200, height: ROW, modifiers: [reorderable({ list: 'queue', index: 0, onMove })] }),
        Box({ key: 'b', width: 200, height: ROW, modifiers: [reorderable({ list: 'other', index: 0, onMove })] })
      ),
      layout
    );
    const nodes = childrenOf(graph.root.firstChild!);
    nodes.forEach((node, index) => layout.place(node, { x: 0, y: index * ROW, width: 200, height: ROW }));

    send(nodes[0], UiEventType.PanStart, 100, 20);
    send(nodes[0], UiEventType.PanMove, 100, 50);

    expect(onMove).not.toHaveBeenCalled();
  });

  it('keeps the pan away from a scroll container above it', () => {
    const { dispatcher, nodes } = list(() => {});

    // The same claim `Slider` and `SplitPane` make, and for the same
    // reason: `UiTouchScroller` listens for pans at the root, so a row
    // carried inside a list would move and scroll its list at once.
    const started = new UiPointerEvent(UiEventType.PanStart, 100, 20);
    dispatcher.dispatch(started, nodes[0]);
    expect(started.propagationStopped).toBe(true);

    const moved = new UiPointerEvent(UiEventType.PanMove, 100, 50);
    dispatcher.dispatch(moved, nodes[0]);
    expect(moved.propagationStopped).toBe(true);
  });
});
