import { map } from 'rxjs/operators';

import { Button, SegmentedControl, type SegmentedOption } from 'gesso-components';
import { bind, internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const RANGE: readonly SegmentedOption[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' }
];

const EXPORT: readonly SegmentedOption[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF', disabled: true },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML', disabled: true }
];

const DAYS: readonly SegmentedOption[] = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' }
];

const LONG: readonly SegmentedOption[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
  { value: 'spreadsheet', label: 'Spreadsheet density' }
];

const chosenLine = (value: string): string => (value === '' ? 'Nothing chosen' : `Chosen: ${value}`);

/** Controlled from a cell, so the line under it shows each change. */
function Echoed(inputs: Inputs<{ start: string; options: readonly SegmentedOption[] }>, _ctx: ComponentContext) {
  const value = internalState(inputs.start.value);
  return (
    <column gap={8} x="start">
      <SegmentedControl label="Choice" options={inputs.options} {...bind(value)} />
      <text textStyle="bodySmall" color="textMuted">
        {value.pipe(map(chosenLine))}
      </text>
    </column>
  );
}

/** Moved from outside, including to a value no segment has. */
function SetFromOutside(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState('week');
  return (
    <column gap={8} x="start">
      <SegmentedControl label="Range" options={RANGE} {...bind(value)} />
      <row gap={8} flexWrap="wrap">
        <Button label="Month" size="small" variant="outlined" onClick={() => (value.value = 'month')} />
        <Button label="Year (not an option)" size="small" variant="outlined" onClick={() => (value.value = 'year')} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {value.pipe(map(chosenLine))}
      </text>
    </column>
  );
}

export const segmentedControlFixture: WorkbenchFixture = {
  id: 'segmented-control',
  name: 'SegmentedControl',
  source: 'packages/components/src/SegmentedControl.ts',
  states: [
    {
      name: 'Nothing chosen',
      try: 'No segment is lit. Tab onto the track (one ring round the whole track) and press Right: Day lights. Press Reset states, Tab in again and press Left: Month lights.',
      render: () => <Echoed start="" options={RANGE} />
    },
    {
      name: 'Keyboard',
      try: 'Tab in: the chosen segment’s ring turns accent. Right and Down step forward and wrap from Month to Day; Left and Up step back. Home and End jump. One more Tab leaves the track.',
      render: () => <Echoed start="week" options={RANGE} />
    },
    {
      name: 'Hover',
      try: 'Hover each segment: the unchosen ones darken, the chosen one keeps its raised sheet and its words stay readable. Nothing shifts sideways when the choice moves.',
      render: () => <SegmentedControl label="Range" options={RANGE} defaultValue="week" />
    },
    {
      name: 'Disabled segments',
      try: 'PDF and XML are greyed, show no hover and refuse clicks. Arrows from CSV go to JSON and back, never landing on a greyed one. End goes to JSON.',
      render: () => <Echoed start="csv" options={EXPORT} />
    },
    {
      name: 'Disabled control',
      try: 'Every label greyed, no hover, clicks do nothing, Tab skips it.',
      render: () => <SegmentedControl label="Range" options={RANGE} value="day" disabled />
    },
    {
      name: 'Set from outside',
      try: 'Press Month: the sheet moves. Press Year: no segment is lit and the line says year. Tab in and press Right: Day is chosen.',
      width: 320,
      render: () => <SetFromOutside />
    },
    {
      name: 'Sizes',
      try: 'Small, medium and large tracks get taller in turn, each segment’s words vertically centred, and the chosen sheet’s corners sit concentric with the track’s.',
      width: 320,
      render: () => (
        <column gap={10} x="start">
          <SegmentedControl label="Small" options={RANGE} defaultValue="day" size="small" />
          <SegmentedControl label="Medium" options={RANGE} defaultValue="week" size="medium" />
          <SegmentedControl label="Large" options={RANGE} defaultValue="month" size="large" />
        </column>
      )
    },
    {
      name: 'Stretched',
      try: 'The track fills the card and the three segments share the width evenly, words centred in each.',
      width: 360,
      stretch: true,
      render: () => <SegmentedControl label="Range" options={RANGE} defaultValue="day" />
    },
    {
      name: 'Seven segments',
      try: 'All seven fit on one line with no gaps between them. Arrows walk all seven and wrap from Sun to Mon.',
      width: 400,
      render: () => <Echoed start="wed" options={DAYS} />
    },
    {
      name: 'Long labels in a narrow box',
      try: 'Words are never cut in half, so the track runs past the card’s right edge rather than squeeze them: by design, see the segment note in SegmentedControl.ts. Segments must not overlap each other.',
      width: 200,
      render: () => <SegmentedControl label="Density" options={LONG} defaultValue="compact" size="small" />
    }
  ]
};
