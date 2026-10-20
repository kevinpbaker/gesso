import { map } from 'rxjs/operators';

import { Button, Select, type SelectOption } from 'gesso-components';
import { bind, internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const PAYMENTS: readonly SelectOption[] = [
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'crypto', label: 'Crypto', disabled: true }
];

const WITH_GAPS: readonly SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot', disabled: true },
  { value: 'avocado', label: 'Avocado' },
  { value: 'banana', label: 'Banana' },
  { value: 'blackberry', label: 'Blackberry' },
  { value: 'cherry', label: 'Cherry', disabled: true }
];

const COUNTRIES: readonly SelectOption[] = [
  'Argentina',
  'Australia',
  'Austria',
  'Belgium',
  'Brazil',
  'Canada',
  'Chile',
  'China',
  'Colombia',
  'Croatia',
  'Czechia',
  'Denmark',
  'Egypt',
  'Estonia',
  'Finland',
  'France',
  'Germany',
  'Ghana',
  'Greece',
  'Hungary',
  'Iceland',
  'India',
  'Indonesia',
  'Ireland',
  'Israel',
  'Italy',
  'Japan',
  'Kenya',
  'Latvia',
  'Lithuania',
  'Mexico',
  'Morocco',
  'Netherlands',
  'New Zealand',
  'Nigeria',
  'Norway',
  'Peru',
  'Poland',
  'Portugal',
  'Romania',
  'Singapore',
  'Slovakia',
  'South Africa',
  'Spain',
  'Sweden',
  'Switzerland',
  'Thailand',
  'Turkey',
  'Uruguay',
  'Vietnam'
].map(name => ({ value: name.toLowerCase().replace(/\s+/g, '-'), label: name }));

const LONG: readonly SelectOption[] = [
  { value: 'weekly', label: 'Every week, on the first working day after the weekend' },
  { value: 'monthly', label: 'Once a month, on the last Friday before the end of the month' },
  { value: 'never', label: 'Never' }
];

const SIZES: readonly SelectOption[] = [
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' },
  { value: '100', label: '100' }
];

const chosenLine = (value: string): string => (value === '' ? 'Nothing chosen' : `Chosen: ${value}`);

/** Controlled from a cell, so the line under it shows each choice. */
function Echoed(
  inputs: Inputs<{ start: string; options: readonly SelectOption[]; label: string }>,
  _ctx: ComponentContext
) {
  const value = internalState(inputs.start.value);
  return (
    <column gap={8} x="stretch">
      <Select label={inputs.label} options={inputs.options} {...bind(value)} />
      <text textStyle="bodySmall" color="textMuted">
        {value.pipe(map(chosenLine))}
      </text>
    </column>
  );
}

/** An owner that refuses one choice, and writes from outside. */
function Refusing(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const payment = internalState('card');
  const refused = internalState(false);
  return (
    <column gap={8} x="stretch">
      <Select
        label="Payment method"
        options={PAYMENTS}
        value={payment}
        onChange={next => {
          refused.value = next === 'invoice';
          if (next !== 'invoice') {
            payment.value = next;
          }
        }}
      />
      <row gap={8} y="center">
        <Button label="Bank" size="small" variant="outlined" onClick={() => (payment.value = 'bank')} />
        <Button label="Not an option" size="small" variant="outlined" onClick={() => (payment.value = 'cash')} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {payment.pipe(map(chosenLine))}
      </text>
      <text textStyle="bodySmall" color="danger">
        {refused.pipe(map(no => (no ? 'Invoice was refused' : '')))}
      </text>
    </column>
  );
}

/** Required, with an error until something is chosen. */
function Required(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState('');
  return (
    <Select
      label="Delivery"
      placeholder="Pick a speed"
      required
      options={PAYMENTS}
      {...bind(value)}
      error={value.pipe(map(chosen => (chosen === '' ? 'Choose one to continue' : '')))}
    />
  );
}

export const selectFixture: WorkbenchFixture = {
  id: 'select',
  name: 'Select',
  source: 'packages/components/src/Select.ts',
  states: [
    {
      name: 'Placeholder',
      try: 'Shows Choose… in place of a value. Click: the list opens under the trigger, at least as wide as it. Click an option: the list closes, the trigger shows it, the line agrees. Click outside an open list: it closes with no change.',
      stretch: true,
      render: () => <Echoed label="Payment method" start="" options={PAYMENTS} />
    },
    {
      name: 'Keyboard',
      try: 'Tab onto the trigger and press Down: the list opens with Card highlighted. Down, Down, Enter chooses Invoice and focus is back on the trigger. Open again with Space, press Escape: closes, nothing changes, focus on the trigger.',
      stretch: true,
      render: () => <Echoed label="Payment method" start="card" options={PAYMENTS} />
    },
    {
      name: 'Controlled, refusing',
      try: 'Choose Invoice: the list closes, the trigger stays on Card and the red line says it was refused. Bank writes from outside. Not an option leaves the trigger blank rather than showing a stale label.',
      stretch: true,
      render: () => <Refusing />
    },
    {
      name: 'Disabled options and type-ahead',
      try: 'Open it: Apricot and Cherry are dimmed and clicking them does nothing. Arrows skip them, End lands on Blackberry. Closed, press B: Banana is chosen; press A: Apple. Open, press B: the highlight moves to Banana without choosing.',
      stretch: true,
      render: () => <Echoed label="Fruit" start="avocado" options={WITH_GAPS} />
    },
    {
      name: 'Fifty options',
      try: 'Open it: the list fits on screen and scrolls rather than running off the bottom of the window. Hold Down: the highlight stays in view as it walks. End shows Vietnam highlighted and visible.',
      stretch: true,
      render: () => <Echoed label="Country" start="germany" options={COUNTRIES} />
    },
    {
      name: 'Long value in a narrow trigger',
      try: 'The trigger shows the start of the chosen label and an ellipsis before the chevron; the chevron is never covered. Open it: long options wrap or clip inside the list, never past its border.',
      width: 180,
      stretch: true,
      render: () => <Echoed label="Send the digest" start="monthly" options={LONG} />
    },
    {
      name: 'Required with an error',
      try: 'Red border and the message under the trigger. Choose anything: the red and the message both go.',
      stretch: true,
      render: () => <Required />
    },
    {
      name: 'Disabled',
      try: 'Dimmed label, value and chevron. Click and the keys do nothing, Tab skips it, no list opens.',
      stretch: true,
      render: () => <Select label="Region" options={PAYMENTS} value="bank" disabled />
    },
    {
      name: 'Compact in a line of text',
      try: 'The small trigger sits on the line with the words either side, centred on them, no taller than the text needs. Its list uses the same small text.',
      width: 320,
      render: () => (
        <row gap={6} y="center">
          <text>Show</text>
          <Select label="Rows per page" labelHidden compact options={SIZES} defaultValue="25" />
          <text>rows per page</text>
        </row>
      )
    },
    {
      name: 'Against the right edge',
      try: 'The trigger is narrow and flush right. Open it: the list (at least 180px) stays inside the window, shifting left if it has to, rather than being cut off.',
      stretch: true,
      render: () => (
        <row x="end">
          <Select label="Sort" labelHidden compact options={SIZES} defaultValue="10" />
        </row>
      )
    },
    {
      name: 'Open near the bottom',
      try: 'Scroll so this card is at the bottom of the window and open it: the list flips above the trigger or stays fully visible, rather than disappearing below the fold.',
      stretch: true,
      render: () => <Echoed label="Country" start="" options={COUNTRIES} />
    }
  ]
};
