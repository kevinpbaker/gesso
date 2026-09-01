import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { input, internalState, type ComponentContext, type Inputs } from '@gesso/framework';

const PRICE_USD = 12.5;
const RATES = { USD: 1, EUR: 0.92 } as const;

type Currency = keyof typeof RATES;

// #region line
/**
 * One order line, holding all three kinds of value at once.
 *
 *  - `currency` comes from the parent. `input()` reads the prop cell
 *    and gives it a default, so the line follows a parent that changes
 *    its mind — without this body running a second time.
 *  - `quantity` is the line's own. `internalState` is for what
 *    originates here and dies with the component.
 *  - `total` is derived, and is therefore **not** a cell. It is one
 *    expression over the two above: nothing to keep in sync, nothing to
 *    invalidate, and no way for it to disagree with them.
 */
function OrderLine(props: Inputs<{ currency?: Currency }>, _ctx: ComponentContext) {
  const currency = input(props.currency, 'USD');
  const quantity = internalState(1);

  const total = combineLatest([currency, quantity]).pipe(
    map(([unit, count]) => `${unit === 'EUR' ? '€' : '$'}${(count * PRICE_USD * RATES[unit]).toFixed(2)}`)
  );

  return (
    <row gap={14} y="center">
      <text text="Widget" fontSize={14} color="text" width={70} />
      <Step label="Fewer" glyph="−" onPress={() => (quantity.value = Math.max(1, quantity.value - 1))} />
      <text text={quantity.pipe(map(String))} fontSize={14} color="text" width={20} textAlign="center" />
      <Step label="More" glyph="+" onPress={() => quantity.value++} />
      <text text={total} fontSize={15} color="text" width={70} textAlign="right" />
    </row>
  );
}
// #endregion line

/** A small square button, so the line above reads as what it is. */
function Step(props: Inputs<{ label: string; glyph: string; onPress: () => void }>, _ctx: ComponentContext) {
  return (
    <button
      label={props.label}
      onClick={() => props.onPress.value()}
      width={26}
      height={26}
      x="center"
      y="center"
      borderRadius={6}
      borderWidth={1}
      borderColor="border"
      backgroundColor="background">
      <text text={props.glyph} fontSize={14} color="text" />
    </button>
  );
}

export function Cells(_props: Inputs<{}>, _ctx: ComponentContext) {
  const currency = internalState<Currency>('USD');

  return (
    <column gap={18} x="center" y="center" width={percent(100)} height={percent(100)}>
      <column gap={12} padding={18} borderRadius={10} borderWidth={1} borderColor="border" backgroundColor="surface">
        <OrderLine currency={currency} />
        <OrderLine currency={currency} />
      </column>

      <button
        label="Switch currency"
        onClick={() => (currency.value = currency.value === 'USD' ? 'EUR' : 'USD')}
        padding={8}
        borderRadius={6}
        backgroundColor="primary">
        <text text={currency.pipe(map(unit => `Showing ${unit} — switch`))} fontSize={13} color="background" />
      </button>
    </column>
  );
}
