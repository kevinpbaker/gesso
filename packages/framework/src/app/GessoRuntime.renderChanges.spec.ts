import { afterEach, describe, expect, it, vi } from 'vitest';

import { Box, Canvas2DRenderer, Column, DirtyFlags, ScrollView, scrollPosition, type RenderContext } from 'gesso-core';
import { internalState } from '../InternalState';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';

/**
 * What the runtime tells a renderer about the frame it is drawing.
 *
 * Canvas2D keeps a scroll container's content as pixels across frames
 * that only scrolled it, and it knows a frame only scrolled because the
 * runtime says so. The claim worth a spec is the one that keeps those
 * pixels honest: the change set is offered only when it is the whole
 * truth, and withheld on a frame where something was dirtied after the
 * dirty set was collected, which the drawing may already show.
 */
function drain(mounted: MountedRuntime, limit = 200): void {
  let frames = 0;
  while (mounted.clock.isPending && frames < limit) {
    frames++;
    mounted.frame();
  }
}

describe('render changes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hands the renderer the frame and the geometry version on a frame that only scrolled', () => {
    const render = vi.spyOn(Canvas2DRenderer.prototype, 'render');
    const offset = internalState(0);
    const mounted = mountRuntime(
      ScrollView({ width: 200, height: 100, scrollY: offset }, Column({ width: 200 }, Box({ width: 200, height: 600 })))
    );
    drain(mounted);
    const before = render.mock.calls.at(-1)![1] as RenderContext;

    offset.value = 40;
    drain(mounted);
    const context = render.mock.calls.at(-1)![1] as RenderContext;

    expect(context.changes).toBeDefined();
    const dirty = [...context.changes!.frame.entries()];
    expect(dirty).toHaveLength(1);
    expect(dirty[0]![1]).toBe(DirtyFlags.Transform);
    // Nothing moved: descendants keep their pre-scroll records.
    expect(context.changes!.geometryVersion).toBe(before.changes!.geometryVersion);
  });

  it('withholds the changes on a frame where something was dirtied after they were collected', () => {
    const render = vi.spyOn(Canvas2DRenderer.prototype, 'render');
    const offset = internalState(0);
    const color = internalState('#fff');
    const mounted = mountRuntime(
      Column(
        {},
        Box({ width: 20, height: 20, backgroundColor: color }),
        ScrollView(
          {
            width: 200,
            height: 100,
            scrollY: offset,
            // Heard after layout, inside the frame: the write it makes
            // lands in the graph after the frame's dirt was taken.
            modifiers: [scrollPosition({ onChange: at => (color.value = at.y > 0 ? '#000' : '#fff') })]
          },
          Column({ width: 200 }, Box({ width: 200, height: 600 }))
        )
      )
    );
    drain(mounted);

    offset.value = 40;
    mounted.frame();
    const context = render.mock.calls.at(-1)![1] as RenderContext;
    expect(context.changes).toBeUndefined();
  });
});
