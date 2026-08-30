import { Box, Button, Column, Row, ScrollView, Text } from '../ui/composition';
import type { UiElement, UiProps } from '../ui/composition';
import { decorated } from '../ui/modifiers';
import type { DecorationShape } from '../ui/rendering';
import type { PlaygroundState } from './PlaygroundState';

const SCROLL_ITEM_COUNT = 100;

function scrollItems(): UiElement[] {
  const items: UiElement[] = [];
  for (let i = 1; i <= SCROLL_ITEM_COUNT; i++) {
    items.push(Text({ text: `Scroll item ${i}`, color: '#d1d5db' }));
  }
  return items;
}

/**
 * A keyed item. The `key` prop drives reconciliation identity:
 * the runtime node id stays `${parent}:${key}` across reorders.
 */
function keyedItem(key: string): UiElement {
  return Column(
    { key, gap: 4, backgroundColor: 'rgba(31,111,235,0.12)', borderColor: '#1f6feb', borderWidth: 1, borderRadius: 4 },
    Text({ text: `Item ${key}`, color: '#111827' })
  );
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
 * The renderer-parity section (WEBGPU_ROADMAP.md G0): everything the
 * two backends once disagreed on, in one row the compare route diffs
 * pixel by pixel — a rounded clipped card with rotated children and
 * text, an image under `objectFit: cover` in a rounded box, bordered
 * boxes with and without radii, and a scrolled list with a sticky
 * header, and a decorated card — the modifier decorations of
 * `MODIFIERS_ROADMAP.md` B3, which are the one thing a modifier may
 * put on screen and therefore the one thing that has to be identical
 * on both backends.
 */

/**
 * A ring outside a card and a bar inside it, hoisted so the modifier's
 * arguments keep their identity across rebuilds.
 *
 * Both phases of the node's paint pass: the ring goes on before the
 * node's children, the pink outline after them.
 */
const CARD_DECORATION: readonly DecorationShape[] = [
  { kind: 'stroke', color: '#38bdf8', lineWidth: 2, outset: 4 },
  { kind: 'fill', color: 'rgba(56,189,248,0.35)', x: 8, y: 8, width: 40, height: 6, radius: 3 },
  { kind: 'stroke', color: '#f472b6', lineWidth: 2, outset: -6, radius: 4, after: 'children' }
];

/**
 * A ring on a row inside the scrolled, rounded list. It is cut off by
 * the scroller, which is what an overlay shape could not do and the
 * reason a decoration is painted inside the node's own paint pass.
 */
const ROW_DECORATION: readonly DecorationShape[] = [{ kind: 'stroke', color: '#facc15', lineWidth: 2, outset: 3 }];

function paritySection(state: PlaygroundState): UiElement {
  return Row(
    { gap: 10, y: 'start' },
    Box(
      {
        width: 120,
        height: 80,
        overflow: 'hidden',
        borderRadius: 14,
        backgroundColor: '#1e293b',
        position: 'relative'
      },
      Box({
        position: 'absolute',
        left: -20,
        top: 20,
        width: 90,
        height: 90,
        backgroundColor: '#f59e0b',
        transform: { rotation: 0.4 }
      }),
      Box({
        position: 'absolute',
        left: 70,
        top: -30,
        width: 90,
        height: 90,
        backgroundColor: '#3b82f6',
        borderRadius: 45
      }),
      Text({ text: 'clipped', color: '#ffffff', fontSize: 12, position: 'absolute', left: 8, bottom: 6 })
    ),
    Box({
      width: 120,
      height: 80,
      overflow: 'hidden',
      borderRadius: 10,
      backgroundColor: '#1e293b',
      image: state.image$,
      objectFit: 'cover'
    }),
    Column(
      { gap: 6 },
      Box({
        width: 90,
        height: 34,
        borderWidth: 2,
        borderColor: '#10b981',
        borderRadius: 8,
        backgroundColor: 'rgba(16,185,129,0.15)',
        modifiers: [decorated(CARD_DECORATION)]
      }),
      Box({ width: 90, height: 34, borderWidth: 3, borderColor: '#f43f5e' })
    ),
    Column(
      { width: 130, height: 80, overflow: 'scroll', scrollY: 22, backgroundColor: '#0f172a', borderRadius: 6 },
      Row(
        { position: 'sticky', top: 0, padding: 4, backgroundColor: '#334155', flexShrink: 0 },
        Text({ text: 'Sticky', color: '#e2e8f0', fontSize: 11 })
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        Text({
          text: `Line ${i + 1}`,
          color: '#cbd5e1',
          fontSize: 11,
          padding: 4,
          flexShrink: 0,
          modifiers: i === 1 ? [decorated(ROW_DECORATION)] : undefined
        })
      )
    )
  );
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
      { gap: 10, selfX: 'stretch' },
      Box({
        width: state.boxWidth$,
        height: state.boxHeight$,
        backgroundColor: '#1f6feb',
        borderRadius: 4,
        focusable: true
      }),
      Box({
        flexGrow: state.flexGrow$,
        height: state.boxHeight$,
        backgroundColor: '#6f42c1',
        borderRadius: 4,
        focusable: true
      })
    ),
    Column(
      {
        gap: 8,
        minWidth: state.minWidth$,
        maxWidth: state.maxWidth$,
        backgroundColor: 'rgba(31,111,235,0.06)',
        borderColor: state.computedColor$,
        borderWidth: 1,
        borderRadius: 6
      },
      Text({ text: 'Nested Column', color: '#1e293b' }),
      Button({ text: 'Button A', color: '#ffffff', backgroundColor: '#1f6feb', textAlign: 'center', borderRadius: 4 }),
      Button({ text: 'Button B', color: '#ffffff', backgroundColor: '#1f6feb', textAlign: 'center', borderRadius: 4 })
    ),
    Column({ gap: 6 }, ...keyedItems),
    ScrollView(
      {
        width: 300,
        height: 120,
        scrollY: state.scrollY$,
        gap: 6,
        backgroundColor: 'rgba(16,185,129,0.06)',
        borderColor: '#10b981',
        borderWidth: 1,
        borderRadius: 6
      },
      ...scrollItems()
    ),
    // After the scroll view: the playground's scroll inspection reports
    // the first scroll container it finds, and that is this one.
    paritySection(state)
  ];
  if (stress !== undefined) {
    children.push(stress);
  }

  return Column(rootProps, ...children);
}
