import { map } from 'rxjs/operators';

import { Button, type ButtonTone, type ButtonVariant } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const VARIANTS: readonly ButtonVariant[] = ['filled', 'tonal', 'outlined', 'plain'];
const TONES: readonly ButtonTone[] = ['neutral', 'accent', 'danger'];

/** A button that says how many times it was pressed, so a press can be seen to land. */
function Counted(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const presses = internalState(0);
  return (
    <column gap={8} x="start">
      <Button label="Press me" onClick={() => (presses.value += 1)} />
      <text textStyle="bodySmall" color="textMuted">
        {presses.pipe(map(count => `Pressed ${count} times`))}
      </text>
    </column>
  );
}

/** Starts busy and can be toggled, so the change from busy to idle can be watched. */
function Busy(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const busy = internalState(true);
  return (
    <row gap={8} y="center">
      <Button label="Saving" busy={busy} />
      <Button label="Toggle busy" variant="outlined" onClick={() => (busy.value = !busy.value)} />
    </row>
  );
}

export const buttonFixture: WorkbenchFixture = {
  id: 'button',
  name: 'Button',
  source: 'packages/components/src/Button.ts',
  states: [
    {
      name: 'Default',
      try: 'Click it, then Tab onto it and press Space and Enter. The count goes up each time, and a focus ring shows only after Tab.',
      render: () => <Counted />
    },
    ...VARIANTS.map(variant => ({
      name: `Variant: ${variant}`,
      try: 'Hover and press each tone. Each one darkens on hover and again while held, and the labels stay readable.',
      width: 360,
      render: () => (
        <row gap={8} flexWrap="wrap">
          {TONES.map(tone => (
            <Button key={tone} label={tone} variant={variant} tone={tone} />
          ))}
        </row>
      )
    })),
    {
      name: 'Sizes',
      try: 'Labels are vertically centred in all three, and the three line up on their centres.',
      width: 360,
      render: () => (
        <row gap={8} y="center">
          <Button label="Small" size="small" />
          <Button label="Medium" size="medium" />
          <Button label="Large" size="large" />
        </row>
      )
    },
    {
      name: 'Disabled',
      try: 'Clicking does nothing, hovering does not change it, and Tab skips it.',
      width: 360,
      render: () => (
        <row gap={8} flexWrap="wrap">
          {VARIANTS.map(variant => (
            <Button key={variant} label={variant} variant={variant} disabled />
          ))}
        </row>
      )
    },
    {
      name: 'Busy',
      try: 'It reads as busy but not greyed out, and refuses presses. Toggle busy off and it presses again.',
      width: 320,
      render: () => <Busy />
    },
    {
      name: 'Long label in a narrow box',
      try: 'The label is clipped or wrapped inside the button, never drawn past its edge.',
      width: 160,
      render: () => <Button label="Export every selected report as a spreadsheet" />
    },
    {
      name: 'Out of the Tab order',
      try: 'Tab from the first button: focus goes past the middle one. Clicking the middle one still works.',
      width: 360,
      render: () => (
        <row gap={8}>
          <Button label="First" />
          <Button label="Skipped" tabStop={false} />
          <Button label="Last" />
        </row>
      )
    }
  ]
};
