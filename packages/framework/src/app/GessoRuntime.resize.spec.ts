import { describe, expect, it } from 'vitest';

import { Box, Column, Text } from 'gesso-core';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * What a window drag costs.
 *
 * `resize` used to call `engine.layout()` — the mount path, which
 * retires every layout record and hands each one back through
 * `LayoutRecord.reset()`. That restores `measureDirty` and clears
 * `lastConstraints`, so the measure memo for the whole tree is
 * discarded and the next pass is cold. A drag delivers a resize per
 * frame, so every frame of one paid a mount.
 *
 * The tree does not change when a window does, so the memo is exactly
 * what should survive. These specs assert both halves of that: a later
 * size re-measures only what it genuinely changed, and the first size
 * still lays the tree out with no frame to do it.
 *
 * The counts come from `FrameMetrics.measured`, which is the engine's
 * own `stats.measured` for the frame — and `resize` flushes a frame
 * synchronously, so the last entry in `frames` is the resize's own.
 */
describe('what a resize re-measures', () => {
  const ROWS = 60;

  /** Fixed-height, full-width rows: a taller window changes no child's constraints. */
  function list() {
    const rows = [];
    for (let i = 0; i < ROWS; i++) {
      rows.push(
        Column(
          { height: 40, padding: 4 },
          Box({ width: 30, height: 30 }),
          Text({ text: `Row number ${i}`, fontSize: 12 })
        )
      );
    }
    return Column({}, ...rows);
  }

  /** Drains whatever the mount asked for, so what follows is a settled app. */
  function settle(mounted: ReturnType<typeof mountRuntime>): void {
    let guard = 0;
    while (mounted.clock.isPending && guard++ < 100) {
      mounted.frame();
    }
  }

  it('re-measures almost nothing when only the height changes', () => {
    const mounted = mountRuntime(list());
    settle(mounted);
    const before = mounted.frames.length;

    mounted.runtime.resize(800, 700, 1);

    expect(mounted.frames.length).toBeGreaterThan(before);
    const resized = mounted.frames[mounted.frames.length - 1]!;
    // Every row is fixed-height and the width did not move, so the only
    // node whose constraints changed is the root. Before this change the
    // count here was the whole tree, and then some: the mount path
    // measures a node once on the way down and again where a container
    // places it.
    expect(resized.measured).toBeLessThan(10);
  });

  it('still re-measures the text that has to re-wrap when the width changes', () => {
    const mounted = mountRuntime(list());
    settle(mounted);

    mounted.runtime.resize(400, 600, 1);

    const resized = mounted.frames[mounted.frames.length - 1]!;
    // A narrower window is real work and no memo can answer it. The
    // point of the change is that the cost follows the size, not that
    // resizing became free.
    expect(resized.measured).toBeGreaterThan(ROWS);
  });

  it('lays the tree out for the first size, with no frame to do it', () => {
    const mounted = mountRuntime(list(), { start: false });
    // Nothing has drawn yet, so this is the mount: there is no memo to
    // keep, and the tree has to end laid out whether or not the
    // scheduler ever runs.
    mounted.runtime.resize(900, 700, 1);

    const root = mounted.runtime.snapshotTree().root;
    const report = mounted.runtime.inspectNodeById(root.id);
    expect(report).not.toBeNull();
    expect(report!.box.height).toBeGreaterThan(0);
  });

  it('settles at the last size asked for when resizes arrive before the first frame', () => {
    const mounted = mountRuntime(list(), { start: false });
    mounted.runtime.resize(900, 700, 1);
    // The second one takes the incremental path with no frame to run it,
    // so the size it asked for is owed to the first frame after start.
    mounted.runtime.resize(500, 700, 1);
    mounted.runtime.start();
    settle(mounted);

    const root = mounted.runtime.snapshotTree().root;
    const report = mounted.runtime.inspectNodeById(root.id)!;
    expect(report.box.width).toBe(500);
  });
});
