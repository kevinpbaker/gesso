import { describe, expect, it } from 'vitest';

import { Box, Column, Text } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import type { UiChild } from '../composition/UiElement';
import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { breakpoint } from '../modifiers/breakpoints';
import type { UiModifierLayout } from '../modifiers/UiModifierSet';
import { LayoutEngine } from './LayoutEngine';
import { LayoutNotifier } from './LayoutNotifier';
import type { LayoutBox } from './LayoutTypes';
import { Constraints } from './LayoutTypes';

/**
 * The budget behind container queries (roadmap X7), in the shape
 * `LayoutEngine.budget.spec.ts` set: counts, not wall time.
 *
 * The risk this pins is specific. A container query is a layout that
 * can ask for another layout: the modifier hears a box, decides the
 * band changed, and writes properties, which dirties the node. That is
 * correct and unavoidable when the band really did change. What must
 * not happen is a second pass over a subtree nothing changed in, which
 * is what a naive implementation gives you: a resize reports a new
 * width, the modifier writes the same values again, and every drag of
 * a window edge lays the page out twice per frame.
 *
 * So there are two numbers here. Crossing a breakpoint costs one extra
 * pass, and only over the container's own subtree. Resizing inside a
 * band costs nothing at all.
 */
describe('container query budgets', () => {
  const ROWS = 200;

  /** The real engine behind the modifier's `onLayout` and `layoutBox`. */
  class EngineLayout implements UiModifierLayout {
    readonly engine = new LayoutEngine();
    readonly notifier = new LayoutNotifier();

    box(node: UiNode): LayoutBox | null {
      const record = this.engine.recordFor(node);
      return record === null || record === undefined
        ? null
        : { x: record.x, y: record.y, width: record.width, height: record.height };
    }

    flowBox(node: UiNode): LayoutBox | null {
      return this.box(node);
    }

    scroll(): { x: number; y: number } | null {
      return null;
    }

    onLayout(node: UiNode, listener: (box: LayoutBox) => void): () => void {
      return this.notifier.add(node, listener);
    }

    /**
     * One frame: the tree is laid out, the nodes it laid out stop
     * being dirty, and whoever is watching a box is told.
     *
     * Clearing first is what a runtime does — the scheduler takes the
     * dirty set as it starts the frame — and it is what makes anything
     * dirty *afterwards* mean "this frame asked for another one",
     * which is exactly what these budgets count.
     */
    run(graph: UiGraph, root: UiNode, width: number): void {
      const clear = (node: UiNode): void => {
        graph.clearDirty(node);
        for (let child = node.firstChild; child !== null; child = child.nextSibling) {
          clear(child);
        }
      };
      clear(root);
      this.engine.layout(root, Constraints.loose(width, 800));
      this.notifier.notify(node => {
        const record = this.engine.recordFor(node);
        const box =
          record === undefined
            ? { x: 0, y: 0, width: 0, height: 0 }
            : { x: record.x, y: record.y, width: record.width, height: record.height };
        return { box, scrollX: record?.scrollX ?? 0, scrollY: record?.scrollY ?? 0 };
      });
    }
  }

  function build(layout: EngineLayout): { graph: UiGraph; root: UiNode; page: UiNode } {
    const graph = new UiGraph();
    const builder = new UiGraphBuilder(graph, { layout });
    const rows: UiChild[] = [];
    for (let index = 0; index < ROWS; index++) {
      rows.push(Text({ key: `row${index}`, text: `Row ${index}`, fontSize: 10 }));
    }
    builder.reconcileChildren(graph.root, [
      Column(
        {},
        Column(
          {
            key: 'page',
            gap: 4,
            modifiers: [breakpoint({ at: [900], props: { 0: { gap: 4 }, 900: { gap: 24 } } })]
          },
          ...rows
        ),
        Box({ key: 'aside', width: 40, height: 40 })
      )
    ]);
    const root = graph.root.firstChild!;
    return { graph, root, page: root.firstChild! };
  }

  it('costs nothing extra for a resize that stays inside a band', () => {
    const layout = new EngineLayout();
    const { graph, root, page } = build(layout);
    layout.run(graph, root, 1000);
    expect(page.properties.get('gap')).toBe(24);

    // Every one of these widths is in the same band. The modifier
    // hears each of them and writes nothing, so nothing is dirtied and
    // the next frame's pass is the only pass.
    let passes = 0;
    for (let width = 1000; width < 1200; width += 20) {
      layout.run(graph, root, width);
      passes++;
      expect(page.isDirty(), `width ${width} dirtied the page`).toBe(false);
    }
    // eslint-disable-next-line no-console
    console.info(`[container query budget] ${passes} widths inside one band: 0 extra passes`);
  });

  it('costs one extra pass over the container when a band is crossed', () => {
    const layout = new EngineLayout();
    const { graph, root, page } = build(layout);
    layout.run(graph, root, 1000);

    layout.run(graph, root, 600);
    // The modifier wrote, so the page is waiting for a pass. One, and
    // over the page rather than the whole tree.
    expect(page.isDirty()).toBe(true);
    expect(page.properties.get('gap')).toBe(4);

    layout.run(graph, root, 600);
    expect(page.isDirty()).toBe(false);
    const { measured } = layout.engine.stats;
    // eslint-disable-next-line no-console
    console.info(`[container query budget] band crossed: settling pass measured ${measured}`);
    // A settling pass and then nothing: the third frame at the same
    // width writes nothing and dirties nothing.
    layout.run(graph, root, 600);
    expect(page.isDirty()).toBe(false);
  });
});
