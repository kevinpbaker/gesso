import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { DatePicker } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region date-picker
/**
 * A start and a due date, each bounded by the other.
 *
 * The values are `YYYY-MM-DD` strings, so nothing here can be a day out
 * in another time zone. Start can't be after due, and due can't be
 * before start: each passes its value to the other as `max` or `min`,
 * and the calendar keeps its cursor inside, greys the days outside and
 * refuses them.
 *
 * Neither needs a pointer. Tab to a trigger and press Enter: the arrows
 * move a day or a week, PageUp and PageDown a month (with Shift, a year),
 * Home and End the week's ends, Enter chooses and Escape closes.
 */
export function Schedule(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const start = internalState('2026-10-05');
  const due = internalState('2026-10-23');

  const length = combineLatest([start, due]).pipe(
    map(([from, to]) => {
      if (from === '' || to === '') {
        return 'Pick both dates to see how long it runs';
      }
      const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
      return `${days} day${days === 1 ? '' : 's'}`;
    })
  );

  return (
    <column gap={14} padding={20} width={percent(100)} height={percent(100)}>
      <DatePicker label="Start date" value={start} max={due} onChange={next => (start.value = next)} />
      <DatePicker label="Due date" value={due} min={start} onChange={next => (due.value = next)} />
      <text text={length} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion date-picker
