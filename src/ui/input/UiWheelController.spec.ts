import { describe, expect, it, vi } from 'vitest';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { UiEventType, type UiKeyModifiers } from './UiInputEvent';
import { InputTestHarness } from './UiInputTestUtils';
import type { UiWheelController } from './UiWheelController';

/**
 * A 400x400 app root holding a 300x200 ScrollView at (0,0). The
 * viewport shows the top of a 300x600 content box, so the scroll
 * range is scrollY in [0, 400]. Points of interest:
 *   (50,50)   -> content box inside the scroll view
 *   (350,350) -> app root (empty area, no scroll container)
 */
function setupVertical(): {
  h: InputTestHarness;
  scroll: UiNode;
  content: UiNode;
  app: UiNode;
  controller: UiWheelController;
} {
  const h = new InputTestHarness();
  const scroll = h.node('scroll', UiNodeType.ScrollView, { width: 300, height: 200 });
  const content = h.node('content', UiNodeType.Box, { width: 300, height: 600 });
  h.add(h.root, scroll);
  h.add(scroll, content);
  h.layoutTree();
  return { h, scroll, content, app: h.root, controller: h.createWheelController() };
}

/**
 * A 300x200 ScrollView laid out as a row, so it scrolls
 * horizontally. Its 600-wide content overflows the 300-wide viewport
 * (scrollX range [0, 300]).
 */
function setupHorizontal(): {
  h: InputTestHarness;
  scroll: UiNode;
  controller: UiWheelController;
} {
  const h = new InputTestHarness();
  const scroll = h.node('scroll', UiNodeType.ScrollView, {
    direction: 'row',
    width: 300,
    height: 200
  });
  const content = h.node('content', UiNodeType.Box, { width: 600, height: 200 });
  h.add(h.root, scroll);
  h.add(scroll, content);
  h.layoutTree();
  return { h, scroll, controller: h.createWheelController() };
}

function scrollY(h: InputTestHarness, node: UiNode): number {
  return h.layout.engine.recordFor(node)!.scrollY;
}

function scrollX(h: InputTestHarness, node: UiNode): number {
  return h.layout.engine.recordFor(node)!.scrollX;
}

describe('UiWheelController', () => {
  it('dispatches a bubbling Wheel to the node under the pointer', () => {
    const { h, scroll, content, controller } = setupVertical();
    const target = vi.fn();
    const ancestor = vi.fn();
    h.dispatcher.addEventListener(content, UiEventType.Wheel, target);
    h.dispatcher.addEventListener(scroll, UiEventType.Wheel, ancestor);

    const event = controller.wheel(50, 50, 0, 100);

    expect(event.type).toBe(UiEventType.Wheel);
    expect(event.x).toBe(50);
    expect(event.y).toBe(50);
    expect(event.deltaX).toBe(0);
    expect(event.deltaY).toBe(100);
    expect(target).toHaveBeenCalledTimes(1);
    expect(ancestor).toHaveBeenCalledTimes(1);
  });

  it('scrolls the nearest scroll container by deltaY', () => {
    const { h, scroll, controller } = setupVertical();

    controller.wheel(50, 50, 0, 100);

    expect(scrollY(h, scroll)).toBe(100);
  });

  it('clamps at the content edge', () => {
    const { h, scroll, controller } = setupVertical();

    controller.wheel(50, 50, 0, 1000);

    expect(scrollY(h, scroll)).toBe(400);
  });

  it('scrolls in the reverse direction when deltaY is negative', () => {
    const { h, scroll, controller } = setupVertical();

    controller.wheel(50, 50, 0, 200);
    controller.wheel(50, 50, 0, -50);

    expect(scrollY(h, scroll)).toBe(150);
  });

  it('does not scroll when the Wheel was defaultPrevented', () => {
    const { h, scroll, controller } = setupVertical();
    h.dispatcher.addEventListener(scroll, UiEventType.Wheel, event => {
      event.preventDefault();
    });

    controller.wheel(50, 50, 0, 100);

    expect(scrollY(h, scroll)).toBe(0);
  });

  it('scrolls a horizontal container by deltaX', () => {
    const { h, scroll, controller } = setupHorizontal();

    controller.wheel(50, 50, 50, 0);

    expect(scrollX(h, scroll)).toBe(50);
    expect(scrollX(h, scroll)).toBeGreaterThan(0);
    expect(scrollX(h, scroll)).toBeLessThanOrEqual(300);
  });

  it('does nothing when no scroll container is under the pointer', () => {
    const { controller } = setupVertical();

    expect(() => controller.wheel(350, 350, 0, 100)).not.toThrow();
  });

  it('carries the modifiers on the event', () => {
    const { h, controller } = setupVertical();
    const received: UiKeyModifiers[] = [];
    h.dispatcher.addEventListener(h.root, UiEventType.Wheel, event => {
      received.push((event as unknown as { modifiers: UiKeyModifiers }).modifiers);
    });

    controller.wheel(50, 50, 0, 10, { shift: true, ctrl: false, alt: false, meta: false });

    expect(received).toEqual([{ shift: true, ctrl: false, alt: false, meta: false }]);
  });
});
