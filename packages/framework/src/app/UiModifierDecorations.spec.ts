import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import {
  Box,
  Button,
  Column,
  Text,
  UiGraphBuilder,
  type UiChild,
  DirtyFlags,
  UiGraph,
  type UiNode,
  UiEnvironmentKeys,
  darkTheme,
  decorationColor,
  decorationRect,
  type DecorationShape,
  type LayoutRecord,
  decorated,
  focusRing,
  noKeyModifiers
} from '@gesso/core';
import { mountRuntime } from './RuntimeTestUtils';
import { FocusService } from './FocusService';

function build(root: UiChild) {
  const graph = new UiGraph();
  const builder = new UiGraphBuilder(graph);
  builder.reconcileChildren(graph.root, [root]);
  return {
    graph,
    node: graph.root.firstChild!,
    rebuild: (next: UiChild) => builder.reconcileChildren(graph.root, [next])
  };
}

const RING: readonly DecorationShape[] = [{ kind: 'stroke', color: '#f00', lineWidth: 2, outset: 3 }];
const BADGE: readonly DecorationShape[] = [{ kind: 'fill', color: '#0f0', width: 8, height: 8 }];

function record(box: { x: number; y: number; width: number; height: number }): LayoutRecord {
  return box as unknown as LayoutRecord;
}

describe('decoration shapes on a node', () => {
  it('a modifier decorates its node and marks it for repaint', () => {
    const { graph, node } = build(Box({ modifiers: [decorated(RING)] }));

    expect(node.decorations).toEqual(RING);
    expect(node.dirtyFlags & DirtyFlags.Paint).not.toBe(0);
    expect(graph.getDirtyNodes().take()).toContain(node);
  });

  it('goes back to null when the modifier leaves, so an undecorated node costs nothing', () => {
    const { node, rebuild } = build(Box({ modifiers: [decorated(RING)] }));
    expect(node.decorations).not.toBeNull();

    rebuild(Box({}));

    expect(node.decorations).toBeNull();
  });

  it('merges the shapes of several modifiers in the order the element listed them', () => {
    const { node, rebuild } = build(Box({ modifiers: [decorated(RING), decorated(BADGE)] }));
    expect(node.decorations).toEqual([...RING, ...BADGE]);

    // Reordered in the list: the merged shapes follow, because paint
    // order among a node's own decorations is the list's order.
    rebuild(Box({ modifiers: [decorated(BADGE), decorated(RING)] }));

    expect(node.decorations).toEqual([...BADGE, ...RING]);
  });

  it('one modifier leaving takes only its own shapes', () => {
    const { node, rebuild } = build(Box({ modifiers: [decorated(RING), decorated(BADGE)] }));

    rebuild(Box({ modifiers: [decorated(BADGE)] }));

    expect(node.decorations).toEqual(BADGE);
  });

  it('places a shape against the node box, with the outset on all four sides', () => {
    const rect = decorationRect(RING[0], record({ x: 20, y: 10, width: 100, height: 40 }), 6);

    expect(rect).toEqual({ x: 17, y: 7, width: 106, height: 46, radius: 9 });
  });

  it('a shape with its own box takes the node radius grown by the outset unless it says otherwise', () => {
    const rec = record({ x: 0, y: 0, width: 100, height: 100 });

    expect(decorationRect({ kind: 'fill', color: '#000', x: 4, y: 4, width: 8, height: 8 }, rec, 5)).toEqual({
      x: 4,
      y: 4,
      width: 8,
      height: 8,
      radius: 5
    });
    expect(decorationRect({ kind: 'fill', color: '#000', radius: 0 }, rec, 5).radius).toBe(0);
  });

  it("resolves a palette name against the node's own theme, as a colour prop does", () => {
    const { node } = build(
      Column(
        { theme: darkTheme },
        Box({ modifiers: [decorated([{ kind: 'stroke', color: 'focusRing', lineWidth: 2 }])] })
      )
    );
    const inner = node.firstChild!;

    expect(inner.environment?.get(UiEnvironmentKeys.theme)).toBe(darkTheme);
    expect(decorationColor(inner, inner.decorations![0])).toEqual(darkTheme.colors.focusRing);
    // And a literal is still a literal.
    expect(decorationColor(inner, { kind: 'fill', color: '#ff0000' })).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });
});

/**
 * `focusRing()` is what B3 exists for: visible focus, from one place,
 * on every control in the library. These drive it through a real
 * runtime because focus lives in the input stack and a ring that
 * follows a focus manager cannot be tested without one.
 */
