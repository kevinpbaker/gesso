import { UiNodeType } from '../graph/UiNodeType';
import { createElement } from './UiFactory';
import type { UiElement } from './UiElement';
import type { ScrollViewProps } from './UiElementProps';
import { UiVirtualWindow, VIRTUAL_WINDOW_PROP, type LazyItemRenderer, type LazyListOptions } from './UiVirtualWindow';

/**
 * A LazyColumn / LazyRow takes every ScrollView prop plus the window
 * options. The per-item key is `itemKey`, since `key` is the element's
 * own reconciliation key.
 */
export type LazyListProps = ScrollViewProps &
  Omit<LazyListOptions, 'key'> & {
    /** Stable identity per index, so a row keeps its node when the list shifts. */
    itemKey?: LazyListOptions['key'];
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

function lazyList(axis: 'column' | 'row', props: LazyListProps, renderItem: LazyItemRenderer): UiElement {
  const { count, estimatedExtent, overscan, itemKey, initialViewportExtent, ...rest } = props;
  const window = new UiVirtualWindow(
    axis,
    { count, estimatedExtent, overscan, key: itemKey, initialViewportExtent },
    renderItem
  );
  return createElement(
    UiNodeType.ScrollView,
    {
      ...rest,
      direction: axis,
      [VIRTUAL_WINDOW_PROP]: window
    },
    [window.children$]
  );
}
