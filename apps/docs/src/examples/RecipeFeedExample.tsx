import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { LazyColumn, percent, scrollPosition, type UiVirtualWindow } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

// #region source
/** The entry the feed starts at, and how many it starts with. */
const FIRST_ENTRY = 1000;
const STARTING_ENTRIES = 120;
/** How many arrive at each end when the buttons are pressed. */
const NEWER = 3;
const OLDER = 10;

/**
 * The height the window assumes for an entry it has not measured.
 *
 * The entries wrap, so they are not all this tall and no single number
 * could be right. What it has to be is close: a good estimate means the
 * scroll range is nearly right before anything has been measured, and a
 * bad one makes the scrollbar jump as the reader travels.
 */
const ESTIMATE = 46;

const AUTHORS = ['Ravi', 'Ana', 'Mikael', 'Yuki', 'Priya', 'Tomas', 'Noor'];
const ACTIONS = [
  'pushed two commits',
  'opened a pull request against the layout engine',
  'closed the ticket about sticky headers and moved the rest of the work into next week',
  'renamed the release branch',
  'left a review, with a note about the estimate the virtual window starts from and how it settles',
  'restarted the build'
];

/** A deterministic spread, so an entry reads the same on every reload. */
function scramble(entry: number): number {
  return Math.imul(entry + 1, 2654435761) >>> 0;
}

/**
 * What one entry says.
 *
 * Keyed on the entry number rather than on the row index, which is the
 * whole point of the exercise: an index means a different entry after
 * older entries are loaded above it, and an entry number never does.
 */
function authorOf(entry: number): string {
  return AUTHORS[scramble(entry) % AUTHORS.length];
}

function actionOf(entry: number): string {
  return ACTIONS[(scramble(entry) >>> 5) % ACTIONS.length];
}
// #endregion source

// #region feed
/**
 * An append-only feed, with older entries loaded above it.
 *
 * Two cells are the whole data source. `count` is how many entries
 * there are; `first` is the number of the entry at index 0. Together
 * they say what index _i_ means: entry `first + i`. Newer entries land
 * at the end, older ones at the start.
 *
 * That is also why they reach the list differently.
 *
 * **A newer entry only changes `count`.** Nothing an index means has
 * moved, so the list follows the count, re-uses every mounted row, and
 * leaves the scroll offset alone. The reader does not move.
 *
 * **An older entry changes what every index means**, so `first` is
 * handed to the list as its `revision` as well. The mounted rows are
 * rendered again in place against the new data, and their measurements
 * are dropped. The scroll offset is untouched by that, which is exactly
 * the problem: the entry the reader was looking at is ten indices
 * further down than it was, so leaving the offset alone moves the feed
 * under them. The anchored button below does the arithmetic that very
 * nearly cancels that, and the naive one does not, so the difference is
 * a press apart.
 *
 * This is a `LazyColumn` rather than the `LazyList` component, for one
 * reason: the screen needs to drive the scroll offset, for the jump and
 * for the anchoring, and a bound `scrollY` is how a scroll container is
 * put where you want it. `LazyList` owns its own offset and gives the
 * rows their roles, their keyboard and their selection instead, so it
 * is the better choice for a list that never has to be moved from
 * outside.
 */
