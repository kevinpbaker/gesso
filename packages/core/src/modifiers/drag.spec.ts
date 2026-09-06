import { describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';

import { Box } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import type { UiChild } from '../composition/UiElement';
import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiInputDispatcher } from '../input/UiInputDispatcher';
import { UiEventType, UiGestureEvent, UiPointerEvent } from '../input/UiInputEvent';
import { draggable, type DragOffset } from './drag';

/**
 * The gestures are synthesized here rather than driven through
 * `UiGestureRecognizer`, because what this modifier is responsible for
 * begins at the gesture: the recognizer has its own spec for turning a
 * press into a Pan or a Drag, and repeating it here would test the
 * recognizer twice and the modifier once.
 */
function build(root: UiChild) {
  const graph = new UiGraph();
  const dispatcher = new UiInputDispatcher();
  const builder = new UiGraphBuilder(graph, { dispatcher });
  builder.reconcileChildren(graph.root, [root]);
  const node = graph.root.firstChild!;
  const send = (type: UiEventType, x = 0, y = 0): UiPointerEvent => {
    const event = new UiPointerEvent(type, x, y);
    dispatcher.dispatch(event, node);
    return event;
  };
  const rebuild = (next: UiChild): void => {
    builder.reconcileChildren(graph.root, [next]);
  };
  return { graph, dispatcher, node, send, rebuild };
}

const transform = (node: UiNode): Record<string, number> | undefined =>
  node.properties.get('transform') as Record<string, number> | undefined;

