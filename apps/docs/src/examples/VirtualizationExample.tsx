import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { LazyColumn, percent, scrollPosition } from 'gesso-core';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

import { HOVER_CONTROL } from './interaction';

/** The height every row actually is, and the estimate the window is given. */
const ROW = 28;
const STARTING_ROWS = 50000;

// #region lazy
/**
 * Fifty thousand rows, of which about a dozen exist.
 *
 * `LazyColumn` is a `ScrollView` whose children are produced by a
 * window: a spacer standing in for the rows above, the rows in view
 * plus an overscan band, and a spacer for the rows below. Every other
 * ScrollView property still applies, which is why this one takes a
 * height, a background and a bound `scrollY` like any other.
 *
 * Three things about it are worth reading off the code.
 *
 *  - **`renderRow` is a function of the index, not a list of children.**
 *    It is called once per mounted row, so nothing is built for a row
 *    nobody can see. That is the whole of the saving.
 *  - **`count` is bound.** The `lazySource` modifier feeds the window
 *    the count, so "Add 10,000" changes a cell and the list follows,
 *    dropping the measurements of rows that no longer exist.
 *  - **`revision` says the indices mean something new.** Reversing the
 *    order does not move a row anywhere; it changes what row 12 *is*.
 *    The mounted rows are rendered again in place, keys unchanged, so
 *    the list does not jump.
 */
export function Feed(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const count = internalState(STARTING_ROWS);
  const newestFirst = internalState(false);
  const at = internalState(0);

  const renderRow = (index: number) => {
    const ordinal = newestFirst.value ? count.value - 1 - index : index;
    return (
      <row height={ROW} paddingLeft={10} paddingRight={10} x="space-between" y="center">
        <text text={`Entry ${ordinal.toLocaleString('en-US')}`} fontSize={12} color="text" />
        <text text={`row ${index.toLocaleString('en-US')}`} fontSize={11} color="textMuted" />
      </row>
    );
  };

  const list = LazyColumn(
    {
      width: percent(100),
      height: 220,
      count,
      revision: newestFirst,
      estimatedExtent: ROW,
      scrollY: at,
      modifiers: [scrollPosition({ onChange: offset => (at.value = offset.y) })],
      padding: 4,
      borderWidth: 1,
      borderColor: 'border',
      borderRadius: 8,
      backgroundColor: 'surface'
    },
    renderRow
  );

  const caption = combineLatest([count, at]).pipe(
    map(
      ([rows, offset]) => `${rows.toLocaleString('en-US')} rows, ${Math.round(offset).toLocaleString('en-US')} px down`
    )
  );

  return (
    <column gap={12} padding={16} width={percent(100)} height={percent(100)}>
      {list}
      <row gap={8} y="center">
        <Control label="Reverse the order" onPress={() => (newestFirst.value = !newestFirst.value)} />
        <Control label="Add 10,000" onPress={() => (count.value += 10000)} />
        <text text={caption} fontSize={12} color="textMuted" />
      </row>
    </column>
  );
}
// #endregion lazy

/** One control, so the hover and the padding are written once. */
function Control(inputs: Inputs<{ label: string; onPress: () => void }>, _ctx: ComponentContext) {
  return (
    <button
      label={inputs.label}
      onClick={() => inputs.onPress.value()}
      padding={8}
      borderRadius={6}
      borderWidth={1}
      borderColor="border"
      backgroundColor="background"
      cursor="pointer"
      modifiers={[HOVER_CONTROL]}>
      <text text={inputs.label} fontSize={12} color="text" />
    </button>
  );
}
