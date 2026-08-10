import { describe, expect, it, vi } from 'vitest';

import { DirtyFlags } from '../DirtyFlags';
import { DirtyNodeSet } from '../DirtyNodeSet';
import { UiFrame } from './UiFrame';
import { UiManualFrameClock } from './UiFrameClock';
import { UiNode } from '../UiNode';
import { UiNodeType } from '../UiNodeType';
import { UiScheduler } from './UiScheduler';

describe('UiScheduler', () => {
  function createNode(id: string): UiNode {
    return new UiNode(id, UiNodeType.Text);
  }

  function createScheduler() {
    const clock = new UiManualFrameClock(() => {});
    const dirty = new DirtyNodeSet();
    const onFrame = vi.fn<(frame: UiFrame) => void>();
    const scheduler = new UiScheduler({
      clock: callback => {
        clock.setCallback(callback);
        return clock;
      },
      dirty,
      onFrame
    });
    return { scheduler, clock, dirty, onFrame };
  }

  describe('notifyDirty', () => {
    it('arms a frame for the first dirty mark', () => {
      const { scheduler, clock, dirty } = createScheduler();
      dirty.mark(createNode('a'));
      scheduler.notifyDirty();
      expect(clock.isPending).toBe(true);
    });

    it('does not process synchronously', () => {
      const { scheduler, dirty, onFrame } = createScheduler();
      dirty.mark(createNode('a'));
      scheduler.notifyDirty();
      expect(onFrame).not.toHaveBeenCalled();
    });

    it('coalesces marks while a frame is pending', () => {
      const { scheduler, clock, dirty, onFrame } = createScheduler();
      const a = createNode('a');
      const b = createNode('b');
      dirty.mark(a);
      scheduler.notifyDirty();
      dirty.mark(b);
      scheduler.notifyDirty();
      expect(clock.isPending).toBe(true);
      clock.tick(10);
      expect(onFrame).toHaveBeenCalledTimes(1);
      expect(onFrame.mock.calls[0][0].nodes).toEqual([a, b]);
    });
  });

  describe('processing frames', () => {
    it('delivers a frame with the dirty nodes and flags', () => {
      const { scheduler, clock, dirty, onFrame } = createScheduler();
      const a = createNode('a');
      a.dirtyFlags = DirtyFlags.Paint;
      dirty.mark(a);
      scheduler.notifyDirty();
      clock.tick(100);
      expect(onFrame).toHaveBeenCalledTimes(1);
      const frame = onFrame.mock.calls[0][0];
      expect(frame.id).toBe(0);
      expect(frame.time).toBe(100);
      expect(frame.nodes).toEqual([a]);
      expect(frame.dirtyFlagsFor(a)).toBe(DirtyFlags.Paint);
    });

    it('increments the frame id per frame', () => {
      const { scheduler, clock, dirty } = createScheduler();
      const node = createNode('a');
      dirty.mark(node);
      scheduler.notifyDirty();
      clock.tick(0);
      dirty.mark(node);
      scheduler.notifyDirty();
      clock.tick(1);
      expect(scheduler.frameCount).toBe(2);
    });

    it('clears the node dirty flags after a frame', () => {
      const { scheduler, clock, dirty } = createScheduler();
      const node = createNode('a');
      node.dirtyFlags = DirtyFlags.Content;
      dirty.mark(node);
      scheduler.notifyDirty();
      clock.tick(0);
      expect(node.dirtyFlags).toBe(DirtyFlags.None);
    });

    it('skips the callback for an empty frame', () => {
      const { scheduler, clock, onFrame } = createScheduler();
      scheduler.notifyDirty();
      clock.tick(0);
      expect(onFrame).not.toHaveBeenCalled();
      expect(scheduler.frameCount).toBe(0);
    });

    it('schedules another frame when work arrives during a frame', () => {
      const { scheduler, clock, dirty, onFrame } = createScheduler();
      const node = createNode('a');
      dirty.mark(node);
      onFrame.mockImplementation(() => {
        dirty.mark(node);
      });
      scheduler.notifyDirty();
      clock.tick(0);
      expect(clock.isPending).toBe(true);
      expect(onFrame).toHaveBeenCalledTimes(1);
      clock.tick(1);
      expect(onFrame).toHaveBeenCalledTimes(2);
    });
  });

  describe('start and stop', () => {
    it('does not arm frames while stopped', () => {
      const { scheduler, clock, dirty } = createScheduler();
      scheduler.stop();
      dirty.mark(createNode('a'));
      scheduler.notifyDirty();
      expect(clock.isPending).toBe(false);
    });

    it('arms a pending frame when restarted', () => {
      const { scheduler, clock, dirty } = createScheduler();
      scheduler.stop();
      dirty.mark(createNode('a'));
      scheduler.start();
      expect(clock.isPending).toBe(true);
    });

    it('cancels a pending frame when stopped', () => {
      const { scheduler, clock, dirty } = createScheduler();
      dirty.mark(createNode('a'));
      scheduler.notifyDirty();
      scheduler.stop();
      expect(clock.isPending).toBe(false);
    });

    it('is a no-op when started twice', () => {
      const { scheduler } = createScheduler();
      scheduler.start();
      expect(scheduler.running).toBe(true);
    });
  });

  describe('dispose', () => {
    it('cancels a pending frame', () => {
      const { scheduler, clock, dirty } = createScheduler();
      dirty.mark(createNode('a'));
      scheduler.notifyDirty();
      scheduler.dispose();
      expect(clock.isPending).toBe(false);
    });

    it('stops future frames', () => {
      const { scheduler, clock, dirty, onFrame } = createScheduler();
      scheduler.dispose();
      dirty.mark(createNode('a'));
      scheduler.notifyDirty();
      expect(clock.isPending).toBe(false);
      expect(onFrame).not.toHaveBeenCalled();
    });

    it('is safe to dispose twice', () => {
      const { scheduler } = createScheduler();
      scheduler.dispose();
      expect(() => scheduler.dispose()).not.toThrow();
    });
  });
});
