import { afterEach, describe, expect, it, vi } from 'vitest';

import { DirtyFlags } from '../graph/DirtyFlags';
import { DirtyNodeSet } from '../graph/DirtyNodeSet';
import { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { MARK_PREFIX, measureSpan, performanceMarksEnabled, setPerformanceMarks } from './PerformanceMarks';
import { UiManualFrameClock } from './UiFrameClock';
import { UiScheduler } from './UiScheduler';

/** Records what the browser would have been told, without a real timeline. */
function captureMeasures() {
  const names: string[] = [];
  const spy = vi.spyOn(performance, 'measure').mockImplementation(name => {
    names.push(String(name));
    return undefined as unknown as PerformanceMeasure;
  });
  return { names, restore: () => spy.mockRestore() };
}

afterEach(() => {
  setPerformanceMarks(false);
  vi.restoreAllMocks();
});

describe('performance marks', () => {
  it('are off until something asks', () => {
    expect(performanceMarksEnabled()).toBe(false);
    const { names } = captureMeasures();

    measureSpan('layout', 0, 1);

    expect(names).toEqual([]);
  });

  it('name the framework, so a recording can be filtered down to it', () => {
    const { names } = captureMeasures();
    setPerformanceMarks(true);

    measureSpan('layout', 0, 1);

    expect(names).toEqual([`${MARK_PREFIX} layout`]);
  });

  it('never let instrumentation throw out into the frame it is describing', () => {
    setPerformanceMarks(true);
    vi.spyOn(performance, 'measure').mockImplementation(() => {
      throw new Error('the entry buffer is full');
    });

    expect(() => measureSpan('layout', 0, 1)).not.toThrow();
  });
});

describe('the scheduler, while marks are on', () => {
  function scheduler(): { clock: UiManualFrameClock; draw: () => void } {
    const clock = new UiManualFrameClock(() => {});
    const dirty = new DirtyNodeSet();
    const scheduler = new UiScheduler({
      clock: callback => {
        clock.setCallback(callback);
        return clock;
      },
      dirty,
      onFrame: () => {},
      beforeCollect: () => {}
    });
    return {
      clock,
      draw: () => {
        dirty.mark(node());
        scheduler.notifyDirty();
        clock.tick(16);
      }
    };
  }

  it('names the three parts of a frame whose boundaries it owns', () => {
    const { names } = captureMeasures();
    const { draw } = scheduler();
    setPerformanceMarks(true);

    draw();

    expect(names).toEqual([
      `${MARK_PREFIX} before collect`,
      `${MARK_PREFIX} collect`,
      `${MARK_PREFIX} process`,
      `${MARK_PREFIX} frame`
    ]);
  });

  it('reads the clock for none of it while nothing is recording', () => {
    const now = vi.spyOn(performance, 'now');
    const { draw } = scheduler();
    const before = now.mock.calls.length;

    draw();

    // The cost of the instrumentation on a frame nobody is profiling
    // is the boolean that decided not to take these readings.
    expect(now.mock.calls.length).toBe(before);
  });
});

function node(): UiNode {
  const created = new UiNode('n1', UiNodeType.Box);
  created.dirtyFlags = DirtyFlags.Layout;
  return created;
}
