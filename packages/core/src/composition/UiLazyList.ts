import { UiNodeType } from '../graph/UiNodeType';
import { createElement } from './UiFactory';
import type { UiElement } from './UiElement';
import type { ScrollViewProps } from './UiElementProps';
import {
  lazySource,
  UiVirtualWindow,
  VIRTUAL_WINDOW_PROP,
  type LazyGridOptions,
  type LazyItemRenderer,
  type LazyListOptions
} from './UiVirtualWindow';

/**
 * A LazyColumn / LazyRow takes every ScrollView prop plus the window
 * options. The per-item key is `itemKey`, since `key` is the element's
 * own reconciliation key.
 */
export type LazyListProps = ScrollViewProps &
  Omit<LazyListOptions, 'key'> & {
    /** Stable identity per index, so a row keeps its node when the list shifts. */
    itemKey?: LazyListOptions['key'];
    /**
     * Hands the window to the caller, once, as the element is built.
     *
     * What it is for is `offsetOf(index)`: scrolling to a row that is
     * not mounted has no node to reveal, so the offset arithmetic is
     * the only way to ask for it. A component holding this must not
     * drive the window — the runtime owns that.
     */
    windowRef?: (window: UiVirtualWindow) => void;
  };

/**
 * A vertical list that mounts only the rows in view.
 *
 *   LazyColumn({ height: 400, count: 100000, estimatedExtent: 28 },
 *     index => Row({ padding: 6 }, Text({ text: `Row ${index}` })))
 *
 * It is a ScrollView whose children are produced by a UiVirtualWindow:
 * a spacer for the rows above the window, the mounted rows (keyed, so a
 * row that stays in view keeps its node), and a spacer for the rows
 * below. The runtime advances the window every frame before layout, so
 * rows revealed by a scroll are laid out and painted on that frame.
 * Every other ScrollView property — size, padding, background — applies.
 */
export function LazyColumn(props: LazyListProps, renderItem: LazyItemRenderer): UiElement {
  return lazyList('column', props, renderItem);
}

/** The horizontal counterpart of LazyColumn. */
export function LazyRow(props: LazyListProps, renderItem: LazyItemRenderer): UiElement {
  return lazyList('row', props, renderItem);
}

/**
 * A vertical list whose rows share one set of column tracks with a
 * header, and of which only the visible rows exist.
 *
 *   LazyGrid({ height: 400, count: 100000, estimatedExtent: 28,
 *              columns: [auto, fr(1), 80], header: headerRow },
 *     index => Grid({ subgrid: 'columns', role: 'row' }, …cells))
 *
 * The renderer returns the row itself, not its content: a row's cells
 * have to be items of the one grid that owns the tracks, so a row is a
 * `Grid` with `subgrid: 'columns'` and the window writes the index onto
 * it. The grid work left this to `DataTable`, and this
 * is it — the engine half, with the component built on top.
 */
export function LazyGrid(props: LazyGridProps, renderRow: LazyItemRenderer): UiElement {
  const { columns, columnGap, header, ...rest } = props;
  return lazyList('column', rest, renderRow, { columns, columnGap, header });
}

export type LazyGridProps = LazyListProps & LazyGridOptions;

function lazyList(
  axis: 'column' | 'row',
  props: LazyListProps,
  renderItem: LazyItemRenderer,
  grid?: LazyGridOptions
): UiElement {
  const { count, estimatedExtent, overscan, itemKey, initialViewportExtent, revision, modifiers, windowRef, ...rest } =
    props;
  const window = new UiVirtualWindow(
    axis,
    { count, estimatedExtent, overscan, key: itemKey, initialViewportExtent, revision, grid },
    renderItem
  );
  windowRef?.(window);
  return createElement(
    UiNodeType.ScrollView,
    {
      ...rest,
      // The caller's modifiers first, so one of theirs writing the same
      // property still wins — the order `Button` already establishes.
      modifiers: [...(modifiers ?? []), lazySource({ window, count, revision })],
      direction: axis,
      [VIRTUAL_WINDOW_PROP]: window
    },
    [window.children$]
  );
}
