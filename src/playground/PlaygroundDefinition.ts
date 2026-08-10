import { Box, Button, Column, Row, ScrollView, Text } from '../ui/composition';
import type { UiElement, UiProps } from '../ui/composition';
import type { PlaygroundState } from './PlaygroundState';

const SCROLL_ITEM_COUNT = 12;

function scrollItems(): UiElement[] {
  const items: UiElement[] = [];
  for (let i = 1; i <= SCROLL_ITEM_COUNT; i++) {
    items.push(Text({ text: `Scroll item ${i}` }));
  }
  return items;
}

/**
 * A keyed item. The `key` prop drives reconciliation identity:
 * the runtime node id stays `${parent}:${key}` across reorders.
 */
function keyedItem(key: string): UiElement {
  return Column({ key, gap: 4 }, Text({ text: `Item ${key}` }));
}

/**
 * Stress-test subtree of roughly `count` boxes spread over rows.
 */
function stressSubtree(count: number): UiElement | undefined {
  if (count <= 0) {
    return undefined;
  }
  const rows = Math.max(1, Math.ceil(count / 10));
  const perRow = Math.max(1, Math.ceil(count / rows));
  const rowChildren: UiElement[] = [];
  let remaining = count;
  for (let row = 0; row < rows; row++) {
    const inRow = Math.min(perRow, remaining);
    remaining -= inRow;
    const boxes: UiElement[] = [];
    for (let col = 0; col < inRow; col++) {
      boxes.push(Box({ width: 4, height: 4 }));
    }
    rowChildren.push(Row({ gap: 1 }, ...boxes));
  }
  return Column({ gap: 1 }, ...rowChildren);
}

/**
 * Builds the declarative definition of the whole playground from
 * the current reactive state.
 *
 * Numeric/style values are passed as the BehaviorSubjects
 * themselves, so they flow through UiGraph bindings. Structural
 * values (fitPreview, order, stress count) are read synchronously;
 * changing them requires a rebuild, which reconciles the retained
 * tree instead of recreating it.
 */
export function createDefinition(state: PlaygroundState): UiElement {
  const fitPreview = state.fitPreview$.getValue();
  const direction = state.direction$.getValue();
  const order = state.order$.getValue();
  const stressCount = state.stressCount$.getValue();

  const rootProps: UiProps = {
    padding: state.padding$,
    gap: state.gap$,
    direction
  };
  if (!fitPreview) {
    rootProps.width = state.width$;
    rootProps.height = state.height$;
  }

  const keyedItems: UiElement[] = order.map(key => keyedItem(key));
  const stress = stressSubtree(stressCount);

  const children: UiElement[] = [
    Text({ text: 'Layout Playground', color: state.color$ }),
    Row(
      { gap: 10, alignSelf: 'stretch' },
      Box({ width: state.boxWidth$, height: state.boxHeight$ }),
      Box({ flexGrow: state.flexGrow$, height: state.boxHeight$ })
    ),
    Column(
      { gap: 8, minWidth: state.minWidth$, maxWidth: state.maxWidth$ },
      Text({ text: 'Nested Column' }),
      Button({ text: 'Button A' }),
      Button({ text: 'Button B' })
    ),
    Column({ gap: 6 }, ...keyedItems),
    ScrollView({ width: 300, height: 120, scrollY: state.scrollY$ }, ...scrollItems())
  ];
  if (stress !== undefined) {
    children.push(stress);
  }

  return Column(rootProps, ...children);
}
