import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { Button, Skeleton, SkeletonText } from 'gesso-components';
import { internalState, show, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/**
 * Still and breathing, switched by building one or the other: `shimmer`
 * is read once, so the same skeleton cannot be turned on in place.
 */
function Breathing(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const shimmer = internalState(true);
  const standIn = (on: boolean) => (
    <row gap={10} y="center" width={percent(100)}>
      <Skeleton circle width={40} shimmer={on} announce={false} />
      <SkeletonText flex={1} lines={2} lineHeight={10} gap={7} shimmer={on} announce={false} />
    </row>
  );
  return (
    <column gap={10} x="stretch">
      {show(
        shimmer,
        () => standIn(true),
        () => standIn(false)
      )}
      <row gap={8} y="center">
        <Button label="Shimmer on / off" size="small" onClick={() => (shimmer.value = !shimmer.value)} />
        <text textStyle="bodySmall" color="textMuted">
          {shimmer.pipe(map(on => (on ? 'Breathing' : 'Still')))}
        </text>
      </row>
    </column>
  );
}

/** A row that loads, so the swap from stand-in to content can be watched for a jump. */
function Loading(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const loaded = internalState(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const load = (): void => {
    loaded.value = false;
    clearTimeout(timer);
    timer = setTimeout(() => (loaded.value = true), 1500);
  };
  ctx.onMount(load);
  ctx.onUnmount(() => clearTimeout(timer));
  return (
    <column gap={10} x="stretch">
      <box height={56} x="stretch" y="center">
        {show(
          loaded,
          () => (
            <row gap={12} y="center">
              <box width={40} height={40} borderRadius={20} backgroundColor="primary" flexShrink={0} />
              <column gap={3}>
                <text>Music for Airports</text>
                <text textStyle="bodySmall" color="textMuted">
                  Brian Eno
                </text>
              </column>
            </row>
          ),
          () => (
            <row gap={12} y="center">
              <Skeleton circle width={40} shimmer announce={false} />
              <SkeletonText flex={1} lines={2} lineHeight={11} gap={8} widths={[percent(60), percent(35)]} shimmer />
            </row>
          )
        )}
      </box>
      <row gap={8} y="center">
        <Button label="Load again" size="small" onClick={load} />
        <text textStyle="bodySmall" color="textMuted">
          {loaded.pipe(map(done => (done ? 'Loaded' : 'Loading…')))}
        </text>
      </row>
    </column>
  );
}

export const skeletonFixture: WorkbenchFixture = {
  id: 'skeleton',
  name: 'Skeleton',
  source: 'packages/components/src/Skeleton.ts',
  states: [
    {
      name: 'Block, default',
      try: 'A full-width grey block with rounded corners, clearly visible but quieter than text. Check it in Dark too.',
      width: 320,
      stretch: true,
      render: () => <Skeleton />
    },
    {
      name: 'Sizes and radii',
      try: 'Three blocks of 120 by 24 with corners of 0, 4 and 12; a 12 radius on a 24-high block makes a pill.',
      width: 320,
      render: () => (
        <column gap={8} x="start">
          {[0, 4, 12].map(radius => (
            <Skeleton key={String(radius)} width={120} height={24} radius={radius} />
          ))}
        </column>
      )
    },
    {
      name: 'Circles',
      try: 'Default size, width 48 only, and height 48 only all draw true circles. Both sides given (64 by 32) is the caller’s choice: an oval, not a circle squeezed into a corner.',
      width: 320,
      render: () => (
        <row gap={12} y="center">
          <Skeleton circle />
          <Skeleton circle width={48} />
          <Skeleton circle height={48} />
          <Skeleton circle width={64} height={32} />
        </row>
      )
    },
    {
      name: 'Text, by line count',
      try: 'One, three and six lines. Every line but the last is full width; the last stops at about 60%, except the single line, which is full.',
      width: 320,
      stretch: true,
      render: () => (
        <column gap={16} x="stretch">
          {[1, 3, 6].map(lines => (
            <SkeletonText key={String(lines)} lines={lines} />
          ))}
        </column>
      )
    },
    {
      name: 'Text, custom widths',
      try: 'Five lines from a two-entry ramp (90%, 40%): the first is 90% and the other four repeat 40%. Thick 16 bars, gap 4.',
      width: 320,
      stretch: true,
      render: () => <SkeletonText lines={5} widths={[percent(90), percent(40)]} lineHeight={16} gap={4} />
    },
    {
      name: 'Shimmer',
      try: 'The stand-in breathes slowly between dim and full. Turn it off: it holds still at full strength, not stuck at the dim end. On again: it breathes.',
      width: 320,
      stretch: true,
      render: () => <Breathing />
    },
    {
      name: 'Loading, then loaded',
      try: 'After a second and a half the stand-in is replaced by the track. The row does not change height and the title lands roughly where the first bar was. Load again repeats it.',
      width: 320,
      stretch: true,
      render: () => <Loading />
    },
    {
      name: 'Narrow',
      try: 'In a narrow cell every bar stays inside the cell, and the 60% last line is still visibly shorter.',
      width: 120,
      stretch: true,
      render: () => <SkeletonText lines={3} />
    }
  ]
};
