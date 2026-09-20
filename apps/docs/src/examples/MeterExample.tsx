import { percent } from 'gesso-core';
import { Button, Meter, TextInput } from 'gesso-components';
import { computed, internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region meter
/** The whole disk, in gigabytes. */
const DISK_GB = 240;

/**
 * The two readings are written by functions declared once, at module
 * scope.
 *
 * `format` is a function prop, and a function prop is compared by
 * identity, so one written fresh inside the component body would be a
 * different function on every render and the reading would be rebound
 * every time anything else moved. These two are the same function for
 * the life of the page.
 */
const asGigabytes = (used: number) => `${Math.round(used)} GB of ${DISK_GB} GB used`;

const STRENGTHS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const;

const asStrength = (score: number) => STRENGTHS[Math.max(0, Math.min(STRENGTHS.length - 1, Math.round(score)))];

/** Length, then one point for each kind of character the password mixes. */
function scoreOf(password: string): number {
  if (password.length < 8) {
    return 0;
  }
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(kind => kind.test(password)).length;
  return Math.min(4, kinds + (password.length >= 14 ? 1 : 0));
}

/**
 * Two meters, pointing in opposite directions.
 *
 * Neither of these is a task, which is why neither is a progress bar.
 * A disk is 36% full right now and could be 30% full in a minute; a
 * password is as strong as it is and gets weaker if you delete a
 * character. Nothing here is on its way to being finished.
 *
 * **The disk is `optimum: 'low'`.** An empty disk is a good disk, so
 * at or below `low` the bar is the accent, above `high` it is `danger`,
 * and in between it is the muted ink. "Copy the photos" adds 120 GB in
 * one go, which pushes it from the good band clear through the middle
 * one and into the poor one, and the bar changes tone without this
 * example writing a single conditional about colour.
 *
 * **The password is `optimum: 'high'`.** Same three bands, read the
 * other way: a score at or below `low` is poor and one at or above
 * `high` is good. Type into the field and watch the bar walk up.
 *
 * Both pass a `format`, and both formatted readings are what an
 * assistive technology hears, because the component puts them in
 * `valueText`. "0.36" and "2" are not readings anybody can act on.
 * The text drawn beside each bar is the same string, drawn because
 * `showValue` is on; turning it off would change the picture and not
 * what is announced.
 */
export function Storage(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const used = internalState(86);
  const password = internalState('hunter2');
  const score = computed(() => scoreOf(password.value));

  return (
    <column gap={18} padding={20} width={percent(100)} height={percent(100)} y="center">
      <column gap={6}>
        <text text="Startup disk" fontWeight={600} />
        <Meter
          label="Startup disk"
          value={used}
          min={0}
          max={DISK_GB}
          low={DISK_GB / 2}
          high={DISK_GB * 0.8}
          optimum="low"
          showValue
          format={asGigabytes}
          width={percent(100)}
        />
        <row gap={8}>
          <Button
            label="Copy the photos"
            size="small"
            onClick={() => (used.value = Math.min(DISK_GB, used.value + 120))}
          />
          <Button label="Empty the bin" variant="outlined" size="small" onClick={() => (used.value = 86)} />
        </row>
      </column>

      <column gap={6}>
        <TextInput
          label="New password"
          value={password}
          onChange={next => (password.value = next)}
          width={percent(100)}
        />
        <Meter
          label="Password strength"
          value={score}
          min={0}
          max={4}
          low={1}
          high={3}
          optimum="high"
          showValue
          format={asStrength}
          width={percent(100)}
        />
      </column>
    </column>
  );
}
// #endregion meter
