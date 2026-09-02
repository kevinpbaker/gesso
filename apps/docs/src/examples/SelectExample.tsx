import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { Select, type SelectOption } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

// #region select
/** The options, declared once: a fresh array per frame rebuilds every row. */
const PAYMENTS: readonly SelectOption[] = [
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'crypto', label: 'Crypto', disabled: true }
];

const SPEEDS: readonly SelectOption[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'express', label: 'Express' },
  { value: 'overnight', label: 'Overnight' }
];

/**
 * Two selects, and the two ways the value can be owned.
 *
 * **Payment is controlled.** The application holds the value and
 * refuses `Invoice`: choose it, from the list or by typing `i`, and
 * the trigger does not move, because what the component reports is a
 * request and what the application writes back is the value. `Crypto`
 * is disabled, so the arrows step over it and it cannot be chosen at
 * all.
 *
 * **Delivery is uncontrolled**, and was given no value of any kind, so
 * it starts empty and shows its placeholder. It is `required`, and
 * `invalid` until something is chosen, which is what draws its border
 * in the danger token and puts `invalid` on its record. It still calls
 * `onChange`, so the line underneath knows what happened without the
 * application owning the value.
 *
 * Neither one needs a pointer. Tab onto a trigger and press Enter,
 * Space or an arrow to open it; the arrows walk, Home and End jump, a
 * letter jumps to the option it starts, Enter chooses, and Escape
 * closes without choosing and puts the keyboard back on the trigger.
 */
export function Checkout(_props: Inputs<{}>, _ctx: ComponentContext) {
  const payment = internalState('card');
  const refused = internalState(false);
  const speed = internalState('');

  const summary = combineLatest([payment, speed]).pipe(
    map(([paid, sent]) => (sent === '' ? 'Choose a delivery speed to continue' : `Paying by ${paid}, sent ${sent}`))
  );

  return (
    <column gap={14} padding={20} width={percent(100)} height={percent(100)}>
      <Select
        label="Payment method"
        options={PAYMENTS}
        value={payment}
        onChange={next => {
          refused.value = next === 'invoice';
          if (next !== 'invoice') {
            payment.value = next;
          }
        }}
      />
      <text
        text={refused.pipe(map(no => (no ? 'Invoice needs an account manager' : '')))}
        fontSize={12}
        color="danger"
      />

      <Select
        label="Delivery"
        options={SPEEDS}
        placeholder="Pick a speed"
        required
        invalid={speed.pipe(map(chosen => chosen === ''))}
        onChange={next => (speed.value = next)}
      />

      <text text={summary} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion select
