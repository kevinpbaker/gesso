import { map } from 'rxjs/operators';

import { percent, scrollPosition } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';
import { HOVER_CONTROL } from './interaction';

/** Ten rows, which is more than the list is tall. */
const CITIES = [
  { name: 'Auckland', zone: 'UTC+12' },
  { name: 'Tokyo', zone: 'UTC+9' },
  { name: 'Delhi', zone: 'UTC+5:30' },
  { name: 'Berlin', zone: 'UTC+1' },
  { name: 'London', zone: 'UTC+0' },
  { name: 'Lisbon', zone: 'UTC+0' },
  { name: 'Recife', zone: 'UTC-3' },
  { name: 'Toronto', zone: 'UTC-5' },
  { name: 'Denver', zone: 'UTC-7' },
  { name: 'Honolulu', zone: 'UTC-10' }
] as const;

/** One row: a fixed height, so the arithmetic on the page is checkable. */
function City(inputs: Inputs<{ name: string; zone: string }>, _ctx: ComponentContext) {
  return (
    <row height={36} paddingLeft={10} paddingRight={10} x="space-between" y="center" borderRadius={6}>
      <text text={inputs.name} fontSize={13} color="text" />
      <text text={inputs.zone} fontSize={12} color="textMuted" />
    </row>
  );
}

export function ScrollingList(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const at = internalState(0);

  // #region list
  /**
   * A window over more rows than it can show.
   *
   * `scrollY` is an ordinary property, so it is bound like any other:
   * the cell drives the list, and writing the cell moves it. That is
   * the whole of programmatic scrolling, and it is also how a list
   * comes back where it was left after a route change, because the
   * offset is applied in the same layout that first places the rows.
   *
   * `scrollPosition` is the other direction. A wheel, a scrollbar
   * drag, a finger and a focus reveal all write the offset from inside
   * the runtime, so the cell would go stale without something reporting
   * back; `onChange` carries the offset the engine settled on, which is
   * the clamped one and not necessarily the one that was asked for.
   *
   * Nothing here sets `overscrollBehavior`. Its default chains a wheel
   * this list cannot use out to the page, so reaching the last row
   * hands the article back its scrolling instead of trapping it.
   */
  const list = (
    <scrollview
      height={180}
      width={percent(100)}
      gap={4}
      padding={8}
      scrollY={at}
      modifiers={[scrollPosition({ onChange: offset => (at.value = offset.y) })]}
      borderRadius={10}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface"
      role="list"
      label="Cities">
      {CITIES.map(city => (
        <City key={city.name} name={city.name} zone={city.zone} />
      ))}
    </scrollview>
  );
  // #endregion list

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)} y="center">
      {list}
      <row gap={12} y="center">
        <text
          text={at.pipe(map(offset => `${Math.round(offset)} px from the top`))}
          fontSize={12}
          color="textMuted"
          width={140}
        />
        <button
          label="Back to top"
          onClick={() => (at.value = 0)}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Back to top" fontSize={12} color="text" />
        </button>
      </row>
    </column>
  );
}
