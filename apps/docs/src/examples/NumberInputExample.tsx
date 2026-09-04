import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { NumberInput } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

/** What a seat costs, so the controlled value has somewhere to go. */
const PER_SEAT = 45;

// #region numbers
/**
 * Two number fields, and the two ways a value can be owned.
 *
 * **Guests is controlled.** The application holds the number and the
 * line below is derived from it, so the total can only ever be the
 * total of what the field shows. The button writes the cell directly.
 *
 * **Tip is uncontrolled**, and steps by a half, which is where the
 * snapping shows: `step` is what the arrows, the two buttons and the
 * typed text are all quantized to.
 *
 * A field holds text while it is being typed, because a half-written
 * "1." or "-" is not a number yet. Nothing is reported until the text
 * parses, and blurring normalises what is left there.
 */
export function Numbers(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const guests = internalState(2);
  const total = guests.pipe(map(count => `${count} × ${PER_SEAT} = ${count * PER_SEAT}`));

  return (
    <column gap={14} padding={20} width={percent(100)} height={percent(100)}>
      <NumberInput
        label="Guests"
        min={1}
        max={8}
        step={1}
        required
        value={guests}
        onChange={next => (guests.value = next)}
      />
      <row gap={12} y="center">
        <button
          label="Table for eight"
          onClick={() => (guests.value = 8)}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Table for eight" fontSize={12} color="text" />
        </button>
        <text text={total} fontSize={12} color="textMuted" />
      </row>
      <NumberInput label="Tip" min={0} max={20} step={0.5} defaultValue={2.5} />
    </column>
  );
}
// #endregion numbers
