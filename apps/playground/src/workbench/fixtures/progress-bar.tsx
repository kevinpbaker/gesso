import { map } from 'rxjs/operators';

import { Button, ProgressBar } from 'gesso-components';
import { internalState, show, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** A bar stepped by hand, with the figure written under it. */
function Stepping(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const progress = internalState(0.35);
  return (
    <column gap={8} x="stretch">
      <ProgressBar label="Upload" value={progress} />
      <row gap={8}>
        <Button label="Less" size="small" variant="outlined" onClick={() => (progress.value -= 0.15)} />
        <Button label="More" size="small" onClick={() => (progress.value += 0.15)} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {progress.pipe(map(value => `value is ${value.toFixed(2)}`))}
      </text>
    </column>
  );
}

/** An indeterminate bar that can be taken away and put back. */
function Sweeping(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const running = internalState(true);
  return (
    <column gap={8} x="stretch">
      {show(
        running,
        () => (
          <ProgressBar label="Indexing" />
        ),
        () => (
          <ProgressBar label="Indexing" value={1} />
        )
      )}
      <row gap={8} y="center">
        <Button label="Toggle" size="small" onClick={() => (running.value = !running.value)} />
        <text textStyle="bodySmall" color="textMuted">
          {running.pipe(map(on => (on ? 'Indeterminate' : 'Finished (value 1)')))}
        </text>
      </row>
    </column>
  );
}

/** A bar that is built without a value and is given one later. */
function LateValue(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState<number | undefined>(undefined);
  return (
    <column gap={8} x="stretch">
      <ProgressBar label="Download" value={value} />
      <row gap={8} y="center">
        <Button label="Value 0.6" size="small" onClick={() => (value.value = 0.6)} />
        <Button label="Unknown" size="small" variant="outlined" onClick={() => (value.value = undefined)} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {value.pipe(map(current => `value is ${current ?? 'undefined'}`))}
      </text>
    </column>
  );
}

/** A bar whose range changes while its value stands still. */
function MovingMax(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const max = internalState(100);
  return (
    <column gap={8} x="stretch">
      <ProgressBar label="Files" value={50} max={max} />
      <row gap={8} y="center">
        <Button label="max 200" size="small" onClick={() => (max.value = 200)} />
        <Button label="max 100" size="small" variant="outlined" onClick={() => (max.value = 100)} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {max.pipe(map(value => `50 of ${value}: the fill should be ${Math.round((50 / value) * 100)}%`))}
      </text>
    </column>
  );
}

export const progressBarFixture: WorkbenchFixture = {
  id: 'progress-bar',
  name: 'ProgressBar',
  source: 'packages/components/src/Media.ts',
  states: [
    {
      name: 'Values',
      try: '0 shows an empty track with no sliver, 0.35 about a third, 1 completely full with the right end rounded like the track.',
      width: 320,
      stretch: true,
      render: () => (
        <column gap={12} x="stretch">
          <ProgressBar label="Zero" value={0} />
          <ProgressBar label="Some" value={0.35} />
          <ProgressBar label="Full" value={1} />
        </column>
      )
    },
    {
      name: 'Stepping',
      try: 'Press More and Less: the fill follows the line. Past 1 it stays full, below 0 it stays empty, and it never draws outside the track.',
      width: 320,
      stretch: true,
      render: () => <Stepping />
    },
    {
      name: 'Range and thickness',
      try: '34 of 120 (about 28%) at thickness 2, 6 and 12. Each fill is a pill with round ends, and the thin one is still visible.',
      width: 320,
      stretch: true,
      render: () => (
        <column gap={12} x="stretch">
          {[2, 6, 12].map(thickness => (
            <ProgressBar key={String(thickness)} label="Disk" value={34} min={0} max={120} thickness={thickness} />
          ))}
        </column>
      )
    },
    {
      name: 'Indeterminate',
      try: 'A sliver sweeps left to right and starts over. Toggle: it becomes a full bar; toggle back: it sweeps again from the start. Watch the wrap from right back to left for a jump.',
      width: 320,
      stretch: true,
      render: () => <Sweeping />
    },
    {
      name: 'Value arrives later',
      try: 'It starts sweeping. Press Value 0.6: correct is a still bar 60% full. Press Unknown: correct is sweeping again. A bar that keeps sweeping, or goes blank, is a bug.',
      width: 320,
      stretch: true,
      render: () => <LateValue />
    },
    {
      name: 'Range changes',
      try: 'Press max 200: the fill halves to 25%. Press max 100: back to 50%. A fill that does not move until the value changes is a bug.',
      width: 320,
      stretch: true,
      render: () => <MovingMax />
    },
    {
      name: 'No width given',
      try: 'Not stretched and given no width, so there is no track: it fills the width it is given, as a slider does, and asks for none of its own. Nothing here is the expected picture.',
      render: () => <ProgressBar label="Unsized" value={0.5} />
    },
    {
      name: 'Right to left',
      try: 'Switch the toolbar to Right to left: the fill grows from the right edge, and the right end of a full bar is rounded like the track. Back to Left to right: it grows from the left again.',
      width: 320,
      stretch: true,
      render: () => <ProgressBar label="Mirrored" value={0.3} />
    }
  ]
};
