import { Subject } from 'rxjs';

import { describe, expect, it, vi } from 'vitest';

import { DirtyFlags } from '../DirtyFlags';
import { UiFrame } from './UiFrame';
import { UiManualFrameClock } from './UiFrameClock';
import { UiGraph } from '../UiGraph';
import { UiNodeType } from '../UiNodeType';
import { UiScheduler } from './UiScheduler';
import { Text } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';

describe('UiGraph with UiScheduler', () => {
  function createRenderedGraph() {
    const graph = new UiGraph();
    const clock = new UiManualFrameClock(() => {});
    const onFrame = vi.fn<(frame: UiFrame) => void>();
    const scheduler = new UiScheduler({
      clock: callback => {
        clock.setCallback(callback);
        return clock;
      },
      dirty: graph.getDirtyNodes(),
      onFrame
    });
    graph.setDirtyListener(() => scheduler.notifyDirty());
    return { graph, clock, scheduler, onFrame };
  }

  describe('rendering boundary', () => {
    it('does not render when an observable emits', () => {
      const { graph, clock, onFrame } = createRenderedGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      graph.bind(node, 'text', subject, DirtyFlags.Content);
      subject.next('Hello');
      expect(node.properties.get('text')).toBe('Hello');
      expect(node.isDirty()).toBe(true);
      expect(onFrame).not.toHaveBeenCalled();
      expect(clock.isPending).toBe(true);
    });

    it('processes the dirty node on the next frame', () => {
      const { graph, clock, onFrame } = createRenderedGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      graph.bind(node, 'text', subject, DirtyFlags.Content | DirtyFlags.Paint);
      subject.next('Hello');
      clock.tick(50);
      expect(onFrame).toHaveBeenCalledTimes(1);
      const frame = onFrame.mock.calls[0][0];
      expect(frame.time).toBe(50);
      expect(frame.nodes).toEqual([node]);
      expect(frame.dirtyFlagsFor(node)).toBe(DirtyFlags.Content | DirtyFlags.Paint);
      expect(node.isDirty()).toBe(false);
    });

    it('coalesces multiple emissions into one frame', () => {
      const { graph, clock, onFrame } = createRenderedGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      graph.bind(node, 'text', subject, DirtyFlags.Content);
      subject.next('A');
      subject.next('B');
      subject.next('C');
      expect(onFrame).not.toHaveBeenCalled();
      clock.tick(0);
      expect(onFrame).toHaveBeenCalledTimes(1);
      expect(node.properties.get('text')).toBe('C');
    });

    it('does not deliver a frame when the work is cleared before the tick', () => {
      const { graph, clock, onFrame } = createRenderedGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      graph.bind(node, 'text', subject, DirtyFlags.Content);
      subject.next('Hello');
      graph.clearDirty(node);
      clock.tick(0);
      expect(onFrame).not.toHaveBeenCalled();
    });

    it('schedules a new frame for dirtiness during processing', () => {
      const { graph, clock, onFrame } = createRenderedGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      graph.bind(node, 'text', subject, DirtyFlags.Content);
      onFrame.mockImplementation(() => {
        subject.next('During');
      });
      subject.next('Before');
      clock.tick(0);
      expect(onFrame).toHaveBeenCalledTimes(1);
      expect(clock.isPending).toBe(true);
      clock.tick(1);
      expect(onFrame).toHaveBeenCalledTimes(2);
      expect(node.properties.get('text')).toBe('During');
    });
  });

  describe('composition', () => {
    it('schedules dirty nodes produced by a tree build', () => {
      const { graph, clock, onFrame } = createRenderedGraph();
      const builder = new UiGraphBuilder(graph);
      const node = builder.build(Text({ text: 'Hello' }));
      clock.tick(0);
      expect(onFrame).toHaveBeenCalledTimes(1);
      const frame = onFrame.mock.calls[0][0];
      expect(frame.nodes).toContain(node);
      expect(frame.dirtyFlagsFor(node)).toBe(DirtyFlags.Properties);
    });

    it('does not schedule a frame for an unchanged rebuild', () => {
      const { graph, clock, onFrame } = createRenderedGraph();
      const builder = new UiGraphBuilder(graph);
      const node = builder.build(Text({ text: 'Hello' }));
      clock.tick(0);
      onFrame.mockClear();
      builder.build(Text({ text: 'Hello' }));
      expect(onFrame).not.toHaveBeenCalled();
      expect(node.isDirty()).toBe(false);
    });
  });
});
