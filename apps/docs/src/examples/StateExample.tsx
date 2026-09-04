import { BehaviorSubject, combineLatest, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { channel, internalState, type ComponentContext, type Inputs } from '@gesso/framework';
import { HOVER_CONTROL } from './interaction';

// #region contract
/** One line of the basket, already shaped for the screen. */
export interface BasketLine {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
}

/** What the screen may read. Every key holds plain data. */
export interface BasketView {
  readonly lines: readonly BasketLine[];
  readonly total: string;
}

/** What the screen may ask for. No return values: the effect comes back as a patch. */
export interface BasketCommands {
  add(id: string): void;
  remove(id: string): void;
}

/**
 * The barrier, declared once and imported by both sides.
 *
 * A token is a name, a shape and an initial value, and no
 * implementation at all, so the module holding it has nothing in it to
 * bundle. The initial value is what the screen shows before the first
 * patch, which is why a view key is never `undefined`.
 */
export const Basket = channel<BasketView, BasketCommands>('docs-basket', { lines: [], total: '$0.00' });
// #endregion contract

const CATALOGUE = [
  { id: 'brush', name: 'Sable brush', price: 12 },
  { id: 'primer', name: 'Gesso primer', price: 9 },
  { id: 'panel', name: 'Birch panel', price: 24 }
] as const;

// #region app
/**
 * The application behind the channel: plain classes and plain RxJS,
 * with no framework import and nothing that knows a screen exists.
 *
 * Formatting `total` here rather than in the view is deliberate. The
 * layer holding the numbers is the last one with the whole value in
 * hand, and a string costs one small patch where a recomputed number
 * would cost the same patch plus a `map` on every binding that reads
 * it.
 */
export class BasketModel {
  private readonly counts = new BehaviorSubject<Readonly<Record<string, number>>>({ brush: 1 });

  readonly lines: Observable<readonly BasketLine[]> = this.counts.pipe(
    map(counts => CATALOGUE.map(item => ({ id: item.id, name: item.name, quantity: counts[item.id] ?? 0 })))
  );

  readonly total: Observable<string> = this.counts.pipe(
    map(counts => `$${CATALOGUE.reduce((sum, item) => sum + item.price * (counts[item.id] ?? 0), 0).toFixed(2)}`)
  );

  add(id: string): void {
    const counts = this.counts.value;
    this.counts.next({ ...counts, [id]: (counts[id] ?? 0) + 1 });
  }

  remove(id: string): void {
    const counts = this.counts.value;
    this.counts.next({ ...counts, [id]: Math.max(0, (counts[id] ?? 0) - 1) });
  }
}
// #endregion app

// #region source
/**
 * What the owning side supplies: one Observable per view key, one
 * handler per command. Registering it is the only place the two halves
 * of this file meet.
 */
export function basketSource() {
  const basket = new BasketModel();
  return {
    view: { lines: basket.lines, total: basket.total },
    commands: {
      add: (id: string) => basket.add(id),
      remove: (id: string) => basket.remove(id)
    }
  };
}
// #endregion source

// #region service
/**
 * Which line the reader is looking at.
 *
 * View state: it never leaves this thread, nothing outside the screen
 * cares about it, and it does not survive a reload. So it is a plain
 * class the runtime constructs once and hands to whoever injects it,
 * and `internalState` outside a component is only a `BehaviorSubject`
 * with a `.value` setter.
 */
export class Highlight {
  readonly id = internalState<string | null>(null);
}
// #endregion service

// #region send
/**
 * One line, holding both kinds of state at once.
 *
 * The name button writes the service directly, because the value stays
 * here. The two step buttons send a command, because the quantity
 * belongs to whoever owns the basket.
 */
function Line(inputs: Inputs<{ line: BasketLine }>, ctx: ComponentContext) {
  const basket = ctx.channel(Basket);
  const highlight = ctx.inject(Highlight);

  const background = combineLatest([inputs.line, highlight.id]).pipe(
    map(([line, id]) => (line.id === id ? 'controlBackground' : 'transparent'))
  );

  return (
    <row gap={8} y="center">
      <button
        label={inputs.line.pipe(map(line => `Look at ${line.name}`))}
        onClick={() => (highlight.id.value = inputs.line.value.id)}
        flex={1}
        padding={6}
        borderRadius={6}
        backgroundColor={background}
        cursor="pointer"
        modifiers={[HOVER_CONTROL]}>
        <text text={inputs.line.pipe(map(line => line.name))} fontSize={13} color="text" />
      </button>
      <text
        text={inputs.line.pipe(map(line => String(line.quantity)))}
        fontSize={13}
        color="textMuted"
        width={18}
        textAlign="center"
      />
      <Step
        label={inputs.line.pipe(map(line => `One fewer ${line.name}`))}
        glyph="−"
        onPress={() => basket.send.remove(inputs.line.value.id)}
      />
      <Step
        label={inputs.line.pipe(map(line => `One more ${line.name}`))}
        glyph="+"
        onPress={() => basket.send.add(inputs.line.value.id)}
      />
    </row>
  );
}
// #endregion send

// #region read
/**
 * The second screen. It reads the same two view keys and the same
 * service as the first, and knows where neither of them lives.
 *
 * `basket.view.total` is an `InputCell`, so it binds like any prop.
 * `items` is derived from `lines` and is therefore not stored
 * anywhere, and `looking` is one expression over a view key and a
 * service.
 */
function Summary(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const basket = ctx.channel(Basket);
  const highlight = ctx.inject(Highlight);

  const items = basket.view.lines.pipe(map(lines => lines.reduce((sum, line) => sum + line.quantity, 0)));
  const looking = combineLatest([basket.view.lines, highlight.id]).pipe(
    map(([lines, id]) => lines.find(line => line.id === id)?.name ?? 'nothing yet')
  );

  return (
    <column
      gap={8}
      width={170}
      padding={14}
      borderRadius={10}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface">
      <text text="Summary" fontSize={13} fontWeight={600} color="text" />
      <text text={basket.view.total} fontSize={22} fontWeight={600} color="text" />
      <text text={items.pipe(map(count => `${count} in the basket`))} fontSize={12} color="textMuted" />
      <text text={looking.pipe(map(name => `Looking at ${name}`))} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion read

/** A small square button, so a line reads as what it is. */
function Step(inputs: Inputs<{ label: string; glyph: string; onPress: () => void }>, _ctx: ComponentContext) {
  return (
    <button
      label={inputs.label}
      onClick={() => inputs.onPress.value()}
      width={26}
      height={26}
      x="center"
      y="center"
      borderRadius={6}
      borderWidth={1}
      borderColor="border"
      backgroundColor="background"
      cursor="pointer"
      modifiers={[HOVER_CONTROL]}>
      <text text={inputs.glyph} fontSize={14} color="text" />
    </button>
  );
}

/** Two panels, one basket. Neither panel passes anything to the other. */
export function StateScreen(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const basket = ctx.channel(Basket);
  const lines = basket.view.lines.pipe(map(rows => rows.map(line => <Line key={line.id} line={line} />)));

  return (
    <row gap={16} padding={20} y="start" width={percent(100)} height={percent(100)}>
      <column
        gap={10}
        flex={1}
        padding={14}
        borderRadius={10}
        borderWidth={1}
        borderColor="border"
        backgroundColor="surface">
        <text text="Basket" fontSize={13} fontWeight={600} color="text" />
        {lines}
      </column>
      <Summary />
    </row>
  );
}