describe('draggable', () => {
  it('translates the node by the pointer movement', () => {
    const { node, send } = build(Box({ width: 100, height: 100, modifiers: [draggable()] }));

    send(UiEventType.PanStart, 40, 40);
    send(UiEventType.PanMove, 55, 70);

    expect(transform(node)).toMatchObject({ translateX: 15, translateY: 30 });
  });

  it('leaves layout alone: the translation is the only thing written', () => {
    const { node, send } = build(Box({ width: 100, height: 100, modifiers: [draggable()] }));

    send(UiEventType.PanStart, 0, 0);
    send(UiEventType.PanMove, 25, 25);

    expect(node.properties.get('width')).toBe(100);
    expect(node.properties.get('left')).toBeUndefined();
    expect(node.properties.get('top')).toBeUndefined();
  });

  it('composes with a transform the element declared', () => {
    const { node, send } = build(
      Box({
        width: 100,
        transform: { x: 50, y: 50, rotation: 0.25, scaleX: 2, scaleY: 2 },
        modifiers: [draggable()]
      })
    );

    send(UiEventType.PanStart, 0, 0);
    send(UiEventType.PanMove, 10, 0);

    expect(transform(node)).toEqual({
      x: 50,
      y: 50,
      translateX: 10,
      translateY: 0,
      scaleX: 2,
      scaleY: 2,
      rotation: 0.25
    });
  });

  it('holds one axis still when the drag is constrained', () => {
    const options = { axis: 'x' } as const;
    const { node, send } = build(Box({ width: 100, modifiers: [draggable(options)] }));

    send(UiEventType.PanStart, 0, 0);
    send(UiEventType.PanMove, 30, 90);

    expect(transform(node)).toMatchObject({ translateX: 30, translateY: 0 });
  });

  it('continues from where the last drag left the node', () => {
    const { node, send } = build(Box({ width: 100, modifiers: [draggable()] }));

    send(UiEventType.PanStart, 0, 0);
    send(UiEventType.PanMove, 10, 10);
    send(UiEventType.PanEnd, 10, 10);
    send(UiEventType.PanStart, 100, 100);
    send(UiEventType.PanMove, 105, 108);

    expect(transform(node)).toMatchObject({ translateX: 15, translateY: 18 });
  });

  it('puts the node back and drops the override when keepOffset is false', () => {
    const options = { keepOffset: false } as const;
    const { node, send } = build(Box({ width: 100, modifiers: [draggable(options)] }));

    send(UiEventType.PanStart, 0, 0);
    send(UiEventType.PanMove, 40, 40);
    send(UiEventType.PanEnd, 40, 40);

    // Not an identity translation: the node ends up with exactly what
    // the element declared, which here is no transform at all.
    expect(transform(node)).toBeUndefined();
  });

  it('restores the declared transform when the modifier goes away', () => {
    const declared = { x: 1, y: 2, scaleX: 1, scaleY: 1, rotation: 0 };
    const { node, send, rebuild } = build(Box({ width: 100, transform: declared, modifiers: [draggable()] }));
    send(UiEventType.PanStart, 0, 0);
    send(UiEventType.PanMove, 10, 10);

    rebuild(Box({ width: 100, transform: declared }));

    expect(transform(node)).toBe(declared);
    expect(node.overrides).toBeNull();
  });

  it('writes the dragging properties for the length of the gesture', () => {
    const options = { dragging: { opacity: 0.5, zIndex: 10 } } as const;
    const { node, send } = build(Box({ width: 100, opacity: 1, modifiers: [draggable(options)] }));

    send(UiEventType.PanStart, 0, 0);
    expect(node.properties.get('opacity')).toBe(0.5);
    expect(node.properties.get('zIndex')).toBe(10);

    send(UiEventType.PanEnd, 0, 0);
    expect(node.properties.get('opacity')).toBe(1);
    expect(node.properties.get('zIndex')).toBeUndefined();
  });

  it('reports each position and the final offset', () => {
    const offset = new Subject<DragOffset>();
    const seen: DragOffset[] = [];
    offset.subscribe(value => seen.push(value));
    const onEnd = vi.fn();
    const options = { offset, onEnd };
    const { send } = build(Box({ width: 100, modifiers: [draggable(options)] }));

    send(UiEventType.PanStart, 0, 0);
    send(UiEventType.PanMove, 5, 0);
    send(UiEventType.PanMove, 5, 12);
    send(UiEventType.PanEnd, 5, 12);

    expect(seen).toEqual([
      { x: 5, y: 0 },
      { x: 5, y: 12 }
    ]);
    // The drop carries the speed it ended at as well as where it
    // ended. Zero here, because the events above are plain pointer
    // events with no gesture behind them to have measured one.
    expect(onEnd).toHaveBeenCalledWith({ x: 5, y: 12, velocityX: 0, velocityY: 0 });
  });

  it('hands the release speed on to whatever catches the node', () => {
    const onEnd = vi.fn();
    const options = { onEnd };
    const { send, dispatcher, node } = build(Box({ width: 100, modifiers: [draggable(options)] }));

    send(UiEventType.PanStart, 0, 0);
    send(UiEventType.PanMove, 40, 10);
    // What the recognizer synthesizes at the end of a real gesture: a
    // UiGestureEvent carrying pixels per second, which is the unit
    // `UiSpringOptions.velocity` takes.
    dispatcher.dispatch(new UiGestureEvent(UiEventType.PanEnd, 40, 10, 0, undefined, undefined, 1800, -450), node);

    expect(onEnd).toHaveBeenCalledWith({ x: 40, y: 10, velocityX: 1800, velocityY: -450 });
  });

  it('stops the gesture reaching an ancestor that would scroll on it', () => {
    const { send } = build(Box({ width: 100, modifiers: [draggable()] }));

    const start = send(UiEventType.PanStart, 0, 0);
    const move = send(UiEventType.PanMove, 4, 4);

    expect(start.propagationStopped).toBe(true);
    expect(move.propagationStopped).toBe(true);
  });

  it('ignores a move that belongs to a gesture it never saw start', () => {
    const { node, send } = build(Box({ width: 100, modifiers: [draggable()] }));

    const move = send(UiEventType.PanMove, 30, 30);

    expect(transform(node)).toBeUndefined();
    expect(move.propagationStopped).toBe(false);
  });

  it('listens for the long-press gesture when asked to', () => {
    const options = { start: 'longPress' } as const;
    const { node, send } = build(Box({ width: 100, modifiers: [draggable(options)] }));

    send(UiEventType.PanStart, 0, 0);
    send(UiEventType.PanMove, 20, 20);
    expect(transform(node)).toBeUndefined();

    send(UiEventType.DragStart, 0, 0);
    send(UiEventType.DragMove, 20, 20);
    expect(transform(node)).toMatchObject({ translateX: 20, translateY: 20 });
  });
});
