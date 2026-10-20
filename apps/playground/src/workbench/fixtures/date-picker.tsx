import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { Button, DatePicker } from 'gesso-components';
import { bind, internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** A fixed today, so every state opens on the same month whenever it is looked at. */
const TODAY = '2026-10-20';

const dateLine = (value: string): string => (value === '' ? 'No date' : `Value: ${value}`);

/** Controlled, echoed, and written from outside. */
function Echoed(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState('');
  return (
    <column gap={8} x="stretch">
      <DatePicker label="Start date" today={TODAY} {...bind(value)} />
      <row gap={8} flexWrap="wrap">
        <Button label="Christmas" size="small" variant="outlined" onClick={() => (value.value = '2026-12-25')} />
        <Button label="Leap day" size="small" variant="outlined" onClick={() => (value.value = '2028-02-29')} />
        <Button label="Garbage" size="small" variant="outlined" onClick={() => (value.value = 'not-a-date')} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {value.pipe(map(dateLine))}
      </text>
    </column>
  );
}

/** Two pickers bounding each other. */
function Range(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const start = internalState('2026-10-05');
  const due = internalState('2026-10-23');
  return (
    <column gap={8} x="stretch">
      <DatePicker label="Start" today={TODAY} max={due} {...bind(start)} />
      <DatePicker label="Due" today={TODAY} min={start} {...bind(due)} />
      <text textStyle="bodySmall" color="textMuted">
        {combineLatest([start, due]).pipe(map(([from, to]) => `${from} to ${to}`))}
      </text>
    </column>
  );
}

/** Required, with an error until a date is chosen. */
function Required(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState('');
  return (
    <DatePicker
      label="Delivery date"
      description="We deliver on weekdays."
      required
      today={TODAY}
      {...bind(value)}
      error={value.pipe(map(chosen => (chosen === '' ? 'Pick a date' : '')))}
    />
  );
}

export const datePickerFixture: WorkbenchFixture = {
  id: 'date-picker',
  name: 'DatePicker',
  source: 'packages/components/src/DatePicker.ts',
  states: [
    {
      name: 'No date',
      try: 'Shows No date, muted. Click: October 2026 opens under the trigger with the 20th marked as today and a ring on it. Click the 9th: the calendar closes, the trigger reads Oct 9, 2026, the line agrees. Garbage shows No date again, muted like the empty one.',
      stretch: true,
      render: () => <Echoed />
    },
    {
      name: 'Keyboard',
      try: 'Tab onto the trigger, press Down: the calendar opens on Oct 14, and the cursor ring is visible on top of the chosen day’s fill. Arrows move a day or a week, Page Down a month, Shift+Page Down a year, Home and End the week’s ends. Enter chooses, Escape closes and the trigger keeps focus.',
      stretch: true,
      render: () => <DatePicker label="Due" today={TODAY} defaultValue="2026-10-14" />
    },
    {
      name: 'Bounded to October 10–25',
      try: 'Days before the 10th and after the 25th are dimmed and refuse clicks. Arrows stop at the 10th and the 25th. Page Down stays in October. The › button does not go to November.',
      stretch: true,
      render: () => (
        <DatePicker label="Window" today={TODAY} min="2026-10-10" max="2026-10-25" defaultValue="2026-10-15" />
      )
    },
    {
      name: 'Start and due bound each other',
      try: 'Open Due: days before the 5th are dimmed. Move Start to the 12th and open Due again: now days before the 12th are dimmed. Start cannot be set after Due.',
      stretch: true,
      render: () => <Range />
    },
    {
      name: 'Today out of range',
      try: 'Today is the 20th but the range is November. Open it: it opens on November 1st, not October. Press Today: the calendar shows the nearest day it can, nothing is chosen.',
      stretch: true,
      render: () => <DatePicker label="Next month" today={TODAY} min="2026-11-01" max="2026-11-30" />
    },
    {
      name: 'Week starts on Sunday',
      try: 'Column headers start Sun. October 1st 2026 is a Thursday and sits under Thu. Home goes to Sunday.',
      stretch: true,
      render: () => <DatePicker label="Sunday first" today={TODAY} weekStart={0} defaultValue="2026-10-01" />
    },
    {
      name: 'Other languages',
      try: 'German: the trigger reads 14. Okt. 2026 and the header Oktober 2026 with Mo Di Mi… Japanese: 2026年10月14日. Day numbers line up under their headers in both.',
      stretch: true,
      render: () => (
        <column gap={10} x="stretch">
          <DatePicker label="Deutsch" today={TODAY} locale="de-DE" defaultValue="2026-10-14" />
          <DatePicker label="日本語" today={TODAY} locale="ja-JP" defaultValue="2026-10-14" />
        </column>
      )
    },
    {
      name: 'Not clearable',
      try: 'Open it: only Today is offered under the grid, no Clear.',
      stretch: true,
      render: () => <DatePicker label="Birthday" today={TODAY} clearable={false} defaultValue="1990-06-15" />
    },
    {
      name: 'Required with an error',
      try: 'Red border and the error under the trigger, not the description. Pick a day: the red goes and the description comes back. Clear in the calendar brings the error back.',
      stretch: true,
      render: () => <Required />
    },
    {
      name: 'Disabled',
      try: 'Dimmed label and chevron. Click and Enter do nothing, Tab skips it, no calendar opens.',
      stretch: true,
      render: () => <DatePicker label="Locked" today={TODAY} value="2026-10-14" disabled />
    },
    {
      name: 'Long placeholder in a narrow trigger',
      try: 'The placeholder is cut with an ellipsis or clipped before the chevron, not drawn over it or past the border.',
      width: 160,
      stretch: true,
      render: () => <DatePicker label="When" today={TODAY} placeholder="Pick the day the contract starts" />
    },
    {
      name: 'Against the right edge',
      try: 'A narrow trigger flush right. Open it: the calendar (about 260px wide) stays inside the window rather than being cut off.',
      stretch: true,
      render: () => (
        <row x="end">
          <DatePicker label="Date" labelHidden today={TODAY} width={120} defaultValue="2026-10-14" />
        </row>
      )
    }
  ]
};
