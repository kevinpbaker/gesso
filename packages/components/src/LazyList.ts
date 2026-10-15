import { BehaviorSubject, combineLatest, map } from 'rxjs';

import { input, themeTokenCell, type ComponentContext, type Inputs } from 'gesso-framework';
import { controlTokens } from './tokens';
import { Box, LazyColumn, type UiChild, type UiNodeRef, type UiSemanticState } from 'gesso-core';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import { CONTROL_EDGE, CONTROL_FOCUS_RING, keymap, layoutOf, type ControlLayoutProps, modifiersOf } from './internals';
import { stepIndex, virtualList } from './virtual';

/**
 * A list of any length, of which only the visible rows exist.
 *
 * The engine underneath is L5's `LazyColumn`; what this adds is the
 * half a windowing engine cannot have an opinion about — that the thing
 * is a `list` whose items say where they sit in it, that the arrows
 * walk the whole list rather than the fifteen rows that happen to be
 * mounted, and that a row scrolled past can still be reached from the
 * keyboard.
 *
 * `posInSet` and `setSize` carry the **real** index and the real count.
 * A mounted-relative position would tell a screen reader that a list of
 * a hundred thousand rows has fifteen, which is the one thing
 * virtualization must not be allowed to say.
 */
export interface LazyListProps extends ControlLayoutProps {
  /** Receives the node that *is* the list, for focus and scrolling. */
  ref?: UiNodeRef;
  /** How many items there are. An Observable when the data changes. */
  count: number;
  /** Renders the content of one item. Called once per mount. */
  item: (index: number) => UiChild;
  /** Expected item height, for the rows that have not been measured. */
  estimatedItemExtent?: number;
  /** Items mounted beyond each edge of the viewport. */
  overscan?: number;
  /** Stable identity per index, so a row keeps its node when the list shifts. */
  itemKey?: (index: number) => string | number;
  /**
   * Changes when what an index *means* changes — a sort, a filter. The
   * mounted rows are rendered again against the new data.
   */
  revision?: unknown;
  /** The chosen item, or -1 for none. */
  selectedIndex?: number;
  defaultSelectedIndex?: number;
  /**
   * Scroll to an item the application chooses through `selectedIndex`,
   * as the list does to one the keyboard reached: a commit shown from
   * elsewhere, a search's result. The same item at another index (by
   * `itemKey`), as the list around it changes, is not followed. Off by
   * default: a written index is drawn as chosen and nothing more. Read
   * once, when the list mounts.
   */
  revealSelected?: boolean;
  onSelect?: (index: number) => void;
  /** Enter or Space on the chosen item. */
  onActivate?: (index: number) => void;
  label?: string;
  /**
   * Said after the list's name when it takes focus: what its keys do,
   * where a list has keys beyond its arrows.
   */
  description?: string;
  /**
   * Drawn as part of the surface it sits in rather than as a field on
   * it: no border, no background of its own, square corners. A sidebar's
   * file tree is the case, where a framed box inside the panel reads as
   * a form. The focus ring is kept, so the keyboard is still shown.
   * Read once, when the list mounts.
   */
  flush?: boolean;
  /**
   * Rows light up under the pointer, as a log's or a file tree's do, so
   * the row a click will choose is plain before it is pressed. The
   * chosen row keeps its own colour. Read once, when the list mounts.
   */
  hover?: boolean;
}

