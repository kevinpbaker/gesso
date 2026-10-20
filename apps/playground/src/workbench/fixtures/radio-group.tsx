import { map } from 'rxjs/operators';

import { Button, RadioGroup, type RadioOption } from 'gesso-components';
import { bind, internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const DELIVERY: readonly RadioOption[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'express', label: 'Express' },
  { value: 'courier', label: 'Courier' }
];

const WITH_GAP: readonly RadioOption[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly', disabled: true },
  { value: 'yearly', label: 'Yearly' },
  { value: 'biennial', label: 'Every two years', disabled: true }
];

const LONG: readonly RadioOption[] = [
  { value: 'keep', label: 'Keep every version of the file, including drafts nobody opened' },
  { value: 'latest', label: 'Keep only the latest version' },
  { value: 'none', label: 'Keep nothing once the project is archived and the team has been told' }
];

const SIZES: readonly RadioOption[] = [
  { value: 'xs', label: 'Extra small' },
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Medium' },
  { value: 'l', label: 'Large' },
  { value: 'xl', label: 'Extra large' }
];

function chosenLine(value: string): string {
  return value === '' ? 'Nothing chosen' : `Chosen: ${value}`;
}

/** Controlled from a cell, so the line under it shows each change. */
function Controlled(inputs: Inputs<{ start: string; options: readonly RadioOption[] }>, _ctx: ComponentContext) {
  const value = internalState(inputs.start.value);
  return (
    <column gap={8} x="start">
      <RadioGroup label="Delivery" options={inputs.options} {...bind(value)} />
      <text textStyle="bodySmall" color="textMuted">
        {value.pipe(map(chosenLine))}
      </text>
    </column>
  );
}

/** Moved from outside, including to a value no option has. */
function SetFromOutside(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState('express');
  return (
    <column gap={8} x="start">
      <RadioGroup label="Delivery" options={DELIVERY} {...bind(value)} />
      <row gap={8} flexWrap="wrap">
        <Button label="Courier" size="small" variant="outlined" onClick={() => (value.value = 'courier')} />
        <Button label="Unknown value" size="small" variant="outlined" onClick={() => (value.value = 'drone')} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {value.pipe(map(chosenLine))}
      </text>
    </column>
  );
}

/** Required, with the message derived from the value. */
function Required(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState('');
  return (
    <RadioGroup
      label="Delivery"
      options={DELIVERY}
      required
      {...bind(value)}
      error={value.pipe(map(chosen => (chosen === '' ? 'Choose a delivery option' : '')))}
    />
  );
}

export const radioGroupFixture: WorkbenchFixture = {
  id: 'radio-group',
  name: 'RadioGroup',
  source: 'packages/components/src/Radio.ts',
  states: [
    {
      name: 'Nothing chosen',
      try: 'No dot is filled. Tab onto the group (one ring around the whole group), press Down: the first option fills. Press Reset states, Tab in again and press Up: the last fills.',
      render: () => <Controlled start="" options={DELIVERY} />
    },
    {
      name: 'Keyboard',
      try: 'Tab in, then Down, Down, Down: the choice wraps from Courier back to Standard. Right and Left do the same as Down and Up. Home and End jump to the ends. Tab once more leaves the group.',
      render: () => <Controlled start="standard" options={DELIVERY} />
    },
    {
      name: 'Focus shows the choice',
      try: 'Click Express, then click outside. Tab back in: the chosen circle’s border turns accent while focused and goes back to plain when focus leaves.',
      render: () => <RadioGroup label="Delivery" options={DELIVERY} defaultValue="express" />
    },
    {
      name: 'Disabled options',
      try: 'Quarterly and Every two years are dimmed and refuse clicks. Arrows from Monthly go to Yearly and back, never landing on a disabled one. End goes to Yearly.',
      render: () => <Controlled start="monthly" options={WITH_GAP} />
    },
    {
      name: 'Disabled group',
      try: 'Every label dims, clicks do nothing, and Tab skips the group. The chosen dot is still visible but greyed.',
      render: () => <RadioGroup label="Delivery" options={DELIVERY} value="express" disabled />
    },
    {
      name: 'Set from outside',
      try: 'Press Courier: the dot moves. Press Unknown value: no dot is filled and the line says drone. Tab in and press Down: Standard is chosen again.',
      render: () => <SetFromOutside />
    },
    {
      name: 'Required with an error',
      try: 'The message shows under the options. Choose any option: the message goes, and the options do not jump up by more than the message’s height.',
      render: () => <Required />
    },
    {
      name: 'In a row',
      try: 'Options sit side by side with even gaps. Right and Left move the choice in reading order, including under Right to left.',
      width: 360,
      render: () => <RadioGroup label="Billing" options={WITH_GAP} defaultValue="monthly" direction="row" />
    },
    {
      name: 'Row in a narrow box',
      try: 'Five options in a row in a 220px card. Note whether they wrap, clip, or run past the card edge; none should be drawn over another.',
      width: 220,
      render: () => <RadioGroup label="Size" options={SIZES} defaultValue="m" direction="row" />
    },
    {
      name: 'Long labels in a narrow box',
      try: 'Each label wraps inside the card; the circles stay round, the same size, and line up in one column.',
      width: 190,
      render: () => <RadioGroup label="Retention" options={LONG} defaultValue="latest" />
    }
  ]
};