export function Activity(_props: Inputs<{}>, _ctx: ComponentContext) {
  const count = internalState(STARTING_ENTRIES);
  const first = internalState(FIRST_ENTRY);
  /** Where the list is scrolled to, in the application's hands. */
  const at = internalState(0);

  /**
   * The window, handed over once as the list is built.
   *
   * It is read, never driven: `offsetOf` says where an index sits
   * without mounting it, `range` says which indices exist, and
   * `totalExtent` is how tall the whole feed currently believes it is.
   * The runtime owns everything else about it.
   */
  let view: UiVirtualWindow | null = null;

  /**
   * One entry. Called once per mounted row, and again for the mounted
   * rows whenever `revision` changes.
   *
   * Nothing sets a height. The body wraps to the width of the list, so
   * an entry is one line or three, and the window measures what it got.
   */
  const entry = (index: number) => {
    const number = first.value + index;
    return (
      <column
        role="listitem"
        posInSet={index + 1}
        setSize={count}
        gap={2}
        paddingLeft={10}
        paddingRight={10}
        paddingTop={6}
        paddingBottom={6}>
        <text text={`#${number} ${authorOf(number)}`} fontSize={11} color="textMuted" />
        <text text={actionOf(number)} fontSize={12} color="text" />
      </column>
    );
  };

  const list = LazyColumn(
    {
      width: percent(100),
      height: 200,
      count,
      revision: first,
      estimatedExtent: ESTIMATE,
      scrollY: at,
      modifiers: [scrollPosition({ onChange: offset => (at.value = offset.y) })],
      windowRef: window => (view = window),
      role: 'list',
      label: 'Activity',
      borderWidth: 1,
      borderColor: 'border',
      borderRadius: 8,
      backgroundColor: 'surface'
    },
    entry
  );

  /** Newer entries: the count grows, and nothing else changes. */
  const newer = () => {
    count.value += NEWER;
  };

  /**
   * Older entries, and the reader kept roughly where they were.
   *
   * The offset has to move because the content above the reader grew.
   * What by is a question only the window can answer, so it is asked:
   * the top of the window, how far past it the viewport starts, and
   * where that same entry sits once it is ten indices further down.
   *
   * Roughly, not exactly. The ten entries that arrived have never been
   * mounted, so nothing knows how tall they are and the offset moves by
   * what the window assumes them to be. In the spec beside this file
   * that leaves the reader 28 px from where they were, against 462 px
   * for the naive button, on entries between 42 and 56 tall.
   */
  const older = () => {
    if (view === null) {
      return;
    }
    const anchor = view.range.first;
    const into = at.value - view.offsetOf(anchor);
    load();
    at.value = view.offsetOf(anchor + OLDER) + into;
  };

  /** The same load, with the offset left alone. */
  const olderNaive = () => {
    load();
  };

  const load = () => {
    first.value -= OLDER;
    count.value += OLDER;
  };

  /**
   * The jump: past the end on purpose.
   *
   * The engine clamps a scroll offset to the content it has, and
   * `scrollPosition` reports the offset the list actually ended up at,
   * which is written straight back into the same cell. So asking for
   * more than there is settles on the bottom without the screen having
   * to work out where the bottom is.
   */
  const newest = () => {
    if (view !== null) {
      at.value = view.totalExtent();
    }
  };

  const caption = combineLatest([count, first, at]).pipe(
    map(
      ([entries, start, offset]) =>
        `${entries} entries, #${start} to #${start + entries - 1}, ${Math.round(offset).toLocaleString('en-US')} px down`
    )
  );

  return (
    <column gap={12} padding={16} width={percent(100)} height={percent(100)}>
      {list}
      <row gap={8} y="center">
        <Control label="3 newer" onPress={newer} />
        <Control label="10 older" onPress={older} />
        <Control label="10 older, naive" onPress={olderNaive} />
        <Control label="Jump to newest" onPress={newest} />
      </row>
      <text text={caption} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion feed

/** One control, so the hover and the padding are written once. */
function Control(props: Inputs<{ label: string; onPress: () => void }>, _ctx: ComponentContext) {
  return (
    <button
      label={props.label}
      onClick={() => props.onPress.value()}
      paddingLeft={8}
      paddingRight={8}
      paddingTop={7}
      paddingBottom={7}
      borderRadius={6}
      borderWidth={1}
      borderColor="border"
      backgroundColor="background"
      cursor="pointer"
      modifiers={[HOVER_CONTROL]}>
      <text text={props.label} fontSize={12} color="text" />
    </button>
  );
}
