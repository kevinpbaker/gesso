import { describe, expect, it, vi } from 'vitest';

import { DirtyFlags } from '../graph/DirtyFlags';
import { DirtyNodeSet } from '../graph/DirtyNodeSet';
import { UiFrame } from './UiFrame';
import { UiManualFrameClock } from './UiFrameClock';
import { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
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

    it('arms nothing for a node dirtied by the frame about to collect it', () => {
      // `beforeCollect` is where animations run, and one that writes
      // through the graph marks a node dirty from inside the frame
      // that is going to draw it. The dirty set is taken afterwards,
      // so the work lands either way; arming a frame here only adds a
      // second one with nothing left to do. Against a fixed 16ms timer
      // that spare frame was simply the next scheduled one and cost
      // nothing — against a display-paced clock it doubled the rate of
      // every page with a video playing on it.
      const clock = new UiManualFrameClock(() => {});
      const dirty = new DirtyNodeSet();
      const onFrame = vi.fn<(frame: UiFrame) => void>();
      const node = createNode('a');
      const scheduler = new UiScheduler({
        clock: callback => {
          clock.setCallback(callback);
          return clock;
        },
        dirty,
        onFrame,
        beforeCollect: () => {
          dirty.mark(node);
          scheduler.notifyDirty();
        }
      });
      scheduler.start();
      dirty.mark(node);
      scheduler.notifyDirty();
      clock.tick(0);

      expect(onFrame).toHaveBeenCalledTimes(1);
      // The node the hook dirtied was collected by this frame.
      expect(onFrame.mock.calls[0]![0].size).toBe(1);
      // And no frame was armed to collect it again.
      expect(clock.isPending).toBe(false);
    });

    it('still arms one for a change made outside a frame', () => {
      // The distinction being drawn is *when*, not who: the same call
      // from an event handler has no frame to ride on and must arm one.
      const { scheduler, clock, dirty } = createScheduler();
      scheduler.start();
      dirty.mark(createNode('a'));
      scheduler.notifyDirty();
      clock.tick(0);
      expect(clock.isPending).toBe(false);

      dirty.mark(createNode('b'));
      scheduler.notifyDirty();
      expect(clock.isPending).toBe(true);
    });

    it('lets an animation arm the next frame from inside this one', () => {
      // `wake` is the other half of the distinction: an animation has
      // nothing in the dirty set to ride on — its whole job is to keep
      // frames coming — so it asks directly and is not turned away.
      const clock = new UiManualFrameClock(() => {});
      const dirty = new DirtyNodeSet();
      let frames = 0;
      const scheduler = new UiScheduler({
        clock: callback => {
          clock.setCallback(callback);
          return clock;
        },
        dirty,
        onFrame: () => {},
        beforeCollect: () => {
          frames++;
          if (frames < 3) {
            scheduler.wake();
          }
        }
      });
      scheduler.start();
      scheduler.wake();
      clock.tick(0);
      expect(clock.isPending).toBe(true);
      clock.tick(16);
      expect(clock.isPending).toBe(true);
      clock.tick(32);
      expect(clock.isPending).toBe(false);
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

/**
 * A frame that throws must not stop the clock.
 *
 * The failure this guards against is not a crash, it is a *stop*: an
 * exception escaping a frame unwound past the re-arm at the bottom of
 * `handleFrame`, `pending` had already been cleared at the top, and
 * nothing ever asked for another frame. The last frame stayed on
 * screen, every click landed in a surface nobody was listening to,
 * and a debugger attached to the worker found nothing running and
 * nothing to pause — indistinguishable from a hang, and silent.
 *
 * Found by typing quickly into a spreadsheet.
 */
describe('a frame that throws', () => {
  const makeNode = () => new UiNode('dirty', UiNodeType.Text);

  function failing(times: number) {
    const clock = new UiManualFrameClock(() => {});
    const dirty = new DirtyNodeSet();
    const errors: unknown[] = [];
    let frames = 0;
    const scheduler = new UiScheduler({
      clock: onFrame => {
        clock.setCallback(onFrame);
        return clock;
      },
      dirty,
      onFrame: () => {
        frames++;
        if (frames <= times) {
          throw new Error(`frame ${frames} is broken`);
        }
      },
      onFrameError: error => errors.push(error)
    });
    return { clock, dirty, scheduler, errors, frames: () => frames };
  }

  it('reports the error rather than letting it escape', () => {
    const h = failing(1);
    const node = makeNode();
    h.dirty.mark(node);
    h.scheduler.notifyDirty();

    expect(() => h.clock.tick(0)).not.toThrow();
    expect(h.errors).toHaveLength(1);
    expect((h.errors[0] as Error).message).toBe('frame 1 is broken');
  });

  /** The line that decides whether this is a bad frame or the end. */
  it('keeps asking for frames afterwards', () => {
    const h = failing(1);
    const node = makeNode();
    h.dirty.mark(node);
    h.scheduler.notifyDirty();
    h.clock.tick(0);

    // The frame threw before it could clear the node, so there is
    // still work and the clock must have been asked again.
    h.dirty.mark(node);
    h.scheduler.notifyDirty();
    expect(() => h.clock.tick(1)).not.toThrow();
    expect(h.frames()).toBe(2);
  });

  it('recovers completely once the frames stop throwing', () => {
    const h = failing(2);
    const node = makeNode();
    for (let at = 0; at < 4; at++) {
      h.dirty.mark(node);
      h.scheduler.notifyDirty();
      if (h.scheduler.framePending) {
        h.clock.tick(at);
      }
    }
    expect(h.errors).toHaveLength(2);
    expect(h.frames()).toBeGreaterThanOrEqual(3);
  });

  it('is not left mid-collection when the collection itself throws', () => {
    const clock = new UiManualFrameClock(() => {});
    const dirty = new DirtyNodeSet();
    const errors: unknown[] = [];
    const scheduler = new UiScheduler({
      clock: onFrame => {
        clock.setCallback(onFrame);
        return clock;
      },
      dirty,
      beforeCollect: () => {
        throw new Error('before collect is broken');
      },
      onFrame: () => {},
      onFrameError: error => errors.push(error)
    });
    const node = makeNode();
    dirty.mark(node);
    scheduler.notifyDirty();
    expect(() => clock.tick(0)).not.toThrow();
    expect(errors).toHaveLength(1);

    // `collecting` has to be false again, or every later dirty mark is
    // swallowed by the guard in `notifyDirty` and the clock is never
    // armed again — the same silent stop by another route.
    dirty.mark(node);
    scheduler.notifyDirty();
    expect(scheduler.framePending).toBe(true);
  });
});
