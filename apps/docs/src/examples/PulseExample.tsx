import type { Subscription } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { AnimationService, input, internalState, type ComponentContext, type Inputs } from '@gesso/framework';

const BARS = 28;
const SWEEP_MS = 1100;
/** How long a worst-gap reading stands before it is allowed to fall again. */
const WINDOW_MS = 4000;

/**
 * A screen that is always moving, and that times itself.
 *
 * The home page mounts this twice — once in a render worker, once on
 * the main thread — and then blocks the main thread. Whichever copy
 * keeps sweeping is the argument.
 *
 * **Everything here is local to the thread it runs on**, including the
 * caption underneath. The sweep is a repeating tween, so the cell is
 * written once per frame by the runtime's animation driver, and the gap
 * between those writes is a frame interval measured on the clock of the
 * thread that drew them. Nothing is reported to the page and nothing is
 * read from it, which is the point: a number that had to cross to the
 * main thread could not be trusted while the main thread is the thing
 * being blocked, and neither could a caption the page had to redraw.
 *
 * It also fixes a subtler dishonesty. An earlier version drove the
 * sweep from `setInterval` and counted callbacks — which measures that
 * a *thread* is alive and says nothing about whether anything was
 * drawn, and duly read healthy while both canvases were frozen.
 */
export function Pulse(props: Inputs<{ label?: string; caption?: string }>, ctx: ComponentContext) {
  const animations = ctx.inject(AnimationService);
  const label = input(props.label, 'Gesso');
  const caption = input(props.caption, '');
  const sweep = internalState(0);
  const frames = internalState(0);
  const worstMs = internalState(0);

  let previous: number | null = null;
  let worstAt = 0;
  const counting: Subscription = sweep.subscribe(() => {
    const now = performance.now();
    if (previous !== null) {
      const gap = now - previous;
      // A reading stands for a few seconds and then gives way, so a
      // second press reports that press rather than the first.
      if (gap >= worstMs.value || now - worstAt > WINDOW_MS) {
        worstMs.value = gap;
        worstAt = now;
      }
    }
    previous = now;
    frames.value++;
  });

  animations.animate(sweep, BARS - 1, { duration: SWEEP_MS, easing: 'linear', repeat: true, reducedMotion: 'keep' });

  ctx.onUnmount(() => {
    counting.unsubscribe();
    animations.stop(sweep);
  });

  return (
    <column width={percent(100)} height={percent(100)} backgroundColor="background">
      <column gap={12} padding={16} flexGrow={1} y="center">
        <row gap={10} y="center">
          <text text={label} fontSize={12} fontWeight={600} color="text" />
          <text
            text={worstMs.pipe(map(ms => `worst frame gap ${Math.round(ms)} ms`))}
            fontSize={11}
            color="textMuted"
          />
          <text text={frames.pipe(map(count => `${count} frames`))} fontSize={11} color="textMuted" />
        </row>

        <row gap={3} y="end" height={64}>
          {Array.from({ length: BARS }, (_, index) => (
            <box
              key={index}
              width={6}
              flexGrow={1}
              height={sweep.pipe(map(phase => barHeight(phase, index)))}
              borderRadius={2}
              backgroundColor={sweep.pipe(map(phase => (isLit(phase, index) ? 'primary' : 'border')))}
            />
          ))}
        </row>
      </column>

      {/* The caption the page used to draw in HTML, drawn here instead. */}
      <box height={1} width={percent(100)} backgroundColor="border" />
      <row padding={10} paddingLeft={16} paddingRight={16} y="center">
        <text text={caption} fontSize={12} color="textMuted" />
      </row>
    </column>
  );
}

/** A travelling hump, so the whole row moves rather than one bar. */
function barHeight(phase: number, index: number): number {
  const near = Math.max(0, 1 - Math.abs(index - phase) / 5);
  return 8 + near * near * 56;
}

function isLit(phase: number, index: number): boolean {
  return Math.abs(index - phase) < 2.5;
}
