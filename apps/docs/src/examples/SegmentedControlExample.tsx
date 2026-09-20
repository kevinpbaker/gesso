import { percent } from 'gesso-core';
import { SegmentedControl, type SegmentedOption } from 'gesso-components';
import { computed, internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region segmented-control
/**
 * The options, declared once at module scope rather than built in the
 * call: a fresh array every frame is new options as far as the control
 * is concerned, and it would rebuild the segments to say the same
 * thing.
 */
const RANGE: readonly SegmentedOption[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' }
];

const DENSITY: readonly SegmentedOption[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' }
];

const EXPORT: readonly SegmentedOption[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
  { value: 'pdf', label: 'PDF', disabled: true }
];

/** What the report says, per range. The figure the first control drives. */
const BOOKINGS: Readonly<Record<string, number>> = { day: 18, week: 126, month: 504 };

/**
 * A report header, and the three things a segmented control is.
 *
 * Click any of them and use the arrows. Each track is a single tab
 * stop, so Tab moves past the whole control rather than through its
 * segments, and inside it the arrows move the choice as they go. Home
 * and End jump to the ends.
 *
 * `Range` is controlled: the application owns the value, and the
 * figure under it is derived from the same cell, so the control and
 * the number can never disagree. `Density` was given `defaultValue`
 * and owns its own value; it reports through `onChange`, which is what
 * the caption beside it reads. `Export` has a segment marked
 * `disabled`: PDF is drawn, greyed, refuses a click, and the arrows
 * step over it rather than landing on it.
 *
 * A control's `label` is its accessible name and is not drawn, so each
 * heading here is the application's own, in the application's own
 * type. Both strings say the same thing on purpose.
 */
export function Reports(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const range = internalState('week');
  const density = internalState('comfortable');

  return (
    <column gap={18} padding={20} width={percent(100)} height={percent(100)} y="center">
      <column gap={6}>
        <text text="Range" fontSize={13} fontWeight={600} color="text" />
        <SegmentedControl
          label="Range"
          options={RANGE}
          value={range}
          onChange={next => (range.value = next)}
          selfX="start"
        />
        <text
          text={computed(() => `${BOOKINGS[range.value] ?? 0} bookings this ${range.value}`)}
          fontSize={13}
          color="textMuted"
        />
      </column>

      <column gap={6}>
        <text text="Row density" fontSize={13} fontWeight={600} color="text" />
        <row gap={10} y="center">
          <SegmentedControl
            label="Row density"
            options={DENSITY}
            defaultValue="comfortable"
            size="small"
            onChange={next => (density.value = next)}
            selfX="start"
          />
          <text text={computed(() => `Saved as ${density.value}`)} fontSize={12} color="textMuted" />
        </row>
      </column>

      <column gap={6}>
        <text text="Export as" fontSize={13} fontWeight={600} color="text" />
        <SegmentedControl label="Export as" options={EXPORT} defaultValue="csv" size="small" selfX="start" />
        <text text="PDF export is not in this plan" fontSize={12} color="textMuted" />
      </column>
    </column>
  );
}
// #endregion segmented-control
