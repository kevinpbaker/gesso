import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { RadioGroup, type RadioOption } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

// #region radiogroup
/**
 * The options, declared once at module scope rather than built in the
 * call: a fresh array every frame is new options as far as the group is
 * concerned, and it would rebuild the rows to say the same thing.
 */
const DELIVERY: readonly RadioOption[] = [
  { value: 'standard', label: 'Standard, five days' },
  { value: 'express', label: 'Express, two days' },
  { value: 'courier', label: 'Same-day courier' }
];

const BILLING: readonly RadioOption[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'biennial', label: 'Every two years', disabled: true }
];

/**
 * Two groups, one of each kind, and a keyboard worth trying.
 *
 * Click one of the groups and use the arrows. The whole group is a
 * single tab stop and the arrows move the choice within it, wrapping at
 * the ends and stepping over any option marked `disabled`. Home and End
 * jump to the first and last option that can be chosen.
 *
 * `Delivery` is controlled, so every arrow and every click goes to the
 * handler and the group shows only what the handler writes back. This
 * one declines the courier and says why, so the choice does not move to
 * it.
 *
 * `Billing period` was given `defaultValue`, so it owns its value.
 * `direction="row"` lays it out across instead of down; the arrows
 * work the same either way.
 *
 * A group's `label` is its accessible name and is not drawn, so the
 * heading above each one is the application's, in the application's own
 * type. Both strings say the same thing on purpose.
 */
export function Shipping(_props: Inputs<{}>, _ctx: ComponentContext) {
  const method = internalState('standard');
  const refused = internalState(false);

  return (
    <column gap={18} padding={20} width={percent(100)} height={percent(100)} y="center">
      <column gap={6}>
        <text text="Delivery" fontSize={13} fontWeight={600} color="text" />
        <RadioGroup
          label="Delivery"
          options={DELIVERY}
          value={method}
          onChange={next => {
            refused.value = next === 'courier';
            if (next !== 'courier') {
              method.value = next;
            }
          }}
        />
      </column>

      <column gap={6}>
        <text text="Billing period" fontSize={13} fontWeight={600} color="text" />
        <RadioGroup label="Billing period" options={BILLING} defaultValue="monthly" direction="row" />
      </column>

      <text
        text={refused.pipe(map(no => (no ? 'No courier reaches your address' : '')))}
        fontSize={12}
        color="danger"
      />
    </column>
  );
}
// #endregion radiogroup
