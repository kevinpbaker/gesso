import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import type { UiChild, UiNode } from 'gesso-core';
import { Button, ColorPalette, ColorPicker, type PaletteColor } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs, type OverlayPlacement } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** Three rows of different lengths, to walk the arrows across. */
const RAGGED: readonly (readonly PaletteColor[])[] = [
  [
    { value: '#ff0000', name: 'red' },
    { value: '#00ff00', name: 'green' },
    { value: '#0000ff', name: 'blue' }
  ],
  Array.from({ length: 10 }, (_, at) => {
    const grey = Math.round((at / 9) * 255)
      .toString(16)
      .padStart(2, '0');
    return { value: `#${grey}${grey}${grey}`, name: `grey ${at + 1}` };
  }),
  [{ value: '#ff9900', name: 'the only orange' }]
];

interface HarnessProps {
  value?: string;
  recent?: readonly string[];
  /** Whether choosing a colour puts it at the front of the recent row. */
  remember?: boolean;
  colors?: readonly (readonly PaletteColor[])[];
  automaticLabel?: string;
  placement?: OverlayPlacement;
  /** Offer "Custom colour…", which opens a picker under the trigger. */
  custom?: boolean;
}

/**
 * A trigger, the palette it opens, and a line saying what was chosen
 * and how the palette last closed.
 */
function Harness(inputs: Inputs<HarnessProps>, _ctx: ComponentContext) {
  const anchor = internalState<UiNode | null>(null);
  const open = internalState(false);
  const value = internalState(inputs.value.value ?? '');
  const recent = internalState<readonly string[]>(inputs.recent.value ?? []);
  const picking = internalState(false);
  const events = internalState('Not opened yet');
  const remember = inputs.remember.value === true;

  const choose = (color: string): void => {
    value.value = color;
    events.value = `Chose ${color === '' ? 'automatic' : color}`;
    if (remember && color !== '') {
      recent.value = [color, ...recent.value.filter(entry => entry !== color)];
    }
  };

  return (
    <column gap={8} x="start">
      <row gap={8} y="center">
        <Button
          ref={(node: UiNode | null) => (anchor.value = node)}
          label="Fill colour"
          variant="outlined"
          onClick={() => {
            open.value = true;
            events.value = 'Open';
          }}
        />
        <box
          width={24}
          height={24}
          borderRadius={4}
          borderWidth={1}
          borderColor="border"
          backgroundColor={value.pipe(map(color => (color === '' ? 'transparent' : color)))}
        />
      </row>
      <ColorPalette
        open={open}
        onOpenChange={next => {
          open.value = next;
          if (!next && events.value === 'Open') {
            events.value = 'Closed without a choice';
          }
        }}
        anchor={anchor}
        placement={inputs.placement.value}
        value={value}
        onSelect={choose}
        recent={recent}
        colors={inputs.colors.value}
        automaticLabel={inputs.automaticLabel.value}
        label="Fill colour"
        onCustom={
          inputs.custom.value === true
            ? () => {
                picking.value = true;
                events.value = 'Custom colour asked for';
              }
            : undefined
        }
      />
      <text textStyle="bodySmall" color="textMuted">
        {combineLatest([value, events]).pipe(
          map(([color, said]) => `Value: ${color === '' ? '(automatic)' : color}. ${said}.`)
        )}
      </text>
      {picking.pipe(
        map((on): UiChild | readonly UiChild[] =>
          on ? (
            <column gap={6}>
              <ColorPicker value={value} width={180} label="Custom fill" onChange={color => (value.value = color)} />
              <Button label="Done" size="small" onClick={() => (picking.value = false)} />
            </column>
          ) : (
            []
          )
        )
      )}
    </column>
  );
}

export const colorPaletteFixture: WorkbenchFixture = {
  id: 'color-palette',
  name: 'ColorPalette',
  source: 'packages/components/src/ColorPalette.ts',
  states: [
    {
      name: 'Choose with the mouse',
      try: 'Open it: the grid hangs below the button, inside the window. Hover swatches: a ring moves with the pointer and the swatch keeps its own colour. Click red: it closes, the square beside the button turns red, and the line says #ff0000.',
      width: 300,
      height: 120,
      render: () => <Harness />
    },
    {
      name: 'Choose with the keyboard',
      try: 'Tab to the button, press Enter. The ring starts on the current blue. Arrows walk the grid (Left and Right wrap in a row), Home and End go to the row ends, Enter chooses and closes. Tab does not leave the open palette.',
      width: 300,
      height: 120,
      render: () => <Harness value="#4a86e8" />
    },
    {
      name: 'Recent colours',
      try: 'Twelve recent colours are passed; at most ten show, in a row above the grid with a gap under it. Choose a grid colour and reopen: it is now first in the recent row and ringed there and in the grid.',
      width: 300,
      height: 120,
      render: () => (
        <Harness
          remember
          recent={[
            '#ff0000',
            '#00ff00',
            '#0000ff',
            '#ffff00',
            '#00ffff',
            '#ff00ff',
            '#000000',
            '#ffffff',
            '#999999',
            '#ff9900',
            '#9900ff',
            '#123456'
          ]}
        />
      )
    },
    {
      name: 'Automatic is the value',
      try: 'Reopen after choosing anything: "No fill" is highlighted as the current choice only while the value is empty. Choose No fill: the line says (automatic) and the square beside the button is empty.',
      width: 300,
      height: 120,
      render: () => <Harness automaticLabel="No fill" />
    },
    {
      name: 'A value written differently',
      try: 'The value is #FF0000 in upper case: red is ringed when it opens and the keyboard starts there. (A value not in the grid, like #123456, should ring nothing and start on No fill.)',
      width: 300,
      height: 120,
      render: () => <Harness value="#FF0000" />
    },
    {
      name: 'Rows of different lengths',
      try: 'Choose the last grey, reopen, press Down: the ring lands on "the only orange", not off the end. Up from there goes back to a grey near the right. Right on the three-swatch row wraps blue back to red.',
      width: 300,
      height: 120,
      render: () => <Harness colors={RAGGED} />
    },
    {
      name: 'Custom colour…',
      try: '"Custom colour…" sits at the foot with a rainbow chip, reachable with Down. Choose it: the palette closes and a picker appears below. Drag in the picker: the square beside the button follows.',
      width: 300,
      height: 380,
      render: () => <Harness custom value="#3c78d8" />
    },
    {
      name: 'Escape and outside press',
      try: 'Open, press Escape: it closes and the line says "Closed without a choice". Open again and click elsewhere on the page: it closes the same way. The button opens it again every time.',
      width: 300,
      height: 120,
      render: () => <Harness />
    },
    {
      name: 'Opening upwards at the end',
      try: 'Placement top-end: the palette opens above the button, its right edge lined up with the button’s, and never off the top of the window (it flips or shifts if there is no room).',
      width: 300,
      height: 120,
      render: () => <Harness placement="top-end" />
    }
  ]
};
