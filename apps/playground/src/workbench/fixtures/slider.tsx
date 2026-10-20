import { map } from 'rxjs/operators';

import { Button, Slider } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const asPercent = (value: number): string => `${value}%`;

/** Self-managing, but reporting, so the value under the pointer can be read. */
function Echoed(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const seen = internalState(30);
  return (
    <column gap={8} x="stretch">
      <Slider label="Brightness" defaultValue={30} onChange={next => (seen.value = next)} />
      <text textStyle="bodySmall" color="textMuted">
        {seen.pipe(map(value => `Reported: ${value}`))}
      </text>
    </column>
  );
}

/** Controlled, with the owner capping it below the track's end. */
function Capped(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const volume = internalState(40);
  return (
    <column gap={8} x="stretch">
      <Slider
        label="Volume"
        step={5}
        format={asPercent}
        value={volume}
        onChange={next => (volume.value = Math.min(80, next))}
      />
      <row gap={8} y="center">
        <Button label="Mute" size="small" variant="outlined" onClick={() => (volume.value = 0)} />
        <text textStyle="bodySmall" color="textMuted">
          The owner caps it at 80%
        </text>
      </row>
    </column>
  );
}

export const sliderFixture: WorkbenchFixture = {
  id: 'slider',
  name: 'Slider',
  source: 'packages/components/src/Slider.ts',
  states: [
    {
      name: 'Default',
      try: 'Click anywhere on the track: the fill jumps there and the number above agrees with the line. Drag along it: the fill follows the pointer from the first pixel, and dragging past either end stops at 0 or 100.',
      stretch: true,
      render: () => <Echoed />
    },
    {
      name: 'Keyboard',
      try: 'Tab onto it: a focus ring around label and track. Right and Up add 1, Left and Down take 1, Page Up and Page Down move 10, Home goes to 0 and End to 100.',
      stretch: true,
      render: () => <Slider label="Zoom" defaultValue={50} />
    },
    {
      name: 'Controlled, capped',
      try: 'Drag to the far right or hold End: the fill stops at 80% and does not flicker to 100 on the way. Mute snaps it to 0 with no gesture.',
      stretch: true,
      render: () => <Capped />
    },
    {
      name: 'Step 25 from 50 to 200',
      try: 'Drag slowly: the value jumps in 25s and never shows 87 or 112. The label reads as a percent. Home is 50%, End is 200%.',
      stretch: true,
      render: () => <Slider label="Scale" min={50} max={200} step={25} defaultValue={100} format={asPercent} />
    },
    {
      name: 'Decimal step',
      try: 'Press Right a few times: 0.1, 0.2, 0.3, never 0.30000000000000004. Page Up moves 0.1 here, since a tenth of the range is the step.',
      stretch: true,
      render: () => <Slider label="Opacity" min={0} max={1} step={0.1} defaultValue={0} />
    },
    {
      name: 'Negative range',
      try: 'Starts at 0 with the fill exactly half the track. Home goes to -50 with no fill; End to 50 with the track full.',
      stretch: true,
      render: () => <Slider label="Balance" min={-50} max={50} defaultValue={0} />
    },
    {
      name: 'Thumb at both ends',
      try: 'Each handle is a circle centred on the end of the fill. At 0 and at 100 the handle’s outer half overhangs the track and is drawn whole, not clipped.',
      stretch: true,
      render: () => (
        <column gap={12} x="stretch">
          <Slider label="At the start" thumb defaultValue={0} />
          <Slider label="At the end" thumb defaultValue={100} />
          <Slider label="In the middle" thumb defaultValue={50} />
        </column>
      )
    },
    {
      name: 'Media scrubber',
      try: 'No label row and no gap above the track, which sits at the top of its 20px strip. Clicks a few pixels below the line still seek.',
      stretch: true,
      render: () => <Slider label="Seek" labelHidden trackAlign="start" thumb defaultValue={35} />
    },
    {
      name: 'Disabled',
      try: 'Fill and label greyed. Clicking, dragging and the arrow keys do nothing, and Tab skips it.',
      stretch: true,
      render: () => <Slider label="Locked" value={60} disabled />
    },
    {
      name: 'Long label in a narrow box',
      try: 'The value stays visible next to or under the label; the label does not push it off the card.',
      width: 170,
      stretch: true,
      render: () => <Slider label="Maximum upload bandwidth for background sync" defaultValue={75} format={asPercent} />
    },
    {
      name: 'Min equals max',
      try: 'No fill, no error. Keys and clicks leave it at 5.',
      stretch: true,
      render: () => <Slider label="Fixed" min={5} max={5} defaultValue={5} />
    },
    {
      name: 'Mirrored',
      try: 'Switch the toolbar to Right to left: note whether the fill grows from the right, and whether Right arrow and a click near the right edge agree with what is drawn.',
      stretch: true,
      render: () => <Slider label="Volume" defaultValue={25} />
    }
  ]
};
