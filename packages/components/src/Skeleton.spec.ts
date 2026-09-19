import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { AnimationService, createComponent, internalState, show } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import { Column, percent, type AnimatedCell, type UiChild, type UiNode } from '@gesso/core';
import { Skeleton, SkeletonText } from './Skeleton';

/**
 * `Skeleton` and `SkeletonText`.
 *
 * The claims worth measuring are the ones the component was written
 * for: that the box is the caller's, so a list which fills in does not
 * move what is under it; that the default is a still block starting no
 * animation at all; that the shimmer is one repeating tween whatever
 * the line count, and that it stops when the component leaves; that a
 * reduced-motion preference leaves it at full strength rather than
 * dimmed; and that a run of bars announces itself once instead of once
 * per bar.
 */

/**
 * The animation store, watched from before any component body runs.
 *
 * On the **prototype**, not on the instance: `GessoRuntime` builds the
 * tree in its constructor, so by the time `renderTest`'s `onCreate`
 * hands back a runtime the skeleton has already asked for its tween.
 * A prototype spy is installed before the runtime exists at all, and
 * calls through, so the tween really runs.
 */
let animate: MockInstance<AnimationService['animate']>;
let stopped: MockInstance<AnimationService['stop']>;

beforeEach(() => {
  animate = vi.spyOn(AnimationService.prototype, 'animate');
  stopped = vi.spyOn(AnimationService.prototype, 'stop');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mount(root: UiChild) {
  const ui = renderTest(root, { width: 400, height: 300 });
  return {
    ...ui,
    /** Every grey block in the tree, in document order. */
    bars: (): UiNode[] => ui.allNodes().filter(node => node.properties.get('backgroundColor') === 'placeholder'),
    opacityOf: (node: UiNode): number => node.properties.get('opacity') as number,
    animations: (): AnimationService => ui.runtime.services.get(AnimationService)
  };
}

describe('Skeleton', () => {
  it('stands still by default, and starts no animation at all', () => {
    const ui = mount(createComponent(Skeleton, { width: 120, height: 14 }));
    const [block] = ui.bars();

    expect(block).toBeDefined();
    // Not "an animation that happens to write 1": no animation. A page
    // of skeletons must not put a page of tweens in the running set.
    expect(animate).not.toHaveBeenCalled();
    expect(block.properties.get('opacity')).toBeUndefined();
  });

  it("takes the caller's box, so the stand-in occupies what the content will", () => {
    // The whole reason the component exists: Segue exports `ROW_HEIGHT`
    // only so its stand-in is the same height as its row.
    const ui = mount(createComponent(Skeleton, { width: 220, height: 56 }));
    const [block] = ui.bars();

    expect(ui.getLayout(block)).toMatchObject({ width: 220, height: 56 });
  });

  it('fills the width it is given and is a line tall when told neither', () => {
    const ui = mount(Column({ width: 180 }, createComponent(Skeleton, {})));
    const [block] = ui.bars();

    expect(ui.getLayout(block)).toMatchObject({ width: 180, height: 16 });
  });

  it('is round and square-sided when it stands in for an avatar', () => {
    const ui = mount(Column({ width: 180 }, createComponent(Skeleton, { circle: true, width: 32 })));
    const [block] = ui.bars();

    // The second axis comes from the ratio rather than from the
    // column's stretch, so a circle given one measurement is a disc.
    expect(ui.getLayout(block)).toMatchObject({ width: 32, height: 32 });
    expect(block.properties.get('borderRadius')).toBe(999);
  });

  it('says it is loading, and can be told not to', () => {
    const ui = mount(createComponent(Skeleton, { width: 40, height: 40 }));
    expect(ui.getSemantics(ui.getByRole('status'))).toMatchObject({ label: 'Loading', states: ['busy'] });

    const silent = mount(createComponent(Skeleton, { width: 40, height: 40, announce: false }));
    expect(silent.queryByRole('status')).toBeNull();
    expect(silent.querySemantics(silent.bars()[0])).toBeNull();
  });
});

describe('the shimmer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('breathes from one repeating tween, sampled a tenth of a second apart', () => {
    const ui = mount(createComponent(Skeleton, { width: 120, height: 14, shimmer: true }));
    const [block] = ui.bars();

    expect(animate).toHaveBeenCalledTimes(1);
    const options = animate.mock.calls[0][2] ?? {};
    expect(options).toMatchObject({ repeat: true, stepMs: 100, duration: 1600 });
    // The default policy, not `Spinner`'s `keep`: a shimmer carries no
    // information a still block does not, so it is free to stop.
    expect(options.reducedMotion).toBeUndefined();

    expect(ui.opacityOf(block)).toBeCloseTo(0.55, 5);

    // The runtime waits out the step with a timer rather than taking a
    // frame it would draw nothing on, so the fake timers have to run
    // before a frame is even pending.
    vi.advanceTimersByTime(400);
    ui.frame(400);

    // A quarter of the way through is halfway out. The easing returns
    // to its start at t = 1, which is what makes one repeating tween an
    // out-and-back rather than a sawtooth that snaps home.
    expect(ui.opacityOf(block)).toBeCloseTo(0.775, 5);

    vi.advanceTimersByTime(400);
    ui.frame(800);
    expect(ui.opacityOf(block)).toBeCloseTo(1, 5);

    vi.advanceTimersByTime(400);
    ui.frame(1200);
    expect(ui.opacityOf(block)).toBeCloseTo(0.775, 5);
  });

  it('stops driving its cell when the skeleton leaves the tree', () => {
    const visible = internalState(true);
    const ui = mount(
      Column(
        {},
        show(visible, () => createComponent(Skeleton, { width: 120, height: 14, shimmer: true }))
      )
    );
    const cell = animate.mock.calls[0][0] as AnimatedCell<number>;

    vi.advanceTimersByTime(200);
    ui.frame(200);
    expect(ui.animations().animationFor(cell)).toBeDefined();

    visible.value = false;
    ui.frame(216);

    // A driver holding a cell holds every closure the component that
    // made it captured, so leaving the tree has to release it.
    expect(stopped).toHaveBeenCalledWith(cell);
    expect(ui.animations().animationFor(cell)).toBeUndefined();
  });

  it('lands at full strength when a reduced-motion preference arrives', () => {
    const ui = mount(createComponent(Skeleton, { width: 120, height: 14, shimmer: true }));
    const [block] = ui.bars();

    vi.advanceTimersByTime(400);
    ui.frame(400);
    expect(ui.opacityOf(block)).toBeCloseTo(0.775, 5);

    ui.animations().applyReducedMotion(true);
    ui.frame(416);

    // Snapped to the target, and the target is the bright end on
    // purpose: a shimmer that stops has to be the still skeleton, not a
    // permanently dimmed one.
    expect(ui.opacityOf(block)).toBeCloseTo(1, 5);

    vi.advanceTimersByTime(800);
    ui.frame(1216);
    expect(ui.opacityOf(block)).toBeCloseTo(1, 5);
  });

  it('costs one animation for a whole run of text, not one per bar', () => {
    const ui = mount(createComponent(SkeletonText, { lines: 6, width: 300, shimmer: true }));

    expect(ui.bars()).toHaveLength(6);
    // The opacity is on the column, so a six-line run wakes the runtime
    // exactly as often as a one-line run does.
    expect(animate).toHaveBeenCalledTimes(1);
  });
});

