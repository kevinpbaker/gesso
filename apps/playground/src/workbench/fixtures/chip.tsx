import { map } from 'rxjs/operators';

import { Chip, type ChipSize, type ChipVariant } from 'gesso-components';
import { computed, internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const VARIANTS: readonly ChipVariant[] = ['filled', 'outlined'];
const SIZES: readonly ChipSize[] = ['small', 'medium'];

const HEART =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

/** A chip that owns its value and reports every press. */
function Toggling(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const on = internalState(false);
  const presses = internalState(0);
  return (
    <column gap={8} x="start">
      <Chip
        label="Verified only"
        defaultSelected={false}
        onPress={next => {
          on.value = next;
          presses.value += 1;
        }}
      />
      <text textStyle="bodySmall" color="textMuted">
        {computed(() => `${on.value ? 'On' : 'Off'}, pressed ${presses.value} times`)}
      </text>
    </column>
  );
}

/** Chips the caller owns, one on at a time. */
function OneOf(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const genres = ['Electronic', 'Metal', 'Folk', 'Jazz'];
  const chosen = internalState<string | null>(null);
  return (
    <column gap={8} x="start">
      <row gap={8} rowGap={8} flexWrap="wrap">
        {genres.map(genre => (
          <Chip
            key={genre}
            label={genre}
            selected={chosen.pipe(map(value => value === genre))}
            onPress={() => (chosen.value = chosen.value === genre ? null : genre)}
          />
        ))}
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {chosen.pipe(map(value => `Selected: ${value ?? 'none'}`))}
      </text>
    </column>
  );
}

/** A chip with neither form of value: a plain button that never stays on. */
function Plain(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const presses = internalState(0);
  return (
    <column gap={8} x="start">
      <Chip label="Clear filters" variant="outlined" onPress={() => (presses.value += 1)} />
      <text textStyle="bodySmall" color="textMuted">
        {presses.pipe(map(count => `Cleared ${count} times`))}
      </text>
    </column>
  );
}

export const chipFixture: WorkbenchFixture = {
  id: 'chip',
  name: 'Chip',
  source: 'packages/components/src/Chip.ts',
  states: [
    {
      name: 'Self-managing',
      try: 'Click: it turns on and the line says On; click again: Off. Tab onto it (a ring appears), then Space and Enter each toggle it.',
      render: () => <Toggling />
    },
    ...VARIANTS.map(variant => ({
      name: `Variant: ${variant}`,
      try: 'Off and on in both sizes. On is clearly different from off, hover darkens both, and the words stay readable. Small and medium chips centre on one line.',
      width: 360,
      render: () => (
        <column gap={8} x="start">
          {SIZES.map(size => (
            <row key={size} gap={8} y="center">
              <Chip label={`${size} off`} variant={variant} size={size} selected={false} />
              <Chip label={`${size} on`} variant={variant} size={size} selected />
            </row>
          ))}
        </column>
      )
    })),
    {
      name: 'One of several',
      try: 'Click Metal, then Folk: only one is on at a time and the line follows. Clicking the one that is on turns it off.',
      width: 340,
      render: () => <OneOf />
    },
    {
      name: 'Plain button',
      try: 'Click it several times: the count goes up but the chip never stays on.',
      render: () => <Plain />
    },
    {
      name: 'Icon and count',
      try: 'The heart and the count are vertically centred with the word in both sizes; the count is lighter than the word, not bold.',
      width: 360,
      render: () => (
        <column gap={8} x="start">
          {SIZES.map(size => (
            <row key={size} gap={8} y="center">
              <Chip label="Liked" icon={HEART} size={size} defaultSelected />
              <Chip label="Metal" count="119,205" size={size} variant="outlined" defaultSelected={false} />
              <Chip label="Folk" icon={HEART} count={32} size={size} variant="outlined" defaultSelected={false} />
            </row>
          ))}
        </column>
      )
    },
    {
      name: 'Disabled',
      try: 'Both read as disabled (off and on). Clicking changes nothing, hover does nothing, and Tab skips them.',
      width: 320,
      render: () => (
        <row gap={8}>
          <Chip label="Offline only" variant="outlined" disabled defaultSelected={false} />
          <Chip label="Downloaded" disabled defaultSelected />
        </row>
      )
    },
    {
      name: 'Long label in a narrow box',
      try: 'The label stays on one line inside an unbroken pill and is never squashed; note whether it runs past the card edge.',
      width: 160,
      render: () => <Chip label="Only artists verified this year" variant="outlined" defaultSelected={false} />
    },
    {
      name: 'Many, wrapping',
      try: 'Chips wrap onto new rows with even gaps, every row the same height, and Tab walks them in reading order.',
      width: 280,
      render: () => (
        <row gap={6} rowGap={6} flexWrap="wrap">
          {['Ambient', 'Blues', 'Classical', 'Drum and bass', 'Electronic', 'Folk', 'Garage', 'Hip hop', 'Jazz'].map(
            genre => (
              <Chip key={genre} label={genre} size="small" variant="outlined" defaultSelected={genre === 'Folk'} />
            )
          )}
        </row>
      )
    }
  ]
};
