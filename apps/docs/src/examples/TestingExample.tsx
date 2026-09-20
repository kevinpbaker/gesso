import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { Checkbox } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

import { HOVER_CONTROL } from './interaction';

// #region row
/** The width the count sits in, so the row does not move when 9 becomes 10. */
const COUNT_WIDTH = 36;

const MAX_TICKETS = 6;

/**
 * A quantity row: two steppers, a checkbox, and a line that says what
 * the order now is.
 *
 * Nothing here is written for a test. The two buttons carry a `label`
 * because `-` and `+` are not names a person can act on, the checkbox
 * is a real control with a keyboard of its own, and the summary is
 * derived from both cells rather than written out twice. Those three
 * properties are also what makes the spec beside this file short.
 */
export function TicketRow(_inputs: Inputs<{}>, _context: ComponentContext) {
  const tickets = internalState(1);
  const wrapped = internalState(false);

  const summary = combineLatest([tickets, wrapped]).pipe(
    map(([count, gift]) => `${count} ticket${count === 1 ? '' : 's'}${gift ? ', gift wrapped' : ''}`)
  );

  const step = (by: number) => () => {
    tickets.value = Math.min(MAX_TICKETS, Math.max(0, tickets.value + by));
  };

  return (
    <column gap={12} padding={16} width={percent(100)}>
      <row gap={8} y="center">
        <text text="Tickets" fontSize={14} width={72} />
        <button
          label="One fewer ticket"
          onClick={step(-1)}
          disabled={tickets.pipe(map(count => count === 0))}
          padding={6}
          borderRadius={6}
          backgroundColor="controlBackground"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="-" fontSize={14} />
        </button>
        <text text={tickets.pipe(map(String))} fontSize={14} width={COUNT_WIDTH} textAlign="center" />
        <button
          label="One more ticket"
          onClick={step(1)}
          disabled={tickets.pipe(map(count => count === MAX_TICKETS))}
          padding={6}
          borderRadius={6}
          backgroundColor="controlBackground"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="+" fontSize={14} />
        </button>
      </row>
      <Checkbox label="Gift wrap this order" checked={wrapped} onChange={next => (wrapped.value = next)} />
      <text text={summary} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion row
