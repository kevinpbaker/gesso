import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { LazyList } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

import { HOVER_CONTROL } from './interaction';

/** A hundred thousand rows, of which a dozen or so ever exist. */
const LONG = 100000;
/** Few enough that every row is mounted at once. */
const SHORT = 25;

/** The row height the list is told to expect, and the one it gets. */
const ROW = 26;

// #region list
/**
 * A hundred thousand rows, of which only the visible ones exist.
 *
 * The row at index 0 is mounted; so is the row at 99,999 once End takes
 * you there. Everything between them is two spacer boxes, which is why
 * the list costs the same to build whether it holds twenty five rows or
 * a hundred thousand.
 *
 * **The buttons change the data, not the scroll offset.** Newest first
 * flips what an index means, and the list is handed that same value as
 * its `revision`: the mounted rows are rendered again against the new
 * order, in place, without the list moving. The two count buttons
 * change how many rows there are, and the list learns the new count
 * from the same Observable it was given.
 *
 * **The keyboard walks the whole list, not the mounted part of it.**
 * Click the list, then use the arrows, Page Up and Page Down, Home and
 * End. End chooses row 99,999, which does not exist until the list has
 * scrolled to it, and the list scrolls to it because the window can say
 * where an index sits without mounting it.
 */
export function Events(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const count = internalState(LONG);
  const newestFirst = internalState(false);
  const chosen = internalState(-1);

  /**
   * The content of one row. Called once per mount, and again for the
   * mounted rows when `revision` changes.
   */
  const item = (index: number) => (
    <row height={ROW} paddingLeft={10} paddingRight={10} y="center" gap={10}>
      <text text={`Event ${newestFirst.value ? count.value - 1 - index : index}`} fontSize={13} />
    </row>
  );

  const caption = combineLatest([count, chosen]).pipe(
    map(([rows, row]) => `${rows.toLocaleString('en-US')} rows. Chosen: ${row < 0 ? 'nothing' : `row ${row}`}`)
  );

  return (
    <column gap={12} padding={16} width={percent(100)} height={percent(100)}>
      <LazyList
        label="Events"
        count={count}
        item={item}
        revision={newestFirst}
        estimatedItemExtent={ROW}
        height={168}
        selectedIndex={chosen}
        onSelect={index => (chosen.value = index)}
      />
      <row gap={8} y="center">
        <button
          label="Newest first"
          onClick={() => (newestFirst.value = !newestFirst.value)}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Newest first" fontSize={12} color="text" />
        </button>
        <button
          label="25 rows"
          onClick={() => (count.value = SHORT)}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="25 rows" fontSize={12} color="text" />
        </button>
        <button
          label="100,000 rows"
          onClick={() => (count.value = LONG)}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="100,000 rows" fontSize={12} color="text" />
        </button>
      </row>
      <text text={caption} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion list
