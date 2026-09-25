import {
  Box,
  Button,
  Column,
  Paint,
  Row,
  ScrollView,
  Text,
  type UiElement,
  type UiProps,
  borders,
  decorated,
  linearGradient,
  percent,
  radialGradient,
  type DecorationShape,
  type UiPaint,
  type UiPath
} from 'gesso-core';
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
 * The renderer-parity section: everything the
 * two backends once disagreed on, in one row the compare route diffs
 * pixel by pixel — a rounded clipped card with rotated children and
 * text, an image under `objectFit: cover` in a rounded box, bordered
 * boxes with and without radii, and a scrolled list with a sticky
 * header, and a decorated card — the modifier decorations, which are the one thing a modifier may
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

/**
 * A painted node for the pixel gate: the
 * paint hook, exercising a cubic curve, an arc, a dash pattern and an
 * even-odd fill, none of which either backend can draw as a rectangle.
 *
 * It is here because the risk the workstream was written against is
 * exactly what this gate measures. The unit parity spec compares the
 * two backends' draw lists; this compares their pixels on a real GPU,
 * which is the only place a picture that reached one backend and not
 * the other would show.
 *
 * Hoisted, with no `inputs`, so the picture is made once for the life
 * of the page and the two panes are diffing a still image.
 */
const PARITY_PAINT: UiPaint = {
  draw(surface, box) {
    surface.beginPath();
    surface.moveTo(2, box.height - 4);
    surface.bezierCurveTo(box.width * 0.3, 2, box.width * 0.6, box.height - 2, box.width - 2, 6);
    surface.strokeColor('#38bdf8');
    surface.lineWidth(2);
    surface.lineCap('round');
    surface.stroke();

    surface.beginPath();
    surface.arc(box.width / 2, box.height / 2, 14, 0, Math.PI * 1.6);
    surface.strokeColor('#f472b6');
    surface.lineWidth(3);
    surface.lineDash([4, 3]);
    surface.stroke();

    // A square with a square hole in it, wound the same way, so the
    // fill rule decides whether there is a hole at all.
    surface.beginPath();
    surface.rect(4, 4, 20, 20);
    surface.rect(9, 9, 10, 10);
    surface.fillColor('#facc15');
    surface.fill('evenodd');
  }
};

/** The same geometry a `path` prop states rather than draws. */
const PARITY_PATH: UiPath = {
  d: 'M12 2 A10 10 0 1 1 11.99 2 Z M8 12 L11 15 L16 8',
  viewBox: 24,
  fill: '#1e293b',
  fillRule: 'evenodd',
  stroke: '#34d399',
  strokeWidth: 2,
  lineCap: 'round',
  lineJoin: 'round'
};

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
        // A gradient on a box that already has a
        // radius and a clip, so the pixel gate sees a gradient follow a
        // rounded corner without a single new antialiased edge to
        // account for. It paints over the colour, as CSS paints a
        // `background-image` over `background-color`.
        backgroundGradient: linearGradient(Math.PI / 3, [
          { offset: percent(0), color: '#1e293b' },
          { offset: percent(60), color: '#0f766e' },
          { offset: percent(100), color: '#134e4a' }
        ]),
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
    // The Media tier (C7): a rasterised icon, drawn the way `Icon`
    // draws one — through `image` and `objectFit`, which is why the
    // tier needed no renderer work at all.
    Box(
      { width: 44, height: 80, y: 'center', x: 'center' },
      Box({ width: 28, height: 28, image: state.icon$, objectFit: 'contain' })
    ),
    // The painted tier (X5): a picture drawn by the application, and a
    // static vector path. Both backends draw the same bitmap, so this
    // reads zero unless one of them stopped drawing it.
    Column(
      { gap: 6 },
      Paint({ width: 44, height: 44, backgroundColor: '#0f172a', paint: PARITY_PAINT }),
      Paint({ width: 44, height: 30, path: PARITY_PATH })
    ),
    // A radial gradient with a centre off the middle, in a square box:
    // the other half of F9, and square so it adds no rounded corners to
    // the pixel gate's budget.
    Box({
      width: 44,
      height: 80,
      backgroundGradient: radialGradient(
        [
          { offset: percent(0), color: '#fbbf24' },
          { offset: percent(55), color: '#b45309' },
          { offset: percent(100), color: '#1e293b' }
        ],
        { centerX: percent(30), centerY: percent(25) }
      )
    }),
    Column(
      { gap: 6 },
      Row(
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
        // A border per edge, which `borderWidth` cannot describe: four
        // widths on one node. It is four decoration rectangles rather
        // than a border property, so this is the only place either
        // backend is asked to draw one, and the only place the far
        // insets on `DecorationBox` are exercised at all. The widths
        // differ so a transposed axis shows.
        Box({
          width: 90,
          height: 34,
          backgroundColor: 'rgba(148,163,184,0.18)',
          modifiers: [borders({ top: 1, right: 4, bottom: 6, left: 2, color: '#e2e8f0' })]
        })
      ),
      Row(
        { gap: 6 },
        Box({ width: 90, height: 34, borderWidth: 3, borderColor: '#f43f5e' }),
        // Two colours, so a corner painted twice shows: the sides are
        // amber where the horizontal edges are cyan, and the corners
        // belong to the horizontal ones.
        Box({
          width: 90,
          height: 34,
          backgroundColor: 'rgba(148,163,184,0.18)',
          modifiers: [
            borders({
              top: 3,
              bottom: 3,
              left: { width: 5, color: '#f59e0b' },
              right: { width: 5, color: '#f59e0b' },
              color: '#22d3ee'
            })
          ]
        })
      )
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
