import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { Button, ColorPicker, hsvOfHex } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** How a reported colour reads: its hex, its hue, saturation and value, and its opacity when it has one. */
function describe(color: string, changes: number): string {
  const { h, s, v } = hsvOfHex(color.slice(0, 7));
  const alpha = color.length === 9 ? `, a ${Math.round((Number.parseInt(color.slice(7), 16) / 255) * 100)}%` : '';
  return `Value: ${color} (h ${Math.round(h)}, s ${Math.round(s * 100)}%, v ${Math.round(v * 100)}%${alpha}). ${changes} changes.`;
}

/**
 * A picker whose value is held here, with a swatch drawn by the caller
 * and a line saying what the picker last reported, so the picker's own
 * preview can be checked against what it actually said.
 */
function Harness(
  inputs: Inputs<{ value: string; width?: number; alpha?: boolean; presets?: readonly string[] }>,
  _ctx: ComponentContext
) {
  const value = internalState(inputs.value.value);
  const changes = internalState(0);
  const presets = inputs.presets.value ?? [];
  return (
    <column gap={8} x="start">
      <ColorPicker
        value={value}
        width={inputs.width.value}
        alpha={inputs.alpha.value}
        label="Fill"
        onChange={color => {
          value.value = color;
          changes.value += 1;
        }}
      />
      <row gap={8} y="center">
        <box
          width={20}
          height={20}
          borderRadius={4}
          borderWidth={1}
          borderColor="border"
          backgroundColor={value.pipe(
            map(color => (/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : 'transparent'))
          )}
        />
        <text textStyle="bodySmall" color="textMuted" textWrap="word">
          {combineLatest([value, changes]).pipe(map(([color, count]) => describe(color, count)))}
        </text>
      </row>
      {presets.length === 0 ? null : (
        <row gap={6} flexWrap="wrap">
          {presets.map(preset => (
            <Button
              key={preset}
              label={preset === '' ? '(empty)' : preset}
              size="small"
              variant="outlined"
              onClick={() => (value.value = preset)}
            />
          ))}
        </row>
      )}
    </column>
  );
}

/** Two pickers on one value: each follows the other. */
function Twins(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState('#e69138');
  return (
    <column gap={10} x="start">
      <row gap={12}>
        <ColorPicker value={value} width={140} label="Left" onChange={color => (value.value = color)} />
        <ColorPicker value={value} width={140} label="Right" onChange={color => (value.value = color)} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {value.pipe(map(color => `Shared value: ${color}`))}
      </text>
    </column>
  );
}

export const colorPickerFixture: WorkbenchFixture = {
  id: 'color-picker',
  name: 'ColorPicker',
  source: 'packages/components/src/ColorPicker.ts',
  states: [
    {
      name: 'Drag',
      try: 'Drag in the square: the ring stays under the pointer and the swatches and line follow. Drag out past each edge: the ring stops at the edge, it does not leave the square. Drag the hue bar end to end: the square’s colour sweeps the rainbow and red at both ends.',
      width: 300,
      render: () => <Harness value="#3366cc" />
    },
    {
      name: 'Keyboard',
      try: 'Tab to the square: a focus ring shows. Arrows move saturation and brightness by 1%, Shift+arrows by 10%, and stop at the edges. Tab to the hue bar: Left and Right move the hue; at 0 and at 360 it stops rather than wrapping.',
      width: 300,
      render: () => <Harness value="#3366cc" />
    },
    {
      name: 'Black',
      try: 'The ring is at the bottom-left and visible against black. Move the hue bar: the square’s colour changes but the value stays #000000. Press Up in the square: the colour lightens in the hue you chose.',
      width: 300,
      render: () => <Harness value="#000000" />
    },
    {
      name: 'White',
      try: 'The ring is at the top-left and can actually be seen against white. The swatches and field read #ffffff. Press Right in the square: the colour picks up a tint of the hue under the bar.',
      width: 300,
      render: () => <Harness value="#ffffff" />
    },
    {
      name: 'Typing a hex',
      try: 'Select the field and type 00ff00, then #0f0, then #0000FF: each time the square, the ring, the picker’s own swatch beside the field, and the line all change. Then type zzz and #12345: nothing else changes, and leaving the field does not lose the last good colour.',
      width: 300,
      render: () => <Harness value="#cc4125" />
    },
    {
      name: 'Values it cannot show',
      try: 'Press each preset. #ff000080 has alpha and transparent is a word: this picker is not given `alpha`, so it keeps or falls back to a solid colour without a broken field. Empty and "nonsense" leave it where it was. #F0F reads as #ff00ff.',
      width: 300,
      render: () => (
        <Harness value="#00000000" presets={['#ff000080', 'transparent', '', 'nonsense', '#F0F', '#1155cc']} />
      )
    },
    {
      name: 'Alpha',
      try: 'An opacity strip sits under the hue bar, the colour fading into a checkerboard at its left end. Drag it: the picker’s swatch and the one beside the line show the checkerboard through the colour, and the field and line end in two more digits. Tab to the strip: Left and Right move 1%, Shift 10%, stopping at 0% and 100%. Move the square or the hue: the opacity stays.',
      width: 300,
      render: () => <Harness value="#3366cc80" alpha />
    },
    {
      name: 'Alpha from hex',
      try: 'Type #f008 in the field: it reads as #ff000088 and the strip’s ring moves to about 53%. Type #00ff00: it is solid green, reported as #00ff00ff. Press the presets: #1155cc becomes fully opaque, #ff000000 is fully see-through with the ring at the left, and nonsense leaves it where it was.',
      width: 300,
      render: () => <Harness value="#cc4125" alpha presets={['#1155cc', '#ff000000', '#0f08', 'nonsense']} />
    },
    {
      name: 'A grey keeps its hue',
      try: 'Starts blue. Hold Shift+Left in the square until it is grey (saturation 0), then Shift+Right: it comes back blue, not red. Do the same by typing 808080 in the field and then dragging right in the square.',
      width: 300,
      render: () => <Harness value="#3399ff" />
    },
    {
      name: 'Narrow',
      try: 'Width 120. The square, the bar and the field share the width; the hex in the field is not cut off, and the swatch beside it keeps its size.',
      width: 220,
      render: () => <Harness value="#38761d" width={120} />
    },
    {
      name: 'Two on one value',
      try: 'Drag in either picker: the other follows smoothly, with no jitter or fight between them, and the ring in the picker you are dragging stays under the pointer.',
      width: 360,
      render: () => <Twins />
    }
  ]
};
