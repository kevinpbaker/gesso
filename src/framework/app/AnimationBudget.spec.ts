import { describe, expect, it } from 'vitest';
import { map } from 'rxjs';

import { Box, Column, Row, Text } from '../../ui/composition/UiComponents';
import { animateLayout } from '../../ui/modifiers';
import { state } from '../State';
import { AnimationService } from './AnimationService';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * What F4 costs per frame, because `ROADMAP.md` §F4's exit criterion
 * asks for a number and an adjective would not do.
 *
 * Two questions, and they are different. **A tick** is arithmetic and
 * a property write, and the answer should be that a hundred of them
 * disappear into the noise. **A layout animation** is not: it moves a
 * node by writing `left`/`top`, which marks Layout rather than Paint,
 * so every frame of a reorder re-places the animating subtree. That is
 * the price of needing no renderer change, and this says what it is.
 */
describe('what a frame of animation costs', () => {
  const ROWS = 50;

  function median(samples: number[]): number {
    const sorted = [...samples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  it('a hundred running animations cost less than a millisecond a frame', () => {
    const cells = Array.from({ length: 100 }, () => state(0));
    const mounted = mountRuntime(Column({}, ...cells.map(cell => Box({ width: 20, height: 20, opacity: cell }))));
    let time = 0;
    while (mounted.clock.isPending) {
      time += 16;
      mounted.clock.tick(time);
    }
    const animations = mounted.runtime.services.get(AnimationService);
    for (const cell of cells) {
      animations.animate(cell, 1, { duration: 4000 });
    }
    const start = mounted.frames.length;
    for (let i = 0; i < 40 && mounted.clock.isPending; i++) {
      time += 16;
      mounted.clock.tick(time);
    }
    const ticks = mounted.frames.slice(start).map(metrics => metrics.phases.ticks);
    expect(ticks.length).toBeGreaterThan(20);
    const cost = median(ticks);
    // eslint-disable-next-line no-console
    console.info(
      `[animation budget] 100 tweens: ticks median ${cost.toFixed(3)} ms over ${ticks.length} frames ` +
        `(worst ${Math.max(...ticks).toFixed(3)} ms)`
    );
    expect(cost).toBeLessThan(1);
  });

  it('a reorder of fifty rows re-places them each frame, and says what that costs', () => {
    const order = state(Array.from({ length: ROWS }, (_, index) => index));
    const mounted = mountRuntime(
      Column(
        { width: 400, height: 2400 },
        order.pipe(
          map(ids =>
            ids.map(id =>
              Row(
                { key: id, height: 40, padding: 6, modifiers: [animateLayout(undefined)] },
                Text({ text: `Row ${id}`, fontSize: 12 })
              )
            )
          )
        )
      )
    );
    let time = 0;
    while (mounted.clock.isPending) {
      time += 16;
      mounted.clock.tick(time);
    }

    // Reverse the list: every row moves, and none of them by a little.
    const at = mounted.frames.length;
    order.value = [...order.value].reverse();
    let frames = 0;
    while (mounted.clock.isPending && frames < 400) {
      time += 16;
      frames++;
      mounted.clock.tick(time);
    }
    const during = mounted.frames.slice(at);
    const ticks = median(during.map(metrics => metrics.phases.ticks));
    const layout = median(during.map(metrics => metrics.phases.layout));
    const frame = median(during.map(metrics => metrics.durationMs));
    // eslint-disable-next-line no-console
    console.info(
      `[animation budget] ${ROWS} rows reordered over ${during.length} frames: ` +
        `ticks median ${ticks.toFixed(3)} ms · layout median ${layout.toFixed(3)} ms · frame median ${frame.toFixed(3)} ms`
    );

    // It settled on its own, and then stopped asking for frames.
    expect(mounted.clock.isPending).toBe(false);
    expect(during.length).toBeGreaterThan(10);
    // An order of magnitude above the measured value, as the other
    // budget specs cap theirs.
    expect(frame).toBeLessThan(50);
  });
});
