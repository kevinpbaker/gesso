import { map } from 'rxjs/operators';

import { Button, NumberInput } from 'gesso-components';
import { bind, internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

interface EchoedProps {
  label: string;
  start: number;
  min?: number;
  max?: number;
  step?: number;
}

/** Controlled, with the reported value under it, so what landed can be compared with what is shown. */
function Echoed(inputs: Inputs<EchoedProps>, _ctx: ComponentContext) {
  const value = internalState(inputs.start.value);
  return (
    <column gap={8} x="stretch">
      <NumberInput label={inputs.label} min={inputs.min} max={inputs.max} step={inputs.step} {...bind(value)} />
      <text textStyle="bodySmall" color="textMuted">
        {value.pipe(map(current => `Value: ${current}`))}
      </text>
    </column>
  );
}

/** Bounded, and written from outside. */
function Guests(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const guests = internalState(2);
  return (
    <column gap={8} x="stretch">
      <NumberInput label="Guests" min={1} max={8} required {...bind(guests)} />
      <row gap={8} y="center">
        <Button label="Eight" size="small" variant="outlined" onClick={() => (guests.value = 8)} />
        <Button label="One" size="small" variant="outlined" onClick={() => (guests.value = 1)} />
        <text textStyle="bodySmall" color="textMuted">
          {guests.pipe(map(count => `Value: ${count}`))}
        </text>
      </row>
    </column>
  );
}

/** Required, with an error while the value is odd. */
function EvenOnly(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState(3);
  return (
    <NumberInput
      label="Team size"
      required
      {...bind(value)}
      error={value.pipe(map(count => (count % 2 === 0 ? '' : 'Teams pair up, so the size must be even')))}
    />
  );
}

export const numberInputFixture: WorkbenchFixture = {
  id: 'number-input',
  name: 'NumberInput',
  source: 'packages/components/src/NumberInput.ts',
  states: [
    {
      name: 'Default',
      try: 'Starts at 0. Press + and −: the value moves by one and the line follows. Click in and press Up and Down: the same. Tab walks field, −, + in that order, each with a focus ring.',
      stretch: true,
      render: () => <Echoed label="Quantity" start={0} />
    },
    {
      name: 'Bounded 1 to 8, set from outside',
      try: 'Press + until 8: it stops there and the next press does nothing. Press Eight and One: the field follows. Type 20: the field keeps 20 while you type, and Tab or Enter turns it into 8, with the line saying 8.',
      stretch: true,
      render: () => <Guests />
    },
    {
      name: 'Typing past the minimum',
      try: 'Min is 10. Select the text and type 15: the field shows 1, then 15, never 10, and the line says 15. Type 5 and Tab away: it becomes 10.',
      stretch: true,
      render: () => <Echoed label="Age" start={18} min={10} max={99} />
    },
    {
      name: 'Negative numbers',
      try: 'Select the text and type -5: the field keeps the lone - while you type and ends at -5. Press − from -50: it stays at -50.',
      stretch: true,
      render: () => <Echoed label="Offset" start={0} min={-50} max={50} />
    },
    {
      name: 'Decimal step',
      try: 'Press + three times from 0: it reads 0.1, 0.2, 0.3, never 0.30000000000000004. Type 0.25 and Tab away: it snaps to 0.2 or 0.3, and the line agrees with the field.',
      stretch: true,
      render: () => <Echoed label="Opacity" start={0} min={0} max={1} step={0.1} />
    },
    {
      name: 'Half steps',
      try: 'Press + from 2.5: 3, 3.5, 4. Type 7.3 and Tab away: it snaps to 7.5.',
      stretch: true,
      render: () => <Echoed label="Tip" start={2.5} min={0} max={20} step={0.5} />
    },
    {
      name: 'Leaving the field empty or wrong',
      try: 'Select all, delete, and Tab away: the field goes back to the value it had (7), not 0, not the minimum and not blank, and the line does not move. Then type abc and Tab away: the same.',
      stretch: true,
      render: () => <Echoed label="Retries" start={7} min={5} max={10} />
    },
    {
      name: 'Very large number in a narrow box',
      try: 'The digits scroll inside the field rather than spilling past it, and the − and + buttons keep their size. Press +: the last digit changes.',
      width: 170,
      stretch: true,
      render: () => <Echoed label="Bytes" start={9007199254740990} />
    },
    {
      name: 'Narrow box',
      try: 'In a 130px card the field gives way and the two buttons stay 28px wide, square to the field’s height, not overlapping.',
      width: 130,
      stretch: true,
      render: () => <NumberInput label="Qty" defaultValue={3} />
    },
    {
      name: 'Required with an error',
      try: 'Red border and the message under the field. Press + once: the value becomes even and the message goes.',
      stretch: true,
      render: () => <EvenOnly />
    },
    {
      name: 'Disabled',
      try: 'Field and both buttons dimmed. No caret, + and − do nothing, Up and Down do nothing, Tab skips all three.',
      stretch: true,
      render: () => <NumberInput label="Seats" value={4} disabled />
    },
    {
      name: 'Label hidden',
      try: 'No label and no gap above the field.',
      stretch: true,
      render: () => <NumberInput label="Page" labelHidden defaultValue={1} min={1} />
    }
  ]
};
