import { describe, expect, it } from 'vitest';

import { Box, Column } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import type { UiChild } from '../composition/UiElement';
import { Responsive } from '../composition/UiResponsive';
import { UiContainerSizeSource, bandOf } from '../environment/UiContainerSize';
import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import { UiGraph } from '../graph/UiGraph';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { UiModifierLayout } from './UiModifierSet';
import { breakpoint, sizeContainer } from './breakpoints';

/**
 * Container queries: a layout that branches on the room
 * it has rather than on the size of the window.
 *
 * Layout is supplied by hand here, the way `drop.spec.ts` does it: a
 * frame is a box written and its listeners told, which is exactly what
 * these modifiers consume. What the specs are about is the *band* —
 * that a resize inside one changes nothing, which is what keeps a
 * window drag from rebuilding a subtree per frame.
 */
class Boxes implements UiModifierLayout {
  private readonly boxes = new Map<UiNode, LayoutBox>();
  private readonly listeners = new Map<UiNode, Set<(box: LayoutBox) => void>>();

  place(node: UiNode, box: LayoutBox): void {
    this.boxes.set(node, box);
    for (const listener of this.listeners.get(node) ?? []) {
      listener(box);
    }
  }

  box(node: UiNode): LayoutBox | null {
    return this.boxes.get(node) ?? null;
  }

  flowBox(node: UiNode): LayoutBox | null {
    return this.box(node);
  }

  scroll(): { x: number; y: number } | null {
    return null;
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
  const builder = new UiGraphBuilder(graph, { layout });
  builder.reconcileChildren(graph.root, [root]);
  return { graph, node: graph.root.firstChild! };
}

/**
 * How many real children a node has, fragments expanded: an observable
 * child is reconciled inside a fragment anchor, and `Responsive`'s
 * children are one observable.
 */
function childCount(node: UiNode): number {
  let count = 0;
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    count += child.type === UiNodeType.Fragment ? childCount(child) : 1;
  }
  return count;
}

describe('bandOf', () => {
  it('gives the widest breakpoint a width has reached, and zero below the first', () => {
    expect(bandOf(320, [600, 1200])).toBe(0);
    expect(bandOf(600, [600, 1200])).toBe(600);
    expect(bandOf(1199, [600, 1200])).toBe(600);
    expect(bandOf(1200, [600, 1200])).toBe(1200);
    expect(bandOf(4000, [600, 1200])).toBe(1200);
  });
});

describe('sizeContainer', () => {
  it('reports the content box, not the border box', () => {
    const layout = new Boxes();
    const source = new UiContainerSizeSource();
    const { node } = build(Column({ paddingX: 20, paddingY: 10, modifiers: [sizeContainer({ source })] }), layout);
    layout.place(node, { x: 0, y: 0, width: 800, height: 600 });
    expect(source.current).toEqual({ width: 760, height: 580 });
  });

  it('says nothing when a frame moves the box without resizing it', () => {
    const layout = new Boxes();
    const source = new UiContainerSizeSource();
    const { node } = build(Column({ modifiers: [sizeContainer({ source })] }), layout);
    layout.place(node, { x: 0, y: 0, width: 800, height: 600 });
    const seen: number[] = [];
    const subscription = source.changes.subscribe(size => seen.push(size.width));
    layout.place(node, { x: 0, y: -400, width: 800, height: 600 });
    subscription.unsubscribe();
    expect(seen).toEqual([800]);
  });
});

describe('breakpoint', () => {
  it('writes the properties of the band once the node has a box', () => {
    const layout = new Boxes();
    const { node } = build(
      Column({
        paddingX: 4,
        modifiers: [breakpoint({ at: [900], props: { 0: { paddingX: 12 }, 900: { paddingX: 32 } } })]
      }),
      layout
    );
    // Nothing before the first layout: the element's own value stands.
    expect(node.properties.get('paddingX')).toBe(4);
    layout.place(node, { x: 0, y: 0, width: 400, height: 100 });
    expect(node.properties.get('paddingX')).toBe(12);
    layout.place(node, { x: 0, y: 0, width: 1000, height: 100 });
    expect(node.properties.get('paddingX')).toBe(32);
  });

  it('carries the narrower bands forward, so a band only names what it changes', () => {
    const layout = new Boxes();
    const { node } = build(
      Column({
        modifiers: [
          breakpoint({
            at: [900],
            props: { 0: { paddingX: 12, gap: 8 }, 900: { paddingX: 32 } }
          })
        ]
      }),
      layout
    );
    layout.place(node, { x: 0, y: 0, width: 1000, height: 100 });
    expect(node.properties.get('paddingX')).toBe(32);
    expect(node.properties.get('gap')).toBe(8);
  });

  it('writes nothing for a resize that stays inside a band', () => {
    const layout = new Boxes();
    let writes = 0;
    const { node } = build(
      Column({ modifiers: [breakpoint({ at: [900], props: { 0: { gap: 8 }, 900: { gap: 24 } } })] }),
      layout
    );
    layout.place(node, { x: 0, y: 0, width: 1000, height: 100 });
    const original = node.setProperty.bind(node);
    node.setProperty = ((name: string, value: unknown) => {
      writes++;
      return original(name, value);
    }) as typeof node.setProperty;
    for (let width = 1000; width < 1200; width += 10) {
      layout.place(node, { x: 0, y: 0, width, height: 100 });
    }
    expect(writes).toBe(0);
  });
});

describe('Responsive', () => {
  it('builds its children once per band, not once per width', () => {
    const layout = new Boxes();
    const builds: number[] = [];
    const { node } = build(
      Responsive({ at: [900] }, size => {
        builds.push(size.width);
        return size.width >= 900 ? [Box({ key: 'a' }), Box({ key: 'b' })] : [Box({ key: 'a' })];
      }),
      layout
    );
    // Built once at zero, before anything has been laid out.
    expect(builds).toEqual([0]);
    expect(childCount(node)).toBe(1);

    layout.place(node, { x: 0, y: 0, width: 400, height: 100 });
    layout.place(node, { x: 0, y: 0, width: 700, height: 100 });
    expect(builds).toEqual([0]);

    layout.place(node, { x: 0, y: 0, width: 1000, height: 100 });
    expect(builds).toEqual([0, 1000]);
    expect(childCount(node)).toBe(2);

    layout.place(node, { x: 0, y: 0, width: 1400, height: 100 });
    expect(builds).toEqual([0, 1000]);
  });

  it('provides its size to the subtree', () => {
    const layout = new Boxes();
    const { node } = build(
      Responsive({ at: [900] }, () => Box({ key: 'only' })),
      layout
    );
    layout.place(node, { x: 0, y: 0, width: 640, height: 480 });
    const inside = node.firstChild!;
    expect(inside.environment!.get(UiEnvironmentKeys.containerSize).current).toEqual({ width: 640, height: 480 });
  });

  it('resolves to a source nothing measures outside a container', () => {
    const layout = new Boxes();
    const { node } = build(Column({}, Box({})), layout);
    expect(node.environment!.get(UiEnvironmentKeys.containerSize).current).toEqual({ width: 0, height: 0 });
  });
});
