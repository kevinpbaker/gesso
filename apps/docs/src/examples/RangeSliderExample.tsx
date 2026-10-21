import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { RangeSlider } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

import { HOVER_CONTROL } from './interaction';

/**
 * How a price is shown and spoken.
 *
 * Declared here rather than in the call, because a prop that is a new
 * function on every render is a new value to bind every frame.
 */
const asDollars = (value: number) => `$${value}`;
/** The nightly prices of the hotels being filtered, so the span has something to count. */
const HOTELS = [65, 90, 120, 145, 180, 210, 260, 320, 410, 480];
/** What the two thumbs of the stay are called, in place of "Minimum stay" and "Maximum stay". */
const STAY_THUMBS = ['Check in', 'Check out'] as const;

// #region range
/**
 * Two range sliders, and the two ways a pair can be owned.
 *
 * **Price is controlled.** The application holds the pair and counts
 * the hotels inside it, so the line under the track can only ever be
 * about the span the track shows. The thumbs keep $50 apart, and Any
 * price writes the pair with no gesture at all.
 *
 * **Stay is uncontrolled.** One `defaultValue` and no `onChange`, its
 * thumbs named outright rather than derived from the label, and at
 * least one night between them.
 *
 * Each thumb is its own tab stop and its own slider. A press on the
 * track moves the nearer thumb, and a drag carries it as far as the
 * other one and no further.
 */
export function RangeSliders(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const price = internalState<readonly [number, number]>([100, 300]);
  const count = price.pipe(
    map(([low, high]) => {
      const inside = HOTELS.filter(cost => cost >= low && cost <= high).length;
      return `${inside} of ${HOTELS.length} hotels a night between $${low} and $${high}`;
    })
  );

  return (
    <column gap={16} padding={20} width={percent(100)} height={percent(100)}>
      <RangeSlider
        label="Price"
        min={0}
        max={500}
        step={5}
        minDistance={50}
        format={asDollars}
        value={price}
        onChange={next => (price.value = next)}
      />
      <row gap={12} y="center">
        <button
          label="Any price"
          onClick={() => (price.value = [0, 500])}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Any price" fontSize={12} color="text" />
        </button>
        <text text={count} fontSize={12} color="textMuted" />
      </row>
      <RangeSlider label="Stay" thumbLabels={STAY_THUMBS} min={1} max={31} minDistance={1} defaultValue={[10, 14]} />
    </column>
  );
}
// #endregion range
