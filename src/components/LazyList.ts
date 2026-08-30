import { map, type Observable } from 'rxjs';

import { input } from '../framework/Input';
import type { ComponentContext, Inputs } from '../framework/FunctionComponent';
import { Box } from '../ui/composition/UiComponents';
import { LazyColumn } from '../ui/composition/UiLazyList';
import type { UiChild } from '../ui/composition/UiElement';
import type { UiNodeRef } from '../ui/composition/UiElementProps';
import type { UiSemanticState } from '../ui/properties/UiSemantics';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import { keymap, layoutOf, type ControlLayoutProps } from './internals';
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
  onSelect?: (index: number) => void;
  /** Enter or Space on the chosen item. */
  onActivate?: (index: number) => void;
  label?: string;
}

export function LazyList(props: Inputs<LazyListProps>, ctx: ComponentContext): UiChild {
  const label = input(props.label, 'List');
  const estimated = input(props.estimatedItemExtent, 28);
  const focus = trackFocus(ctx, props.ref);
  const list = virtualList();
  const selected = controlled<number>({
    component: 'LazyList',
    name: 'selectedIndex',
    source: props.selectedIndex,
    initial: props.defaultSelectedIndex,
    fallback: -1,
    onChange: props.onSelect
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
  const step = (by: number): void => choose(stepIndex(selected.current(), by, props.count.value));

  const row = (index: number): UiChild =>
    Box(
      {
        role: 'listitem',
        posInSet: index + 1,
        setSize: props.count,
        states: selected.value.pipe(map(current => (current === index ? (['selected'] as UiSemanticState[]) : []))),
        backgroundColor: selected.value.pipe(
          map(current => (current === index ? 'selectionBackground' : 'transparent'))
        ),
        color: selected.value.pipe(map(current => (current === index ? 'selectionForeground' : 'controlForeground'))),
        onClick: () => choose(index)
      },
      props.item.value(index)
    );

  return LazyColumn(
    {
      ...layoutOf(props),
      ref: node => {
        list.ref(node);
        focus.ref(node);
      },
      windowRef: list.windowRef,
      modifiers: [list.viewport],
      scrollY: list.scrollY,
      focusable: true,
      count: props.count,
      revision: props.revision,
      estimatedExtent: estimated.value,
      overscan: props.overscan.value,
      itemKey: props.itemKey.value,
      role: 'list',
      label,
      backgroundColor: 'controlBackground',
      borderWidth: 1,
      borderColor: borderOf(focus.focused),
      borderRadius: 6,
      onKeyDown: keymap({
        ArrowDown: () => step(1),
        ArrowUp: () => step(-1),
        PageDown: () => step(PAGE),
        PageUp: () => step(-PAGE),
        Home: () => choose(0),
        End: () => choose(props.count.value - 1),
        Enter: () => activate(props, selected.current()),
        ' ': () => activate(props, selected.current())
      })
    },
    row
  );
}

function activate(props: Inputs<LazyListProps>, index: number): void {
  if (index >= 0) {
    props.onActivate.value?.(index);
  }
}

function borderOf(focused: Observable<boolean>): Observable<string> {
  return focused.pipe(map(on => (on ? 'controlBorderFocused' : 'controlBorder')));
}

/**
 * Rows a page key moves by. A fixed count rather than "a viewport's
 * worth": rows are of unknown height until they are mounted, so the
 * viewport's worth of them is not a number this can know for the part
 * of the list it has never seen.
 */
const PAGE = 10;