export function LazyList(inputs: Inputs<LazyListProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'List');
  const flush = inputs.flush.value === true;
  const estimated = input(inputs.estimatedItemExtent, 28);
  const focus = trackFocus(ctx, inputs.ref);
  const list = virtualList();
  const tokens = themeTokenCell(controlTokens);
  const selected = controlled<number>({
    component: 'LazyList',
    name: 'selectedIndex',
    source: inputs.selectedIndex,
    initial: inputs.defaultSelectedIndex,
    fallback: -1,
    onChange: inputs.onSelect
  });

  /**
   * Selection follows focus, the pattern `RadioGroup` set in C3: the
   * list is one tab stop and the arrows move the choice, so there is no
   * second "active" index to keep in step with the chosen one — and no
   * roving focus over rows that may not be mounted.
   */
  const choose = (index: number): void => {
    if (index < 0) {
      return;
    }
    selected.change(index);
    list.reveal(index);
  };
  const step = (by: number): void => choose(stepIndex(selected.current(), by, inputs.count.value));

  if (inputs.revealSelected.value === true) {
    // Followed by item, not by index: one the person scrolled away from stays where they left it as rows arrive.
    let revealed: string | number | null = null;
    ctx.effect(selected.value, index => {
      if (index < 0) {
        revealed = null;
        return;
      }
      const key = inputs.itemKey.value?.(index) ?? index;
      if (key === revealed) return;
      revealed = key;
      list.reveal(index);
    });
  }

  /** The row under the pointer, for `hover`; -1 for none. */
  const hovered = new BehaviorSubject(-1);
  const hover = inputs.hover.value === true;
  const rowBackground = (index: number) =>
    hover
      ? combineLatest([selected.value, hovered]).pipe(
          map(([current, under]) => (current === index ? 'selectionBackground' : under === index ? 'controlBackgroundHovered' : 'transparent'))
        )
      : selected.value.pipe(map(current => (current === index ? 'selectionBackground' : 'transparent')));

  const row = (index: number): UiChild =>
    Box(
      {
        // A box lays its child at the start, at its own width; a row of a
        // list goes across it, so what it puts at its end is at the end.
        x: 'stretch',
        role: 'listitem',
        posInSet: index + 1,
        setSize: inputs.count,
        states: selected.value.pipe(map(current => (current === index ? (['selected'] as UiSemanticState[]) : []))),
        backgroundColor: rowBackground(index),
        color: selected.value.pipe(map(current => (current === index ? 'selectionForeground' : 'controlForeground'))),
        onClick: () => choose(index),
        ...(hover
          ? {
              onPointerEnter: () => hovered.next(index),
              onPointerLeave: () => {
                if (hovered.value === index) hovered.next(-1);
              }
            }
          : {})
      },
      inputs.item.value(index)
    );

  return LazyColumn(
    {
      ...layoutOf(inputs),
      ref: node => {
        list.ref(node);
        focus.ref(node);
      },
      windowRef: list.windowRef,
      modifiers: modifiersOf(
        inputs,
        list.viewport,
        tokens.modifier,
        CONTROL_FOCUS_RING,
        ...(flush ? [] : [CONTROL_EDGE])
      ),
      scrollY: list.scrollY,
      focusable: true,
      count: inputs.count,
      revision: inputs.revision,
      estimatedExtent: estimated.value,
      overscan: inputs.overscan.value,
      itemKey: inputs.itemKey.value,
      role: 'list',
      label,
      description: inputs.description,
      backgroundColor: flush ? 'transparent' : 'controlBackground',
      // The border is `CONTROL_EDGE` rather than a `borderWidth`: a
      // chosen row's own background would be painted over it.
      borderRadius: flush ? 0 : tokens.select(t => t.radius.scroller),
      onKeyDown: keymap({
        ArrowDown: () => step(1),
        ArrowUp: () => step(-1),
        PageDown: () => step(PAGE),
        PageUp: () => step(-PAGE),
        Home: () => choose(0),
        End: () => choose(inputs.count.value - 1),
        Enter: () => activate(inputs, selected.current()),
        ' ': () => activate(inputs, selected.current())
      })
    },
    row
  );
}

function activate(inputs: Inputs<LazyListProps>, index: number): void {
  if (index >= 0) {
    inputs.onActivate.value?.(index);
  }
}

/**
 * Rows a page key moves by. A fixed count rather than "a viewport's
 * worth": rows are of unknown height until they are mounted, so the
 * viewport's worth of them is not a number this can know for the part
 * of the list it has never seen.
 */
const PAGE = 10;
