import { map } from 'rxjs/operators';

import { Button, Checkbox } from 'gesso-components';
import { bind, internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const yesNo = (on: boolean): string => (on ? 'yes' : 'no');

/** Self-managing, but reporting, so a person can see each toggle land. */
function Uncontrolled(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const seen = internalState(false);
  return (
    <column gap={8} x="start">
      <Checkbox label="Remember this device" onChange={next => (seen.value = next)} />
      <text textStyle="bodySmall" color="textMuted">
        {seen.pipe(map(on => `Checked: ${yesNo(on)}`))}
      </text>
    </column>
  );
}

/** Controlled, and moved from outside as well as by the box itself. */
function SetFromOutside(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const checked = internalState(true);
  return (
    <column gap={8} x="start">
      <Checkbox label="Email me a receipt" {...bind(checked, 'checked')} />
      <row gap={8} y="center">
        <Button
          label="Flip from outside"
          size="small"
          variant="outlined"
          onClick={() => (checked.value = !checked.value)}
        />
        <text textStyle="bodySmall" color="textMuted">
          {checked.pipe(map(on => `Checked: ${yesNo(on)}`))}
        </text>
      </row>
    </column>
  );
}

/** A controlled box whose owner refuses the change until another box is ticked. */
function Refusing(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const terms = internalState(false);
  const updates = internalState(false);
  return (
    <column gap={8} x="start">
      <Checkbox label="Accept the terms" {...bind(terms, 'checked')} />
      <Checkbox
        label="Send me product updates"
        checked={updates}
        onChange={next => {
          if (terms.value) {
            updates.value = next;
          }
        }}
      />
    </column>
  );
}

/** Required, with the message derived from the value, so ticking clears it. */
function RequiredWithError(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const agreed = internalState(false);
  return (
    <Checkbox
      label="I have read the safety notes"
      required
      {...bind(agreed, 'checked')}
      error={agreed.pipe(map(on => (on ? '' : 'Tick this to continue')))}
    />
  );
}

export const checkboxFixture: WorkbenchFixture = {
  id: 'checkbox',
  name: 'Checkbox',
  source: 'packages/components/src/Checkbox.ts',
  states: [
    {
      name: 'Default',
      try: 'Click the box, then click the label: both toggle it and the line follows. Tab onto it: a focus ring shows. Space and Enter each toggle it.',
      render: () => <Uncontrolled />
    },
    {
      name: 'Starts checked',
      try: 'It draws ticked on first paint with the tick centred in the box, and unticks on the first click.',
      render: () => <Checkbox label="Remember this device" defaultChecked />
    },
    {
      name: 'Set from outside',
      try: 'Press the button: the box follows without being touched. Click the box: the line follows. The two never disagree.',
      width: 320,
      render: () => <SetFromOutside />
    },
    {
      name: 'Controlled, refusing',
      try: 'Click the second box: nothing happens. Tick the first, then the second ticks. A refused click leaves no tick behind, not even for a frame.',
      render: () => <Refusing />
    },
    {
      name: 'Disabled',
      try: 'Neither box responds to a click or hover, and Tab skips both. The ticked one is greyed rather than accent coloured, and both labels are dimmed.',
      render: () => (
        <column gap={8} x="start">
          <Checkbox label="Import from the old account" checked={false} disabled />
          <Checkbox label="Already imported" checked disabled />
        </column>
      )
    },
    {
      name: 'Required with an error',
      try: 'The border is red and the message sits under the box, lined up with it. Tick it: the message and the red both go. Untick: both come back.',
      render: () => <RequiredWithError />
    },
    {
      name: 'Invalid, no message',
      try: 'The border is red and nothing is drawn under it: no empty gap where a message would go.',
      render: () => <Checkbox label="Confirm" invalid />
    },
    {
      name: 'Long label in a narrow box',
      try: 'The label wraps inside the card; the box stays an 18px square and does not shrink or stretch. Clicking any line of the label toggles it.',
      width: 170,
      render: () => (
        <Checkbox label="Send me a weekly summary of every report my team exported, by email" defaultChecked />
      )
    },
    {
      name: 'Long error in a narrow box',
      try: 'The message wraps under the box and stays inside the card.',
      width: 170,
      render: () => (
        <Checkbox label="Agree" error="You must agree to the terms of service before the account can be created" />
      )
    },
    {
      name: 'A list of boxes',
      try: 'Tab from the first: focus walks every box in order and the ring is visible on each. The boxes line up in one column whatever their labels.',
      render: () => (
        <column gap={4} x="start">
          <Checkbox label="Bug" defaultChecked />
          <Checkbox label="Feature request" />
          <Checkbox label="Performance" defaultChecked />
          <Checkbox label="Docs" />
          <Checkbox label="Accessibility" />
        </column>
      )
    }
  ]
};
