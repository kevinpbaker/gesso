import { describe, expect, it } from 'vitest';

import { Box, Column } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import type { UiChild } from '../composition/UiElement';
import { UiInsetRegistry } from '../environment/UiInsets';
import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { UiModifierEnvironment, UiModifierLayout } from './UiModifierSet';
import { insetPadding, publishInset } from './insets';

/**
 * Insets: a floating bar publishes the room it takes and
 * the screens behind it keep clear of it, without either knowing about
 * the other.
 *
 * Layout is supplied by hand, as in `breakpoints.spec.ts`: what these
 * modifiers consume is a box and a notification, and building a real
 * runtime to get one would test the runtime instead.
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

/**
 * What the runtime gives a modifier for `host.environment`. Without
 * one every key answers with its default, which for the inset key is a
 * registry shared by every runtime in the process, so a spec without
 * this would be publishing into the same object as the one before it.
 */
const environment: UiModifierEnvironment = {
  read: (node, key) => node.environment?.get(key) ?? key.defaultValue,
  onChange: () => () => {}
};

function build(root: UiChild, layout: Boxes) {
  const graph = new UiGraph();
  const builder = new UiGraphBuilder(graph, { layout, environment });
  builder.reconcileChildren(graph.root, [root]);
  return {
    graph,
    node: graph.root.firstChild!,
    rebuild: (next: readonly UiChild[]) => builder.reconcileChildren(graph.root, next)
  };
}

describe('publishInset', () => {
  it('publishes the height of the node on a horizontal edge', () => {
    const layout = new Boxes();
    const insets = new UiInsetRegistry();
    const { node } = build(Column({ insets }, Box({ modifiers: [publishInset({ edge: 'bottom' })] })), layout);
    const bar = node.firstChild!;
    layout.place(bar, { x: 0, y: 512, width: 800, height: 88 });
    expect(insets.current.bottom).toBe(88);
  });

  it('follows a bar that grows', () => {
    const layout = new Boxes();
    const insets = new UiInsetRegistry();
    const { node } = build(Column({ insets }, Box({ modifiers: [publishInset({ edge: 'bottom' })] })), layout);
    const bar = node.firstChild!;
    layout.place(bar, { x: 0, y: 512, width: 800, height: 88 });
    layout.place(bar, { x: 0, y: 400, width: 800, height: 200 });
    expect(insets.current.bottom).toBe(200);
  });

  it('gives the room back when the bar unmounts', () => {
    const layout = new Boxes();
    const insets = new UiInsetRegistry();
    const { node, rebuild } = build(
      Column({ insets }, Box({ key: 'bar', modifiers: [publishInset({ edge: 'bottom' })] })),
      layout
    );
    const bar = node.firstChild!;
    layout.place(bar, { x: 0, y: 512, width: 800, height: 88 });
    expect(insets.current.bottom).toBe(88);

    rebuild([Column({ insets })]);
    expect(insets.current.bottom).toBe(0);
  });

  it('takes an extent when the box is not the answer', () => {
    const layout = new Boxes();
    const insets = new UiInsetRegistry();
    const { node } = build(
      Column({ insets }, Box({ modifiers: [publishInset({ edge: 'left', extent: 240 })] })),
      layout
    );
    layout.place(node.firstChild!, { x: 0, y: 0, width: 1, height: 1 });
    expect(insets.current.left).toBe(240);
  });
});

describe('insetPadding', () => {
  it('adds whatever is published to the padding it was asked for', () => {
    const layout = new Boxes();
    const insets = new UiInsetRegistry();
    const { node } = build(Column({ insets }, Column({ modifiers: [insetPadding({ bottom: 40 })] })), layout);
    const page = node.firstChild!;
    expect(page.properties.get('paddingBottom')).toBe(40);

    const bar = insets.publish({ bottom: 88 });
    expect(page.properties.get('paddingBottom')).toBe(128);

    bar();
    expect(page.properties.get('paddingBottom')).toBe(40);
  });

  it('writes only the edges it was given', () => {
    const layout = new Boxes();
    const insets = new UiInsetRegistry();
    const { node } = build(
      Column({ insets }, Column({ paddingTop: 74, modifiers: [insetPadding({ bottom: 40 })] })),
      layout
    );
    const page = node.firstChild!;
    insets.publish({ top: 44, bottom: 88 });
    expect(page.properties.get('paddingTop')).toBe(74);
    expect(page.properties.get('paddingBottom')).toBe(128);
  });

  it('lets a screen keep clear of a bar it knows nothing about', () => {
    const layout = new Boxes();
    const insets = new UiInsetRegistry();
    const { node } = build(
      Column(
        { insets },
        Column({ key: 'page', modifiers: [insetPadding({ bottom: 40 })] }),
        Box({ key: 'bar', modifiers: [publishInset({ edge: 'bottom' })] })
      ),
      layout
    );
    const page = node.firstChild!;
    const bar = node.lastChild!;
    layout.place(bar, { x: 0, y: 512, width: 800, height: 88 });
    expect(page.properties.get('paddingBottom')).toBe(128);
  });
});