describe('focusRing', () => {
  function form() {
    let first: UiNode | null = null;
    let second: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        {},
        Button({ ref: (node: UiNode | null) => (first = node), modifiers: [focusRing()] }, Text({ text: 'One' })),
        Button({ ref: (node: UiNode | null) => (second = node), modifiers: [focusRing()] }, Text({ text: 'Two' }))
      )
    );
    mounted.frame();
    return { ...mounted, first: first!, second: second! };
  }

  it('draws nothing until the node is focused, and follows focus from node to node', () => {
    const { runtime, first, second } = form();
    const store = runtime.services.get(FocusService);

    expect(first.decorations).toBeNull();
    expect(second.decorations).toBeNull();

    store.focus(first);
    expect(first.decorations).toHaveLength(1);
    expect(second.decorations).toBeNull();

    store.focus(second);
    expect(first.decorations).toBeNull();
    expect(second.decorations).toHaveLength(1);

    store.blur();
    expect(second.decorations).toBeNull();
  });

  it('stays away from focus a pointer press gave, and appears once the keyboard is used', () => {
    const { runtime, first } = form();
    // The column starts at the origin and the first button is its first
    // child, so a press a few pixels in lands on it.
    const box = { x: 0, y: 0 };
    const modifiers = noKeyModifiers();

    // A press focuses the button, as a press does, and draws no ring.
    runtime.input.pointer.pointerDown(box.x + 5, box.y + 5, 1, modifiers);
    runtime.input.pointer.pointerUp(box.x + 5, box.y + 5, 0, modifiers);
    expect(runtime.input.focus.focusedNode).toBe(first);
    expect(first.decorations).toBeNull();

    // A modifier held for a click is not a keyboard interaction.
    runtime.input.keyboard.keyDown('Shift', { ...modifiers, shift: true });
    expect(first.decorations).toBeNull();

    // An arrow is: the person is on the keys now, so the ring shows.
    runtime.input.keyboard.keyDown('ArrowDown', modifiers);
    expect(first.decorations).toHaveLength(1);

    // And the next press takes it away, without moving focus.
    runtime.input.pointer.pointerDown(box.x + 5, box.y + 5, 1, modifiers);
    expect(runtime.input.focus.focusedNode).toBe(first);
    expect(first.decorations).toBeNull();
  });

  it('shows the ring for focus moved by Tab, and for focus placed by code before any press', () => {
    const { runtime, first, second } = form();

    runtime.services.get(FocusService).focus(first);
    expect(first.decorations).toHaveLength(1);

    runtime.input.keyboard.keyDown('Tab', noKeyModifiers());
    expect(runtime.input.focus.focusedNode).toBe(second);
    expect(first.decorations).toBeNull();
    expect(second.decorations).toHaveLength(1);
  });

  it('is a stroke outside the node, so it never covers the control it marks', () => {
    const { runtime, first } = form();
    runtime.services.get(FocusService).focus(first);

    const shape = first.decorations![0];
    expect(shape.kind).toBe('stroke');
    // outset = offset + width, so the band lies between `offset` and
    // `offset + width` pixels clear of the node's box.
    expect(shape.outset).toBe(4);
    expect(shape).toMatchObject({ lineWidth: 2, color: 'focusRing' });
    const rect = decorationRect(shape, record({ x: 0, y: 0, width: 60, height: 20 }), 0);
    expect(rect).toEqual({ x: -4, y: -4, width: 68, height: 28, radius: 4 });
  });

  it('appears on a node that already held focus when the ring attached', () => {
    // A control re-rendered while it holds focus — an observable child
    // swapping a keyed button for one that now carries a ring. The
    // node survives (same key), so no focus change follows, and the
    // ring has to read the focus it already has rather than wait for
    // one that will not come.
    let target: UiNode | null = null;
    const button = (ring: boolean): UiChild =>
      Button(
        { key: 'save', ref: (node: UiNode | null) => (target = node), modifiers: ring ? [focusRing()] : [] },
        Text({ text: 'Save' })
      );
    const children = new BehaviorSubject<UiChild>(button(false));
    const mounted = mountRuntime(Column({}, children));
    mounted.frame();
    const focused = target!;
    mounted.runtime.services.get(FocusService).focus(focused);
    expect(focused.decorations).toBeNull();

    children.next(button(true));
    mounted.frame();

    expect(target).toBe(focused);
    expect(focused.decorations).toHaveLength(1);
  });
});

describe('decorations that change while they are on screen', () => {
  it('follows an Observable of shapes', () => {
    const shapes = new BehaviorSubject<readonly DecorationShape[]>(RING);
    const { node } = build(Box({ modifiers: [decorated(shapes)] }));
    expect(node.decorations).toEqual(RING);

    shapes.next(BADGE);
    expect(node.decorations).toEqual(BADGE);
  });

  it('marks the node for repaint on every emission', () => {
    const shapes = new BehaviorSubject<readonly DecorationShape[]>(RING);
    const { graph, node } = build(Box({ modifiers: [decorated(shapes)] }));
    graph.clearDirty(node);
    expect(node.dirtyFlags & DirtyFlags.Paint).toBe(0);

    shapes.next(BADGE);
    expect(node.dirtyFlags & DirtyFlags.Paint).not.toBe(0);
  });

  it('stops drawing from the old Observable when a new one replaces it', () => {
    const first = new BehaviorSubject<readonly DecorationShape[]>(RING);
    const second = new BehaviorSubject<readonly DecorationShape[]>(BADGE);
    const { node, rebuild } = build(Box({ modifiers: [decorated(first)] }));
    rebuild(Box({ modifiers: [decorated(second)] }));
    expect(node.decorations).toEqual(BADGE);

    // Two live subscriptions would have the old one paint over the new.
    first.next(RING);
    expect(node.decorations).toEqual(BADGE);
  });

  it('stops drawing once the modifier is gone', () => {
    const shapes = new BehaviorSubject<readonly DecorationShape[]>(RING);
    const { node, rebuild } = build(Box({ modifiers: [decorated(shapes)] }));
    rebuild(Box({}));
    expect(node.decorations).toBeNull();

    shapes.next(BADGE);
    expect(node.decorations).toBeNull();
  });

  it('leaves a plain array alone, which is still the common case', () => {
    const { node, rebuild } = build(Box({ modifiers: [decorated(RING)] }));
    expect(node.decorations).toEqual(RING);
    rebuild(Box({ modifiers: [decorated(BADGE)] }));
    expect(node.decorations).toEqual(BADGE);
  });
});
