import { map } from 'rxjs/operators';

import { Button, RangeSlider } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const asDollars = (value: number): string => `$${value}`;
const inDays = (value: number): string => `${value} d`;
const STAY_THUMBS = ['Check in', 'Check out'] as const;

/** Self-managing, but reporting, so the pair under the pointer can be read. */
function Echoed(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const seen = internalState<readonly [number, number]>([20, 80]);
  return (
    <column gap={8} x="stretch">
      <RangeSlider label="Price" defaultValue={[20, 80]} onChange={next => (seen.value = next)} />
      <text textStyle="bodySmall" color="textMuted">
        {seen.pipe(map(([low, high]) => `Reported: ${low} to ${high}`))}
      </text>
    </column>
  );
}

/** Controlled, with the owner refusing a top above $400. */
function Capped(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const price = internalState<readonly [number, number]>([100, 300]);
  return (
    <column gap={8} x="stretch">
      <RangeSlider
        label="Budget"
        max={500}
        step={10}
        format={asDollars}
        value={price}
        onChange={([low, high]) => (price.value = [low, Math.min(400, high)])}
      />
      <row gap={8} y="center">
        <Button label="Reset" size="small" variant="outlined" onClick={() => (price.value = [100, 300])} />
        <text textStyle="bodySmall" color="textMuted">
          The owner caps the top at $400
        </text>
      </row>
    </column>
  );
}

export const rangeSliderFixture: WorkbenchFixture = {
  id: 'range-slider',
  name: 'RangeSlider',
  source: 'packages/components/src/RangeSlider.ts',
  states: [
    {
      name: 'Default',
      try: 'Click the track left of the left thumb: that thumb jumps there, the right one stays, and the accent span runs between them. Click near the right thumb and drag: it follows from the first pixel. Drag either thumb into the other: it stops on it and never passes it. The reported pair always has the smaller number first.',
      stretch: true,
      render: () => <Echoed />
    },
    {
      name: 'Keyboard walk',
      try: 'Tab: the ring lands on the left thumb alone. Right adds 1, Page Up 10, End takes it to the right thumb and no further. Tab again: the ring moves to the right thumb. Home takes it down to the left thumb. Shift-Tab goes back. Each thumb has its own ring, never one round both.',
      stretch: true,
      render: () => <RangeSlider label="Price" defaultValue={[30, 60]} />
    },
    {
      name: 'Step 25, formatted',
      try: 'Drag slowly: both thumbs jump in 25s, never showing $60 or $135. The text above reads "$50 – $150" and follows every move.',
      stretch: true,
      render: () => <RangeSlider label="Price" max={500} step={25} format={asDollars} defaultValue={[50, 150]} />
    },
    {
      name: 'Minimum distance',
      try: 'The thumbs keep one night apart: drag Check in onto Check out and it stops one step short, with a sliver of span still between them. Home on Check out stops one past Check in. Neither thumb can be pushed to touch the other.',
      stretch: true,
      render: () => (
        <RangeSlider label="Stay" thumbLabels={STAY_THUMBS} min={1} max={31} minDistance={1} defaultValue={[10, 14]} />
      )
    },
    {
      name: 'Thumbs together at the top',
      try: 'Both thumbs sit on the right end, the upper one drawn over the lower with a ring between them, both centred on the end of the track rather than short of it. Press on them and drag left: one thumb comes away and the span opens. Press on them and drag right: nothing moves, there is nowhere to go.',
      stretch: true,
      render: () => <RangeSlider label="Price" defaultValue={[100, 100]} />
    },
    {
      name: 'Thumbs together in the middle',
      try: 'Press exactly on the pair and drag right: the right-hand thumb comes away and the span opens rightward. Reset, press on them and drag left: the left-hand thumb comes away instead. A press to either side of the pair moves the thumb on that side.',
      stretch: true,
      render: () => <RangeSlider label="Price" defaultValue={[50, 50]} />
    },
    {
      name: 'Controlled, capped',
      try: 'Drag the right thumb to the far end or press End on it: it stops at $400, without flickering to $500 on the way. Reset puts both thumbs back with no gesture.',
      stretch: true,
      render: () => <Capped />
    },
    {
      name: 'Disabled',
      try: 'Span and both thumbs greyed. Clicking, dragging and the arrow keys do nothing, and Tab skips both thumbs.',
      stretch: true,
      render: () => <RangeSlider label="Locked" value={[25, 75]} disabled />
    },
    {
      name: 'Long label in a narrow box',
      try: 'The thumbs stay whole at both ends of a short track, the values stay readable beside or under the label, and a press still picks the nearer thumb even when they are only a few pixels apart.',
      width: 170,
      stretch: true,
      render: () => (
        <RangeSlider
          label="Acceptable delivery window in days"
          min={0}
          max={30}
          defaultValue={[3, 7]}
          format={inDays}
        />
      )
    },
    {
      name: 'Mirrored',
      try: 'Switch the toolbar to Right to left: the minimum thumb is now on the right and the span grows leftward from it. On either thumb Left is more and Right is less; Up and Down do not flip. A click near the right edge moves the minimum thumb there. With both thumbs together, a leftward drag takes the maximum thumb.',
      stretch: true,
      render: () => <RangeSlider label="Price" defaultValue={[25, 60]} />
    }
  ]
};