describe('SkeletonText', () => {
  it('draws a bar per line, full width but for a short last one', () => {
    const ui = mount(createComponent(SkeletonText, { width: 300 }));
    const bars = ui.bars();

    expect(bars).toHaveLength(3);
    // A paragraph stops short only on its final line; a run with no
    // short line reads as a table rather than as prose.
    expect(bars.map(bar => ui.getLayout(bar).width)).toEqual([300, 300, 180]);
  });

  it('takes the widths it is given, and repeats the last one when it runs out', () => {
    const ui = mount(createComponent(SkeletonText, { width: 400, lines: 4, widths: [percent(50), 100] }));

    expect(ui.bars().map(bar => ui.getLayout(bar).width)).toEqual([200, 100, 100, 100]);
  });

  it('sizes the run from the line height and the gap', () => {
    const ui = mount(createComponent(SkeletonText, { width: 200, lines: 3, lineHeight: 20, gap: 10 }));
    const bars = ui.bars();

    expect(bars.map(bar => ui.getLayout(bar).height)).toEqual([20, 20, 20]);
    // One bar plus one gap between each pair, which is the box the
    // paragraph arriving will have to fill without moving anything.
    expect(ui.getLayout(bars[1]).y - ui.getLayout(bars[0]).y).toBe(30);
    expect(ui.getLayout(bars[2]).y - ui.getLayout(bars[1]).y).toBe(30);
  });

  it('announces the run once rather than once per bar', () => {
    const ui = mount(createComponent(SkeletonText, { width: 300, lines: 5 }));

    expect(ui.getAllByRole('status')).toHaveLength(1);
    expect(ui.getSemantics(ui.getByRole('status'))).toMatchObject({ label: 'Loading', states: ['busy'] });
    // Twelve stand-ins must not be twelve interruptions carrying one
    // bit between them: the container speaks and the bars are silent.
    for (const bar of ui.bars()) {
      expect(ui.querySemantics(bar)).toBeNull();
    }
  });

  it('can be silenced, for a group whose own region says it instead', () => {
    const ui = mount(createComponent(SkeletonText, { width: 300, announce: false, label: 'Loading comments' }));

    expect(ui.queryByRole('status')).toBeNull();
  });
});
