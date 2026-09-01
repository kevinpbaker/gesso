import type { Subscription } from 'rxjs';
import { interval } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

const BARS = 28;
const STEP_MS = 40;

/**
 * A screen that is always moving, so a thread that stops is obvious.
 *
 * The home page mounts this twice — once in a render worker, once on
 * the main thread — and then blocks the main thread. Whichever copy
 * keeps sweeping is the argument.
 *
 * The sweep is driven by an `interval`, deliberately: a timer belongs
 * to the thread that armed it, so this is the plainest possible version
 * of the thing being demonstrated. In the worker copy the interval is
 * the worker's and a blocked main thread cannot reach it; in the
 * single-thread copy it is the blocked thread's own, and it stops with
 * everything else.
 *
 * `frames` counts what the sweep wrote, which is a frame count in
 * everything but name: a thread that cannot run cannot write one.
 */
export function Pulse(props: Inputs<{ label?: string }>, ctx: ComponentContext) {
  const sweep = internalState(0);
  const frames = internalState(0);

  let ticking: Subscription | undefined;
  ctx.onMount(() => {
    ticking = interval(STEP_MS).subscribe(() => {
      sweep.value = (sweep.value + 1) % BARS;
      frames.value++;
    });
  });
  ctx.onUnmount(() => ticking?.unsubscribe());

  return (
    <column gap={12} padding={16} width={percent(100)} height={percent(100)} y="center">
      <row gap={8} y="center">
        <text text={props.label} fontSize={12} fontWeight={600} color="text" />
        <text text={frames.pipe(map(count => `frames drawn: ${count}`))} fontSize={11} color="textMuted" />
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
