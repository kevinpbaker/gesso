import { BehaviorSubject, map } from 'rxjs';

import { describe, expect, it, vi } from 'vitest';

import { Box, Column, EditableText, Row, ScrollView, Text } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import { DirtyFlags } from '../graph/DirtyFlags';
import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiFrame } from '../scheduler/UiFrame';
import { UiManualFrameClock } from '../scheduler/UiFrameClock';
import { UiScheduler } from '../scheduler/UiScheduler';
import { LayoutEngine } from './LayoutEngine';
import { Constraints } from './LayoutTypes';
import { percent } from './UiLength';

describe('LayoutEngine invalidation', () => {
  function createHarness(constraints: Constraints = Constraints.loose(400, 400)) {
    const graph = new UiGraph();
    const engine = new LayoutEngine();
    const clock = new UiManualFrameClock(() => {});
    const builder = new UiGraphBuilder(graph);
    let root: UiNode | undefined;
    const onFrame = vi.fn((frame: UiFrame) => {
      engine.layoutForFrame(frame, constraints, root!);
    });
    const scheduler = new UiScheduler({
      clock: callback => {
        clock.setCallback(callback);
        return clock;
      },
      dirty: graph.getDirtyNodes(),
      onFrame
    });
    graph.setDirtyListener(() => scheduler.notifyDirty());
    graph.setNodeRemovedListener(node => engine.detachNode(node));
    return {
      graph,
      engine,
      clock,
      builder,
      scheduler,
      onFrame,
      get root() {
        if (root === undefined) {
          throw new Error('No root built yet.');
        }
        return root;
      },
      set root(node: UiNode | undefined) {
        root = node;
      }
    };
  }

  function firstFrame(h: ReturnType<typeof createHarness>): UiFrame {
    h.clock.tick(0);
    return h.onFrame.mock.calls[0][0];
  }

  describe('build and measure', () => {
    it('lays out the initial build', () => {
      const h = createHarness();
      h.root = h.builder.build(Column({ x: 'start' }, Text({ text: 'Hello', fontSize: 10 })));
      firstFrame(h);
      const text = h.root.firstChild!;
      expect(h.engine.recordFor(text)!.measuredWidth).toBe(30);
      expect(h.engine.recordFor(text)!.measuredHeight).toBe(12);
    });
  });

  describe('property invalidation', () => {
    it('re-measures a text node when its content changes', () => {
      const h = createHarness();
      h.root = h.builder.build(Column({ x: 'start' }, Text({ text: 'Hello', fontSize: 10 })));
      firstFrame(h);
      const text = h.root.firstChild!;
      expect(h.engine.recordFor(text)!.measuredWidth).toBe(30);

      h.graph.updateProperty(text.id, 'text', 'HelloWorld', DirtyFlags.Content | DirtyFlags.Layout);
      h.clock.tick(0);
      expect(h.engine.recordFor(text)!.measuredWidth).toBe(60);
    });

    it('re-measures when a layout property changes', () => {
      const h = createHarness();
      h.root = h.builder.build(Column({ x: 'start' }, Text({ text: 'Hello', fontSize: 10 })));
      firstFrame(h);
      const root = h.root;
      const text = root.firstChild!;
      expect(h.engine.recordFor(text)!.measuredWidth).toBe(30);
      expect(h.engine.recordFor(text)!.x).toBe(0);

      h.graph.updateProperty(root.id, 'padding', 10, DirtyFlags.Layout);
      h.clock.tick(0);
      expect(h.engine.recordFor(text)!.measuredWidth).toBe(30);
      expect(h.engine.recordFor(text)!.x).toBe(10);
    });

    it('skips measurement for a transform-only change', () => {
      const h = createHarness();
      h.root = h.builder.build(
        Column(
          ScrollView(
            { width: 200, height: 100 },
            Text({ text: 'A', fontSize: 50 }),
            Text({ text: 'B', fontSize: 50 }),
            Text({ text: 'C', fontSize: 50 })
          )
        )
      );
      const scroll = h.root.firstChild!;
      firstFrame(h);
      expect(h.engine.recordFor(scroll)!.scrollY).toBe(0);
      expect(h.engine.recordFor(scroll)!.contentHeight).toBe(180);

      h.graph.updateProperty(scroll.id, 'scrollY', 30, DirtyFlags.Transform);
      h.clock.tick(0);
      expect(h.engine.recordFor(scroll)!.scrollY).toBe(30);
    });

    it('clears dirty state after the frame', () => {
      const h = createHarness();
      h.root = h.builder.build(Column({ x: 'start' }, Text({ text: 'Hello', fontSize: 10 })));
      const text = h.root.firstChild!;
      firstFrame(h);
      expect(text.isDirty()).toBe(false);
    });
  });

  describe('structure invalidation', () => {
    it('drops layout records for removed nodes', () => {
      const h = createHarness();
      h.root = h.builder.build(Column(Text({ text: 'A' }), Text({ text: 'B' })));
      firstFrame(h);
      const second = h.root.lastChild!;
      expect(h.engine.recordFor(second)).toBeDefined();

      h.root = h.builder.build(Column(Text({ text: 'A' })));
      h.clock.tick(0);
      expect(h.engine.recordFor(second)).toBeUndefined();
    });

    it('lays out newly added children', () => {
      const h = createHarness();
      h.root = h.builder.build(Column(Text({ text: 'A', fontSize: 10 })));
      firstFrame(h);
      expect(h.root.firstChild!.nextSibling).toBeNull();

      h.root = h.builder.build(Column(Text({ text: 'A', fontSize: 10 }), Text({ text: 'B', fontSize: 10 })));
      h.clock.tick(0);
      const second = h.root.firstChild!.nextSibling!;
      expect(h.engine.recordFor(second)).toBeDefined();
      expect(h.engine.recordFor(second)!.y).toBe(12);
    });
  });

  describe('node type handling', () => {
    it('lays out a ScrollView subtree built via the builder', () => {
      const h = createHarness();
      h.root = h.builder.build(Column(ScrollView({ width: 200, height: 100 }, Text({ text: 'Hello', fontSize: 10 }))));
      firstFrame(h);
      const scroll = h.root.firstChild!;
      const rec = h.engine.recordFor(scroll)!;
      expect(rec.width).toBe(200);
      expect(rec.height).toBe(100);
      expect(h.engine.recordFor(scroll.firstChild!)).toBeDefined();
    });
  });

  describe('declarative props', () => {
    it('lays out a Column built with gap and padding props', () => {
      const h = createHarness();
      h.root = h.builder.build(
        Column({ gap: 8, padding: 4 }, Text({ text: 'Hello', fontSize: 10 }), Text({ text: 'World', fontSize: 10 }))
      );
      firstFrame(h);
      const first = h.root.firstChild!;
      const second = first.nextSibling!;
      expect(h.engine.recordFor(first)!.x).toBe(4);
      expect(h.engine.recordFor(first)!.y).toBe(4);
      expect(h.engine.recordFor(second)!.x).toBe(4);
      expect(h.engine.recordFor(second)!.y).toBe(24);
    });

    it('re-lays out when a declarative gap prop changes via binding', () => {
      const h = createHarness();
      const gap$ = new BehaviorSubject(8);
      h.root = h.builder.build(
        Column({ gap: gap$, padding: 4 }, Text({ text: 'Hello', fontSize: 10 }), Text({ text: 'World', fontSize: 10 }))
      );
      firstFrame(h);
      const second = h.root.firstChild!.nextSibling!;
      expect(h.engine.recordFor(second)!.y).toBe(24);

      gap$.next(20);
      h.clock.tick(0);
      expect(h.engine.recordFor(second)!.y).toBe(36);
    });
  });

  describe('resolved property memo', () => {
    it('re-reads a margin the previous frame already resolved', () => {
      // A node's resolved properties are memoized for the length of one
      // pass and the stamp is then left on the record, which is only
      // safe because every pass has a new number. Records survive an
      // incremental frame (a full `layout` throws them away, so this is
      // the path where a stamp could be believed twice), so this is
      // what says the counter is bumped per frame and not per engine.
      const h = createHarness();
      const marginLeft$ = new BehaviorSubject(5);
      h.root = h.builder.build(Column(Text({ text: 'Hello', fontSize: 10, marginLeft: marginLeft$ })));
      firstFrame(h);
      const text = h.root.firstChild!;
      expect(h.engine.recordFor(text)!.x).toBe(5);

      marginLeft$.next(30);
      h.clock.tick(0);
      expect(h.engine.recordFor(text)!.x).toBe(30);
    });
  });

  describe('paint extents', () => {
    it('grows the extent of ancestors a frame did not place when a descendant moves past them', () => {
      // The wrapper is 50 tall, and the badge inside it moves to 200: the
      // frame lays out from the badge's container, so the wrapper and the
      // root are never placed, and a renderer culling by their stale
      // extents would drop the badge.
      const h = createHarness(Constraints.tight(400, 400));
      const top = new BehaviorSubject(10);
      const badge = Box({ position: 'absolute', top, left: 10, width: 30, height: 30 });
      h.root = h.builder.build(
        Column({ x: 'stretch' }, Box({ height: 50, position: 'relative' }, Box({ width: 100, height: 40 }, badge)))
      );
      firstFrame(h);
      const wrapper = h.root.firstChild!;
      expect(h.engine.recordFor(wrapper)!.extentMaxY).toBe(50);
      top.next(200);
      h.clock.tick(0);
      const extent = h.engine.recordFor(wrapper)!;
      expect(extent.extentMaxY).toBeGreaterThanOrEqual(230);
      expect(h.engine.recordFor(h.root)!.extentMaxY).toBeGreaterThanOrEqual(230);
    });
  });

  describe('scroll offsets', () => {
    it("clamps the offsets of the fields a frame laid out, not every field's", () => {
      // A document of fields: typing into one lays out that one, and a
      // frame that clamped every field's text scroll did five thousand
      // in a 5,000-line document for each key.
      const h = createHarness(Constraints.tight(400, 4000));
      const texts = Array.from({ length: 200 }, (_, i) => new BehaviorSubject(`Line ${i}`));
      h.root = h.builder.build(
        Column({ x: 'stretch' }, ...texts.map(text => EditableText({ value: text, fontSize: 10 })))
      );
      firstFrame(h);
      const clamp = vi.spyOn(
        h.engine as unknown as { applyScrollOffset(node: UiNode, field: boolean): void },
        'applyScrollOffset'
      );
      texts[7]!.next('Line 7, edited');
      h.clock.tick(0);
      expect(clamp.mock.calls.length).toBeLessThan(5);
    });
  });

  describe('a size taken from content', () => {
    /**
     * A column whose last item grows from its content, holding a page
     * that is 100% of it and a list that grows to fill the page: the
     * shape of an application shell. The item's flex base is the page's
     * content, measured while the 100% has nothing to resolve against,
     * so content arriving in the list changes how the column shares its
     * height. Laid out again from the root, the bar above has shrunk;
     * the frame has to agree, however deep the change was.
     */
    function shell(rows: BehaviorSubject<number>, list: 'column' | 'scroll') {
      const content = Box({ height: rows, flexShrink: 0 });
      return Column(
        { height: 300, x: 'stretch' },
        Row({ height: 48 }, Box({ width: 10, height: 26 })),
        Box(
          { flexGrow: 1, minHeight: 0, x: 'stretch', y: 'stretch' },
          Column(
            { height: percent(100) },
            list === 'scroll'
              ? ScrollView({ flexGrow: 1 }, Column({ height: percent(100) }, content))
              : Column({ flexGrow: 1 }, content)
          )
        )
      );
    }

    it('lets a lone item that fills its line bound a relayout below it', () => {
      // An application shell: a row holding one region that grows and
      // shrinks to fill it, and a list inside that region. The region's
      // base is its content, but nothing about the base can change its
      // size, so the rows coming and going in the list are laid out
      // from near the list, not from the root.
      const h = createHarness(Constraints.tight(400, 300));
      const rows = new BehaviorSubject(5);
      const list = ScrollView(
        { flexGrow: 1, flexBasis: 0 },
        rows.pipe(map(n => Array.from({ length: n }, (_, i) => Box({ key: String(i), height: 20, flexShrink: 0 }))))
      );
      h.root = h.builder.build(
        Row(
          { width: 400, height: 300 },
          Row({ flexGrow: 1, minWidth: 0 }, Column({ width: percent(100), height: percent(100) }, list))
        )
      );
      firstFrame(h);
      rows.next(6);
      h.clock.tick(0);
      expect(h.engine.stats.fullLayout).toBe(false);
      expect(h.engine.stats.measured).toBeLessThan(6);
    });

    for (const list of ['column', 'scroll'] as const) {
      it(`re-measures the flex base when content arrives below a boundary (${list})`, () => {
        const h = createHarness(Constraints.tight(400, 300));
        const rows = new BehaviorSubject(10);
        h.root = h.builder.build(shell(rows, list));
        firstFrame(h);
        const bar = h.root.firstChild!;
        expect(h.engine.recordFor(bar)!.height).toBe(48);

        rows.next(2000);
        h.clock.tick(0);
        const fresh = new LayoutEngine();
        fresh.layout(h.root, Constraints.tight(400, 300));
        expect(fresh.recordFor(bar)!.height).toBe(26);
        expect(h.engine.recordFor(bar)!.height).toBe(26);
      });
    }
  });

  it('marks the parent dirty when children change via build', () => {
    const h = createHarness();
    h.root = h.builder.build(Column(Text({ text: 'A' })));
    firstFrame(h);
    h.onFrame.mockClear();

    h.root = h.builder.build(Column(Text({ text: 'A' }), Text({ text: 'B' })));
    const frame = firstFrame(h);
    expect(frame.nodes).toContain(h.root);
    expect(frame.dirtyFlagsFor(h.root)).toBe(DirtyFlags.Children);
  });
});
