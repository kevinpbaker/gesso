import type { Subscription } from 'rxjs';
import { interval } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { input, internalState, type ComponentContext, type Inputs } from '@gesso/framework';

const BARS = 28;
const STEP_MS = 40;

/**
 * A screen that is always moving, and that times itself.
 *
 * The home page mounts this twice — once in a render worker, once on
 * the main thread — and then blocks the main thread. Whichever copy
 * keeps sweeping is the argument.
 *
 * **Everything here belongs to the thread it runs on**: the timer that
 * advances the sweep, the clock the gap is measured on, the counter,
 * and the caption underneath. Nothing is reported to the page and
 * nothing is read from it, which is the point — a number that had to
 * cross to the main thread could not be trusted while the main thread
 * is the thing being blocked, and neither could a caption the page had
 * to redraw.
 *
 * A timer rather than a frame hook because a timer is a thread's own:
 * the worker's keeps firing while the page's thread is stopped, and the
 * main-thread copy's stops with it. Each tick writes a cell, and a cell
 * written outside a frame is what asks the runtime for the next one, so
 * the sweep on screen is the timer made visible.
 */
export function Pulse(props: Inputs<{ label?: string; caption?: string }>, ctx: ComponentContext) {
  const label = input(props.label, 'Gesso');
  const caption = input(props.caption, '');
  const sweep = internalState(0);
  const ticks = internalState(0);
  const worstMs = internalState(0);

  let previous: number | null = null;
  let ticking: Subscription | undefined;

  ctx.onMount(() => {
    ticking = interval(STEP_MS).subscribe(() => {
      const now = performance.now();
      if (previous !== null) {
        // A high-water mark, never walked back: the worst thing that
        // happened to this screen is a fact about it, and a reading
        // that quietly recovered would be one a reader had to catch in
        // the act to believe.
        worstMs.value = Math.max(worstMs.value, now - previous);
      }
      previous = now;
      sweep.value = (sweep.value + 1) % BARS;
      ticks.value++;
    });
  });

  ctx.onUnmount(() => ticking?.unsubscribe());

  return (
    <column width={percent(100)} height={percent(100)} backgroundColor="background">
      <column gap={12} padding={16} flexGrow={1} y="center">
        <row gap={10} y="center">
          <text text={label} fontSize={12} fontWeight={600} color="text" />
          <text text={ticks.pipe(map(count => `${count} steps`))} fontSize={11} color="textMuted" />
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
      <row padding={10} paddingLeft={16} paddingRight={16} y="center" x="space-between">
        <text text={caption} fontSize={12} color="textMuted" />
        <text
          text={worstMs.pipe(map(ms => `longest frame ${Math.round(ms)} ms`))}
          fontSize={12}
          fontWeight={600}
          color="text"
        />
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
