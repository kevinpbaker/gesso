import { BehaviorSubject } from 'rxjs';

import { describe, expect, it, vi } from 'vitest';

import { Column, ScrollView, Text } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import { DirtyFlags } from '../graph/DirtyFlags';
import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiFrame } from '../scheduler/UiFrame';
import { UiManualFrameClock } from '../scheduler/UiFrameClock';
import { UiScheduler } from '../scheduler/UiScheduler';
import { LayoutEngine } from './LayoutEngine';
import { Constraints } from './LayoutTypes';

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
