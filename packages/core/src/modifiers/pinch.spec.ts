import { describe, expect, it, vi } from 'vitest';

import { Box } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import type { UiChild } from '../composition/UiElement';
import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiInputDispatcher } from '../input/UiInputDispatcher';
import { noKeyModifiers, UiEventType, UiPinchEvent, UiWheelEvent } from '../input/UiInputEvent';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { UiModifierLayout } from './UiModifierSet';
import { pinchable } from './pinch';

/** One node at one box, which is all a zoom needs to solve its anchor. */
function layoutAt(node: () => UiNode | null, box: LayoutBox): UiModifierLayout {
  return {
    box: candidate => (candidate === node() ? box : null),
    flowBox: candidate => (candidate === node() ? box : null),
    scroll: () => null,
    onLayout: () => () => {}
  };
}

function build(root: UiChild, box: LayoutBox) {
  const graph = new UiGraph();
  const dispatcher = new UiInputDispatcher();
  let node: UiNode | null = null;
  const builder = new UiGraphBuilder(graph, { dispatcher, layout: layoutAt(() => node, box) });
  builder.reconcileChildren(graph.root, [root]);
  node = graph.root.firstChild!;
  const pinch = (
    type: UiEventType.PinchStart | UiEventType.PinchMove,
    x: number,
    y: number,
    scale: number,
    rotation = 0,
    translateX = 0,
    translateY = 0
  ): void => {
    dispatcher.dispatch(new UiPinchEvent(type, x, y, scale, rotation, 0, 0, translateX, translateY), node!);
  };
  const wheel = (x: number, y: number, deltaY: number, ctrl = true): UiWheelEvent => {
    const event = new UiWheelEvent(UiEventType.Wheel, x, y, 0, deltaY, { ...noKeyModifiers(), ctrl });
    dispatcher.dispatch(event, node!);
    return event;
  };
  return { graph, node: () => node!, pinch, wheel };
}

const transform = (node: UiNode): Record<string, number> | undefined =>
  node.properties.get('transform') as Record<string, number> | undefined;

/** A 200x200 node whose top-left corner is at (100, 100). */
const BOX: LayoutBox = { x: 100, y: 100, width: 200, height: 200 };

describe('pinchable', () => {
  it('scales the node by the gesture', () => {
    const { node, pinch } = build(Box({ width: 200, height: 200, modifiers: [pinchable()] }), BOX);

    pinch(UiEventType.PinchStart, 200, 200, 1);
    pinch(UiEventType.PinchMove, 200, 200, 2);

    expect(transform(node())).toMatchObject({ scaleX: 2, scaleY: 2 });
  });

  it('holds the point under the fingers still', () => {
    const { node, pinch } = build(Box({ width: 200, height: 200, modifiers: [pinchable()] }), BOX);

    // A pinch centred on the node's own top-left corner. Whatever the
    // scale, that corner must not move, so no translation is needed.
    pinch(UiEventType.PinchStart, 100, 100, 1);
    pinch(UiEventType.PinchMove, 100, 100, 3);
    expect(transform(node())).toMatchObject({ translateX: 0, translateY: 0, scaleX: 3 });

    // Centred on the node's middle instead: the middle is 100px in, so
    // at three times the size it would land 200px further out, and the
    // translation has to take that back.
    const other = build(Box({ width: 200, height: 200, modifiers: [pinchable()] }), BOX);
    other.pinch(UiEventType.PinchStart, 200, 200, 1);
    other.pinch(UiEventType.PinchMove, 200, 200, 3);
    expect(transform(other.node())).toMatchObject({ translateX: -200, translateY: -200 });
  });

  it('carries a two-finger pan along with the zoom', () => {
    const { node, pinch } = build(Box({ width: 200, height: 200, modifiers: [pinchable()] }), BOX);

    pinch(UiEventType.PinchStart, 100, 100, 1);
    pinch(UiEventType.PinchMove, 100, 100, 1, 0, 40, -25);

    expect(transform(node())).toMatchObject({ translateX: 40, translateY: -25, scaleX: 1 });
  });

  it('clamps to the range it was given', () => {
    const { node, pinch } = build(
      Box({ width: 200, height: 200, modifiers: [pinchable({ minScale: 0.5, maxScale: 2 })] }),
      BOX
    );

    pinch(UiEventType.PinchStart, 100, 100, 1);
    pinch(UiEventType.PinchMove, 100, 100, 10);
    expect(transform(node())!.scaleX).toBe(2);

    pinch(UiEventType.PinchStart, 100, 100, 1);
    pinch(UiEventType.PinchMove, 100, 100, 0.01);
    expect(transform(node())!.scaleX).toBe(0.5);
  });

  it('leaves rotation alone unless it was asked for', () => {
    const { node, pinch } = build(Box({ width: 200, height: 200, modifiers: [pinchable()] }), BOX);

    pinch(UiEventType.PinchStart, 200, 200, 1);
    pinch(UiEventType.PinchMove, 200, 200, 1.5, 30);
    expect(transform(node())!.rotation).toBe(0);

    const turning = build(Box({ width: 200, height: 200, modifiers: [pinchable({ rotate: true })] }), BOX);
    turning.pinch(UiEventType.PinchStart, 200, 200, 1);
    turning.pinch(UiEventType.PinchMove, 200, 200, 1.5, 30);
    expect(transform(turning.node())!.rotation).toBe(30);
  });

  it('zooms on Ctrl and the wheel, which is what a trackpad pinch arrives as', () => {
    const { node, wheel } = build(Box({ width: 200, height: 200, modifiers: [pinchable()] }), BOX);

    const zoomed = wheel(100, 100, -100);
    expect(transform(node())!.scaleX).toBeGreaterThan(1);
    // Taken here, so the container underneath does not scroll on the
    // same notch.
    expect(zoomed.defaultPrevented).toBe(true);
  });

  it('lands back where it started after equal numbers of notches each way', () => {
    const { node, wheel } = build(Box({ width: 200, height: 200, modifiers: [pinchable()] }), BOX);

    for (let i = 0; i < 5; i += 1) {
      wheel(150, 170, -120);
    }
    for (let i = 0; i < 5; i += 1) {
      wheel(150, 170, 120);
    }

    const after = transform(node())!;
    expect(after.scaleX).toBeCloseTo(1, 6);
    expect(after.translateX).toBeCloseTo(0, 6);
    expect(after.translateY).toBeCloseTo(0, 6);
  });

  it('leaves a plain wheel to the scroll container', () => {
    const { node, wheel } = build(Box({ width: 200, height: 200, modifiers: [pinchable()] }), BOX);

    const scrolled = wheel(150, 150, -100, false);

    expect(transform(node())).toBeUndefined();
    expect(scrolled.defaultPrevented).toBe(false);
  });

  it('starts from the transform the element declared rather than composing with it', () => {
    const onChange = vi.fn();
    const { pinch } = build(
      Box({
        width: 200,
        height: 200,
        transform: { scaleX: 1.5, scaleY: 1.5 },
        modifiers: [pinchable({ minScale: 1, onChange })]
      }),
      BOX
    );

    pinch(UiEventType.PinchStart, 100, 100, 1);
    pinch(UiEventType.PinchMove, 100, 100, 0.1);

    // Clamped to the modifier's own minimum of 1, not to the 1.5 the
    // element happened to declare.
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ scale: 1 }));
  });
});
