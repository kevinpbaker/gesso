/**
 * Layout conformance cases.
 *
 * Each case is a small tree written in Gesso's own vocabulary. The
 * same definition is translated two ways:
 *
 *   - into HTML/CSS, rendered by headless Chrome to produce the
 *     expected boxes (`scripts/gen-layout-fixtures.ts` → `expected.json`)
 *   - into a UiNode tree laid out by LayoutEngine, whose boxes the
 *     conformance spec compares against those expectations
 *
 * This file must stay free of runtime imports: the generator runs it
 * directly under Node's type stripping, which cannot execute enums or
 * other non-erasable syntax from the rest of the runtime.
 *
 * Property names mirror CSS on purpose, so the translation table in
 * `toHtml.ts` is short. Where Gesso's *defaults* differ from CSS
 * (cross-axis `start`, minimum size 0) the translator encodes Gesso's
 * current behaviour explicitly; those deltas are listed there and are
 * what roadmap item L3 removes.
 */

export type CaseNodeType = 'row' | 'column' | 'box' | 'text' | 'grid';

export type Alignment =
  | 'start'
  | 'center'
  | 'end'
  | 'stretch'
  | 'baseline'
  | 'space-between'
  | 'space-evenly'
  | 'space-around';

export type TextWrap = 'word' | 'char' | 'none';

/** Same shape as the runtime's UiLength; this file cannot import it. */
export type CaseLength = number | { readonly unit: 'percent'; readonly value: number } | { readonly unit: 'auto' };

export function pct(value: number): CaseLength {
  return { unit: 'percent', value };
}

export const autoLength: CaseLength = { unit: 'auto' };

/** Same shape as the runtime's UiTrackSize. */
export type CaseTrack =
  | CaseLength
  | { readonly unit: 'fr'; readonly value: number }
  | {
      readonly unit: 'minmax';
      readonly min: CaseLength;
      readonly max: CaseLength | { readonly unit: 'fr'; readonly value: number };
    };

export function frTrack(value: number): CaseTrack {
  return { unit: 'fr', value };
}

export function minmaxTrack(
  min: CaseLength,
  max: CaseLength | { readonly unit: 'fr'; readonly value: number }
): CaseTrack {
  return { unit: 'minmax', min, max };
}
export type TextOverflow = 'clip' | 'ellipsis';

/**
 * How a case's text is rendered on the Chrome side.
 *
 *   'fixed' — a box the size CharacterCountTextMeasurer would report
 *             (0.6em per glyph, 1.2em per line). Tests box algebra.
 *   'ahem'  — real text in the Ahem font, whose glyphs are 1em squares
 *             (ascent 0.8, descent 0.2). Tests wrapping and baselines;
 *             the Gesso side measures with `glyphWidth: 1`.
 */
export type CaseFont = 'fixed' | 'ahem';

export interface CaseProps {
  width?: CaseLength;
  height?: CaseLength;
  minWidth?: CaseLength;
  maxWidth?: CaseLength;
  minHeight?: CaseLength;
  maxHeight?: CaseLength;
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  margin?: CaseLength;
  marginTop?: CaseLength;
  marginRight?: CaseLength;
  marginBottom?: CaseLength;
  marginLeft?: CaseLength;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  flex?: number;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: CaseLength;
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  alignContent?: Alignment;
  /** 'row-reverse' on a row, 'column-reverse' on a column. */
  direction?: 'row' | 'row-reverse' | 'column' | 'column-reverse';
  textDirection?: 'ltr' | 'rtl';
  aspectRatio?: number;
  /** Alignment of children along the x axis (main for rows, cross for columns). */
  x?: Alignment;
  /** Alignment of children along the y axis (main for columns, cross for rows). */
  y?: Alignment;
  selfX?: Alignment;
  selfY?: Alignment;
  position?: 'static' | 'relative' | 'absolute' | 'sticky';
  overflow?: 'visible' | 'hidden' | 'scroll' | 'auto';
  scrollX?: number;
  scrollY?: number;
  top?: CaseLength;
  right?: CaseLength;
  bottom?: CaseLength;
  left?: CaseLength;
  inset?: CaseLength;
  zIndex?: number;
  columns?: readonly CaseTrack[];
  rows?: readonly CaseTrack[];
  autoColumns?: CaseTrack;
  autoRows?: CaseTrack;
  autoFlow?: 'row' | 'column';
  justifyContent?: Alignment;
  column?: number;
  columnSpan?: number;
  row?: number;
  rowSpan?: number;
  text?: string;
  fontSize?: number;
  lineHeight?: number;
  textWrap?: TextWrap;
  maxLines?: number;
  textOverflow?: TextOverflow;
}

export interface CaseNode {
  readonly type: CaseNodeType;
  readonly props: CaseProps;
  readonly children: readonly CaseNode[];
}

export interface LayoutCase {
  /** Unique, slash-grouped: `grow/two-equal`. */
  readonly name: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly root: CaseNode;
  /** Default 'fixed'. */
  readonly font?: CaseFont;
  /**
   * Set when Gesso is known to disagree with Chrome. The spec then
   * expects the comparison to fail, so fixing the engine surfaces as a
   * test that must have its divergence note removed.
   */
  readonly divergence?: string;
}

/**
 * The deterministic text metrics shared by CharacterCountTextMeasurer
 * and the HTML translator: every glyph is 0.6em wide, a line is 1.2em
 * tall. Cases use font sizes that keep these integral.
 */
export const TEXT_GLYPH_WIDTH_FACTOR = 0.6;
export const TEXT_LINE_HEIGHT_FACTOR = 1.2;
export const DEFAULT_CASE_FONT_SIZE = 10;

export function row(props: CaseProps = {}, ...children: CaseNode[]): CaseNode {
  return { type: 'row', props, children };
}

export function column(props: CaseProps = {}, ...children: CaseNode[]): CaseNode {
  return { type: 'column', props, children };
}

export function box(props: CaseProps = {}, ...children: CaseNode[]): CaseNode {
  return { type: 'box', props, children };
}

export function grid(props: CaseProps = {}, ...children: CaseNode[]): CaseNode {
  return { type: 'grid', props, children };
}

/**
 * Fixed-box text: a single line the deterministic measurer's size. It
 * never wraps, because the box Chrome renders for it cannot.
 */
export function text(value: string, props: CaseProps = {}): CaseNode {
  return {
    type: 'text',
    props: { fontSize: DEFAULT_CASE_FONT_SIZE, textWrap: 'none', ...props, text: value },
    children: []
  };
}

/** Real text for `font: 'ahem'` cases: wraps by default like CSS. */
export function paragraph(value: string, props: CaseProps = {}): CaseNode {
  return { type: 'text', props: { fontSize: DEFAULT_CASE_FONT_SIZE, ...props, text: value }, children: [] };
}

const VIEWPORT = { width: 300, height: 200 } as const;

function testCase(name: string, root: CaseNode, extra: Partial<Omit<LayoutCase, 'name' | 'root'>> = {}): LayoutCase {
  return { name, viewport: VIEWPORT, root, ...extra };
}

function ahem(name: string, root: CaseNode): LayoutCase {
  return { name, viewport: VIEWPORT, root, font: 'ahem' };
}

/** A fixed-size leaf: the workhorse of most cases. */
const leaf = (width: number, height: number, props: CaseProps = {}): CaseNode => box({ width, height, ...props });

export const layoutCases: readonly LayoutCase[] = [
  // ---------------------------------------------------------------------------
  // Root sizing
  // ---------------------------------------------------------------------------
  testCase('root/column-fills-viewport', column({}, leaf(50, 20))),
  testCase('root/explicit-width-wins-over-viewport', column({ width: 120 }, leaf(50, 20))),
  testCase('root/explicit-size-smaller-than-viewport', row({ width: 100, height: 60 }, leaf(30, 30))),
  testCase('root/padding-offsets-children', column({ padding: 12 }, leaf(50, 20))),
  testCase('root/asymmetric-padding', column({ paddingTop: 5, paddingLeft: 20, paddingRight: 7 }, leaf(50, 20))),
  testCase('root/side-padding-overrides-shorthand', column({ padding: 10, paddingLeft: 30 }, leaf(50, 20))),

  // ---------------------------------------------------------------------------
  // Box sizing: explicit, min, max
  // ---------------------------------------------------------------------------
  testCase('size/explicit-leaf', column({}, leaf(80, 40))),
  testCase('size/min-width-raises-explicit', column({}, leaf(20, 20, { minWidth: 60 }))),
  testCase('size/max-width-lowers-explicit', column({}, leaf(200, 20, { maxWidth: 60 }))),
  testCase('size/min-beats-max', column({}, leaf(50, 20, { minWidth: 80, maxWidth: 40 }))),
  testCase('size/container-min-height-larger-than-content', column({}, column({ minHeight: 90 }, leaf(30, 20)))),
  testCase(
    'size/container-max-height-shrinks-children',
    column({}, column({ maxHeight: 50 }, leaf(30, 40), leaf(30, 40)))
  ),
  testCase('size/container-max-width-clamps', column({}, row({ maxWidth: 70 }, leaf(50, 20), leaf(50, 20)))),
  testCase('size/padding-inside-explicit-size', column({}, box({ width: 100, height: 60, padding: 10 }, leaf(30, 20)))),
  testCase('size/container-grows-to-padded-content', column({}, row({ padding: 8 }, leaf(40, 20), leaf(40, 30)))),
  testCase('size/empty-row-with-padding', column({}, row({ padding: 6 }))),
  testCase('size/empty-column-with-gap-is-zero', column({}, column({ gap: 10 }))),
  testCase('size/empty-leaf-is-its-padding', column({}, box({ padding: 6 }))),

  // ---------------------------------------------------------------------------
  // Row main-axis alignment
  // ---------------------------------------------------------------------------
  testCase('row/start', row({}, leaf(40, 20), leaf(60, 20))),
  testCase('row/center', row({ x: 'center' }, leaf(40, 20), leaf(60, 20))),
  testCase('row/end', row({ x: 'end' }, leaf(40, 20), leaf(60, 20))),
  testCase('row/space-between', row({ x: 'space-between' }, leaf(40, 20), leaf(60, 20), leaf(20, 20))),
  testCase('row/space-evenly', row({ x: 'space-evenly' }, leaf(40, 20), leaf(60, 20), leaf(20, 20))),
  testCase('row/space-around', row({ x: 'space-around' }, leaf(40, 20), leaf(60, 20), leaf(20, 20))),
  testCase('row/space-between-single-child', row({ x: 'space-between' }, leaf(40, 20))),
  testCase('row/center-single-child', row({ x: 'center' }, leaf(40, 20))),

  // ---------------------------------------------------------------------------
  // Column main-axis alignment
  // ---------------------------------------------------------------------------
  testCase('column/start', column({}, leaf(40, 20), leaf(40, 30))),
  testCase('column/center', column({ y: 'center' }, leaf(40, 20), leaf(40, 30))),
  testCase('column/end', column({ y: 'end' }, leaf(40, 20), leaf(40, 30))),
  testCase('column/space-between', column({ y: 'space-between' }, leaf(40, 20), leaf(40, 30), leaf(40, 10))),
  testCase('column/space-evenly', column({ y: 'space-evenly' }, leaf(40, 20), leaf(40, 30), leaf(40, 10))),
  testCase('column/space-around', column({ y: 'space-around' }, leaf(40, 20), leaf(40, 30), leaf(40, 10))),

  // ---------------------------------------------------------------------------
  // Cross-axis alignment
  // ---------------------------------------------------------------------------
  testCase('cross/row-start-default', row({}, leaf(40, 20), leaf(40, 50))),
  testCase('cross/row-center', row({ y: 'center' }, leaf(40, 20), leaf(40, 50))),
  testCase('cross/row-end', row({ y: 'end' }, leaf(40, 20), leaf(40, 50))),
  testCase(
    'cross/row-stretch-auto-height',
    row({ y: 'stretch' }, box({ width: 40 }), box({ width: 40 }, leaf(10, 50)))
  ),
  testCase('cross/column-center', column({ x: 'center' }, leaf(40, 20), leaf(100, 20))),
  testCase('cross/column-end', column({ x: 'end' }, leaf(40, 20), leaf(100, 20))),
  testCase(
    'cross/column-stretch-auto-width',
    column({ x: 'stretch' }, box({ height: 20 }), box({ height: 20 }, leaf(50, 10)))
  ),
  testCase(
    'cross/self-overrides-container',
    row({ y: 'center' }, leaf(40, 20), leaf(40, 20, { selfY: 'end' }), leaf(40, 50))
  ),
  testCase(
    'cross/self-stretch-in-start-row',
    row({}, leaf(40, 20), box({ width: 40, selfY: 'stretch' }), leaf(40, 50))
  ),
  testCase('cross/column-self-center', column({}, leaf(40, 20), leaf(40, 20, { selfX: 'center' }), leaf(100, 20))),
  testCase('cross/stretch-does-not-override-explicit-cross-size', row({ y: 'stretch' }, leaf(40, 20), leaf(40, 50))),

  // ---------------------------------------------------------------------------
  // Flex grow
  // ---------------------------------------------------------------------------
  testCase('grow/single-fills-remaining', row({}, leaf(40, 20), box({ height: 20, flexGrow: 1 }))),
  testCase('grow/two-equal', row({}, box({ height: 20, flexGrow: 1 }), box({ height: 20, flexGrow: 1 }))),
  testCase('grow/weighted-1-3', row({}, box({ height: 20, flexGrow: 1 }), box({ height: 20, flexGrow: 3 }))),
  testCase('grow/adds-to-measured-base', row({}, leaf(20, 20, { flexGrow: 1 }), leaf(80, 20, { flexGrow: 1 }))),
  testCase('grow/column', column({}, leaf(40, 20), box({ width: 40, flexGrow: 1 }), leaf(40, 30))),
  testCase(
    'grow/with-gap',
    row({ gap: 10 }, box({ height: 20, flexGrow: 1 }), leaf(50, 20), box({ height: 20, flexGrow: 1 }))
  ),
  testCase('grow/with-padding', row({ padding: 15 }, box({ height: 20, flexGrow: 1 }), leaf(50, 20))),
  testCase('grow/single-max-clamped', row({}, box({ height: 20, flexGrow: 1, maxWidth: 100 }), leaf(50, 20))),
  testCase(
    'grow/clamped-remainder-redistributes',
    row({}, box({ height: 20, flexGrow: 1, maxWidth: 60 }), box({ height: 20, flexGrow: 1 }))
  ),
  testCase(
    'grow/alignment-ignored-when-no-free-space',
    row({ x: 'end' }, box({ height: 20, flexGrow: 1 }), leaf(50, 20))
  ),

  // ---------------------------------------------------------------------------
  // Flex shrink
  // ---------------------------------------------------------------------------
  testCase('shrink/two-equal-bases', row({}, leaf(200, 20), leaf(200, 20))),
  testCase('shrink/weighted-by-base-size', row({}, leaf(100, 20), leaf(300, 20))),
  testCase('shrink/factor-zero-keeps-size', row({}, leaf(200, 20, { flexShrink: 0 }), leaf(200, 20))),
  testCase('shrink/factor-weights', row({}, leaf(200, 20, { flexShrink: 1 }), leaf(200, 20, { flexShrink: 3 }))),
  testCase('shrink/column', column({}, leaf(40, 150), leaf(40, 150))),
  testCase('shrink/with-gap', row({ gap: 20 }, leaf(200, 20), leaf(200, 20))),
  testCase(
    'shrink/respects-min-width-single',
    row({}, leaf(200, 20, { minWidth: 150 }), leaf(200, 20, { flexShrink: 0 }))
  ),
  testCase('shrink/clamped-remainder-redistributes', row({}, leaf(200, 20, { minWidth: 180 }), leaf(200, 20))),
  testCase('shrink/no-shrink-overflows-parent', row({}, leaf(400, 20, { flexShrink: 0 }))),

  // ---------------------------------------------------------------------------
  // Flex basis
  // ---------------------------------------------------------------------------
  testCase('basis/replaces-measured-main', row({}, leaf(40, 20, { flexBasis: 100 }), leaf(40, 20))),
  testCase(
    'basis/with-grow',
    row({}, box({ height: 20, flexBasis: 50, flexGrow: 1 }), box({ height: 20, flexBasis: 150, flexGrow: 1 }))
  ),
  testCase('basis/clamped-by-max', row({}, leaf(40, 20, { flexBasis: 100, maxWidth: 70 }), leaf(40, 20))),
  testCase(
    'basis/sizes-container',
    column({ x: 'start' }, row({}, box({ height: 20, flexBasis: 90 }), box({ height: 20, flexBasis: 60 }))),
    {
      divergence:
        "Gesso counts flex-basis toward a shrink-wrapped container's size; Chrome sizes the container from item content and ignores flex-basis (browsers disagree with each other here)."
    }
  ),
  testCase('basis/column', column({}, box({ width: 40, flexBasis: 70 }), leaf(40, 20))),

  // ---------------------------------------------------------------------------
  // Gap
  // ---------------------------------------------------------------------------
  testCase('gap/row', row({ gap: 12 }, leaf(40, 20), leaf(40, 20), leaf(40, 20))),
  testCase('gap/column', column({ gap: 12 }, leaf(40, 20), leaf(40, 20), leaf(40, 20))),
  testCase('gap/with-space-between', row({ gap: 10, x: 'space-between' }, leaf(40, 20), leaf(40, 20), leaf(40, 20))),
  testCase('gap/with-center', row({ gap: 10, x: 'center' }, leaf(40, 20), leaf(40, 20))),
  testCase('gap/single-child-no-gap', row({ gap: 50 }, leaf(40, 20))),
  testCase('gap/sizes-nested-container', column({}, row({ gap: 15 }, leaf(40, 20), leaf(40, 20)))),

  // ---------------------------------------------------------------------------
  // Margins
  // ---------------------------------------------------------------------------
  testCase('margin/row-main-axis', row({}, leaf(40, 20, { marginLeft: 10, marginRight: 30 }), leaf(40, 20))),
  testCase('margin/row-cross-axis', row({}, leaf(40, 20, { marginTop: 15 }), leaf(40, 20))),
  testCase('margin/shorthand', row({}, leaf(40, 20, { margin: 8 }), leaf(40, 20))),
  testCase('margin/side-overrides-shorthand', row({}, leaf(40, 20, { margin: 8, marginLeft: 20 }), leaf(40, 20))),
  testCase('margin/with-gap', row({ gap: 10 }, leaf(40, 20, { margin: 5 }), leaf(40, 20, { margin: 5 }))),
  testCase('margin/cross-center-includes-margin', row({ y: 'center' }, leaf(40, 20, { marginTop: 20 }), leaf(40, 60))),
  testCase(
    'margin/cross-stretch-subtracts-margin',
    row({ y: 'stretch' }, box({ width: 40, marginTop: 10, marginBottom: 6 }), box({ width: 40 }, leaf(10, 60)))
  ),
  testCase('margin/sizes-container', column({}, row({}, leaf(40, 20, { margin: 10 }), leaf(40, 20)))),
  testCase('margin/column-main-axis', column({}, leaf(40, 20, { marginTop: 7, marginBottom: 13 }), leaf(40, 20))),
  testCase(
    'margin/space-between-with-margins',
    row({ x: 'space-between' }, leaf(40, 20, { marginRight: 10 }), leaf(40, 20, { marginLeft: 10 }))
  ),

  // ---------------------------------------------------------------------------
  // Stack (Box with children)
  // ---------------------------------------------------------------------------
  testCase('stack/children-at-origin', column({}, box({}, leaf(40, 20), leaf(60, 10)))),
  testCase('stack/sizes-to-largest-child', column({}, box({ padding: 5 }, leaf(40, 20), leaf(20, 50)))),
  testCase('stack/explicit-size-with-children', column({}, box({ width: 100, height: 80 }, leaf(40, 20)))),
  testCase('stack/child-wider-than-explicit-box', column({}, box({ width: 50, height: 50 }, leaf(80, 20)))),
  testCase(
    'stack/nested-row-inside-box',
    column({}, box({ padding: 10 }, row({ gap: 5 }, leaf(20, 20), leaf(20, 20))))
  ),
  testCase('stack/child-margin-offsets', column({}, box({}, leaf(40, 20, { marginLeft: 10, marginTop: 5 })))),

  // ---------------------------------------------------------------------------
  // Stack alignment
  // ---------------------------------------------------------------------------
  testCase('stack/align-center', column({}, box({ width: 200, height: 100, x: 'center', y: 'center' }, leaf(40, 20)))),
  testCase('stack/align-end', column({}, box({ width: 200, height: 100, x: 'end', y: 'end' }, leaf(40, 20)))),
  testCase(
    'stack/self-overrides-stack',
    column(
      {},
      box({ width: 200, height: 100, x: 'center' }, leaf(40, 20, { selfX: 'end', selfY: 'center' }), leaf(20, 10))
    )
  ),
  testCase(
    'stack/end-with-margins',
    column({}, box({ width: 200, height: 100, x: 'end', y: 'end' }, leaf(40, 20, { marginRight: 10, marginBottom: 5 })))
  ),
  testCase(
    'stack/stretch-auto-child-only',
    column({}, box({ width: 200, height: 100, x: 'stretch', y: 'stretch', padding: 10 }, box({}), leaf(40, 20)))
  ),

  // ---------------------------------------------------------------------------
  // Positioning
  // ---------------------------------------------------------------------------
  testCase(
    'position/absolute-top-left-takes-no-space',
    column({}, leaf(50, 20), box({ position: 'absolute', top: 30, left: 40, width: 10, height: 10 }), leaf(50, 20))
  ),
  testCase(
    'position/absolute-right-bottom',
    column({}, box({ position: 'absolute', right: 10, bottom: 20, width: 30, height: 30 }))
  ),
  testCase('position/absolute-inset-is-tight', column({}, box({ position: 'absolute', inset: 10 }))),
  testCase(
    'position/absolute-two-edges-one-axis',
    column({}, box({ position: 'absolute', left: 20, right: 50, top: 5, height: 15 }))
  ),
  testCase(
    'position/absolute-with-margin',
    column({}, box({ position: 'absolute', top: 10, left: 10, margin: 5, width: 20, height: 20 }))
  ),
  testCase(
    'position/absolute-in-row-takes-no-space',
    row({}, leaf(40, 20), box({ position: 'absolute', left: 100, top: 50, width: 10, height: 10 }), leaf(40, 20))
  ),
  testCase(
    'position/containing-block-is-positioned-ancestor',
    column(
      { padding: 20 },
      column(
        { padding: 5 },
        box(
          { position: 'relative', width: 100, height: 80, margin: 7 },
          box({ position: 'absolute', top: 5, right: 5, width: 20, height: 10 })
        )
      )
    )
  ),
  testCase(
    'position/absolute-skips-static-ancestors',
    column(
      { padding: 20 },
      column(
        { padding: 5 },
        box({ width: 100, height: 80 }, box({ position: 'absolute', top: 5, right: 5, width: 20, height: 10 }))
      )
    )
  ),
  testCase(
    'position/relative-offset-keeps-flow-slot',
    column({}, leaf(50, 20, { position: 'relative', left: 15, top: 5 }), leaf(50, 20))
  ),
  testCase(
    'position/relative-right-bottom-are-negative',
    column({}, leaf(50, 20, { position: 'relative', right: 15, bottom: 5 }), leaf(50, 20))
  ),
  testCase(
    'position/absolute-inside-flex-child',
    row(
      { gap: 10 },
      box(
        { width: 60, height: 40, position: 'relative' },
        box({ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10 })
      ),
      leaf(60, 40)
    )
  ),
  ahem(
    'position/absolute-text-wraps-between-edges',
    column({}, paragraph('ab cd ef', { position: 'absolute', left: 10, right: 230, top: 0 }))
  ),

  // ---------------------------------------------------------------------------
  // Text (deterministic metrics: 0.6em per glyph, 1.2em line)
  // ---------------------------------------------------------------------------
  testCase('text/natural-size', column({}, text('hello world'))),
  testCase('text/font-size-scales', column({}, text('hello', { fontSize: 20 }))),
  testCase('text/clamped-by-narrow-parent', column({}, row({ width: 40 }, text('a long line of text')))),
  testCase('text/in-row-with-grow-sibling', row({}, text('label'), box({ height: 12, flexGrow: 1 }))),
  testCase(
    'text/two-texts-shrink-equally',
    row({ width: 100 }, text('aaaaaaaaaaaaaaaaaaaa'), text('bbbbbbbbbbbbbbbbbbbb'))
  ),
  testCase(
    'text/no-shrink-sibling-takes-space',
    row({ width: 100 }, text('aaaaaaaaaaaaaaaaaaaa'), leaf(60, 10, { flexShrink: 0 }))
  ),
  testCase('text/explicit-width-wins', column({}, text('hello world', { width: 30 }))),
  testCase('text/cross-centered-in-row', row({ y: 'center' }, text('hi'), leaf(20, 40))),
  testCase('text/column-of-lines', column({ gap: 4 }, text('one'), text('three'), text('fourteen'))),

  // ---------------------------------------------------------------------------
  // Paragraphs: real text in Ahem (1em glyphs, 12px lines at 10px)
  // ---------------------------------------------------------------------------
  ahem('paragraph/natural-width-when-it-fits', column({}, paragraph('abcd efgh'))),
  ahem('paragraph/wraps-at-column-width', column({ width: 100 }, paragraph('abcd efgh ijkl mnop'))),
  ahem(
    'paragraph/fit-content-is-available-width-once-wrapped',
    column({ width: 80 }, paragraph('abcd efgh ijkl'), leaf(20, 10))
  ),
  ahem('paragraph/long-word-overflows', column({ width: 50 }, paragraph('abcdefghij kl'))),
  ahem('paragraph/char-wrap-breaks-anywhere', column({ width: 50 }, paragraph('abcdefghijkl', { textWrap: 'char' }))),
  ahem('paragraph/nowrap-single-line', column({ width: 50 }, paragraph('abcd efgh', { textWrap: 'none' }))),
  ahem('paragraph/hard-break', column({}, paragraph('ab\ncdef'))),
  ahem('paragraph/blank-line', column({}, paragraph('ab\n\ncd'))),
  ahem(
    'paragraph/max-lines-clamps-height',
    column({ width: 100 }, paragraph('abcd efgh ijkl mnop qrst', { maxLines: 2 }))
  ),
  ahem(
    'paragraph/max-lines-ellipsis-keeps-geometry',
    column({ width: 100 }, paragraph('abcd efgh ijkl mnop qrst', { maxLines: 2, textOverflow: 'ellipsis' }))
  ),
  ahem('paragraph/padding-narrows-the-wrap-width', column({ width: 100 }, paragraph('abcd efgh ijkl', { padding: 5 }))),
  ahem(
    'paragraph/stretched-in-column-wraps-at-full-width',
    column({ width: 100, x: 'stretch' }, paragraph('abcd efgh ijkl'))
  ),
  ahem(
    'paragraph/text-in-row-shrinks-and-wraps',
    row({ width: 100 }, paragraph('abcd efgh ijkl'), leaf(40, 10, { flexShrink: 0 }))
  ),
  ahem('paragraph/two-texts-shrink-by-max-content', row({ width: 100 }, paragraph('abcd efgh'), paragraph('ab cd'))),
  ahem(
    'paragraph/ellipsis-in-shrunk-row-item',
    row({ width: 60 }, paragraph('abcdefghij', { textWrap: 'none', textOverflow: 'ellipsis' }))
  ),
  ahem(
    'paragraph/grown-column-rewraps-wider',
    row({ width: 120 }, column({ flexGrow: 1, x: 'stretch' }, paragraph('ab cd ef gh ij kl')))
  ),
  ahem(
    'paragraph/baseline-aligns-different-sizes',
    row({ y: 'baseline' }, paragraph('ab'), paragraph('cd', { fontSize: 20 }))
  ),
  ahem('paragraph/baseline-with-padding', row({ y: 'baseline' }, paragraph('ab', { paddingTop: 10 }), paragraph('cd'))),
  ahem(
    'paragraph/baseline-with-margin',
    row({ y: 'baseline' }, paragraph('ab', { marginTop: 4 }), paragraph('cd', { fontSize: 20 }))
  ),
  ahem('paragraph/baseline-synthesized-from-box-bottom', row({ y: 'baseline' }, leaf(20, 30), paragraph('ab'))),
  ahem(
    'paragraph/baseline-of-nested-column-is-first-child',
    row({ y: 'baseline' }, column({}, paragraph('ab', { fontSize: 20 }), paragraph('cd')), paragraph('ef'))
  ),
  ahem(
    'paragraph/self-baseline-in-start-row',
    row({}, paragraph('ab', { selfY: 'baseline' }), paragraph('cd', { fontSize: 20, selfY: 'baseline' }), leaf(10, 40))
  ),
  ahem('paragraph/custom-line-height', column({}, paragraph('ab cd', { lineHeight: 20, width: 20 }))),

  // ---------------------------------------------------------------------------
  // Stretch is the default cross alignment
  // ---------------------------------------------------------------------------
  testCase('stretch/row-children-fill-height', row({ height: 60 }, box({ width: 40 }), leaf(40, 20))),
  testCase('stretch/column-children-fill-width', column({ width: 200 }, box({ height: 20 }), leaf(40, 20))),
  testCase('stretch/clamped-by-max', column({ width: 200 }, box({ height: 20, maxWidth: 120 }))),
  testCase(
    'stretch/nested-row-fills-column',
    column({ width: 200 }, row({}, leaf(40, 20), box({ height: 20, flexGrow: 1 })))
  ),
  ahem('stretch/text-fills-column-width', column({ width: 100 }, paragraph('ab'))),

  // ---------------------------------------------------------------------------
  // Automatic minimum size
  // ---------------------------------------------------------------------------
  ahem(
    'automin/text-keeps-longest-word',
    row({ width: 60 }, paragraph('abcdefghij kl'), leaf(30, 10, { flexShrink: 0 }))
  ),
  ahem(
    'automin/explicit-min-zero-shrinks',
    row({ width: 60 }, paragraph('abcdefghij', { minWidth: 0 }), leaf(30, 10, { flexShrink: 0 }))
  ),
  ahem('automin/column-keeps-content-height', column({ height: 20 }, paragraph('ab'), paragraph('cd'))),
  ahem(
    'automin/nested-row-min-content',
    column({ width: 50, x: 'start' }, row({}, paragraph('abcdef'), paragraph('gh')))
  ),
  testCase('automin/empty-boxes-still-shrink', row({ width: 100 }, leaf(80, 20), leaf(80, 20))),

  // ---------------------------------------------------------------------------
  // Redistribution
  // ---------------------------------------------------------------------------
  testCase(
    'redistribute/grow-two-clamped',
    row(
      {},
      box({ height: 20, flexGrow: 1, maxWidth: 40 }),
      box({ height: 20, flexGrow: 1, maxWidth: 60 }),
      box({ height: 20, flexGrow: 1 })
    )
  ),
  testCase(
    'redistribute/shrink-two-clamped',
    row({}, leaf(200, 20, { minWidth: 180 }), leaf(200, 20, { minWidth: 150 }), leaf(200, 20))
  ),
  testCase(
    'redistribute/factor-sum-below-one',
    row({}, box({ height: 20, flexGrow: 0.25 }), box({ height: 20, flexGrow: 0.25 }))
  ),

  // ---------------------------------------------------------------------------
  // Wrapping
  // ---------------------------------------------------------------------------
  testCase(
    'wrap/two-lines',
    column(
      { x: 'start' },
      row({ width: 100, flexWrap: 'wrap', gap: 5 }, leaf(40, 20), leaf(40, 20), leaf(40, 20), leaf(40, 20))
    )
  ),
  testCase(
    'wrap/oversized-item-alone',
    column({ x: 'start' }, row({ width: 100, flexWrap: 'wrap' }, leaf(40, 20), leaf(120, 20), leaf(40, 20)))
  ),
  testCase(
    'wrap/row-gap-and-column-gap',
    column(
      { x: 'start' },
      row({ width: 100, flexWrap: 'wrap', rowGap: 8, columnGap: 4 }, leaf(45, 20), leaf(45, 20), leaf(45, 20))
    )
  ),
  testCase(
    'wrap/lines-stretch-by-default',
    row({ width: 100, height: 100, flexWrap: 'wrap' }, box({ width: 40 }), box({ width: 40 }), box({ width: 40 }))
  ),
  testCase(
    'wrap/align-content-start',
    row({ width: 100, height: 100, flexWrap: 'wrap', alignContent: 'start' }, leaf(40, 20), leaf(40, 20), leaf(40, 20))
  ),
  testCase(
    'wrap/align-content-center',
    row({ width: 100, height: 100, flexWrap: 'wrap', alignContent: 'center' }, leaf(40, 20), leaf(40, 20), leaf(40, 20))
  ),
  testCase(
    'wrap/align-content-end',
    row({ width: 100, height: 100, flexWrap: 'wrap', alignContent: 'end' }, leaf(40, 20), leaf(40, 20), leaf(40, 20))
  ),
  testCase(
    'wrap/align-content-space-between',
    row(
      { width: 100, height: 100, flexWrap: 'wrap', alignContent: 'space-between' },
      leaf(40, 20),
      leaf(40, 20),
      leaf(40, 20)
    )
  ),
  testCase(
    'wrap/align-content-space-around',
    row(
      { width: 100, height: 100, flexWrap: 'wrap', alignContent: 'space-around' },
      leaf(40, 20),
      leaf(40, 20),
      leaf(40, 20)
    )
  ),
  testCase(
    'wrap/align-content-space-evenly',
    row(
      { width: 100, height: 100, flexWrap: 'wrap', alignContent: 'space-evenly' },
      leaf(40, 20),
      leaf(40, 20),
      leaf(40, 20)
    )
  ),
  testCase(
    'wrap/wrap-reverse',
    row(
      { width: 100, height: 100, flexWrap: 'wrap-reverse', alignContent: 'start' },
      leaf(40, 20),
      leaf(40, 20),
      leaf(40, 20)
    )
  ),
  testCase(
    'wrap/grow-within-lines',
    row(
      { width: 100, flexWrap: 'wrap' },
      box({ width: 60, height: 20, flexGrow: 1 }),
      box({ width: 60, height: 20, flexGrow: 1 }),
      box({ width: 30, height: 20, flexGrow: 1 })
    )
  ),
  testCase(
    'wrap/column-wraps-into-columns',
    column({ height: 100, flexWrap: 'wrap', y: 'start' }, leaf(20, 40), leaf(20, 40), leaf(20, 40))
  ),
  testCase(
    'wrap/center-items-in-each-line',
    row(
      { width: 100, flexWrap: 'wrap', x: 'center', y: 'start' },
      leaf(30, 20),
      leaf(30, 20),
      leaf(30, 20),
      leaf(30, 20)
    )
  ),

  // ---------------------------------------------------------------------------
  // Reversed directions and rtl
  // ---------------------------------------------------------------------------
  testCase('reverse/row-reverse', row({ direction: 'row-reverse', y: 'start' }, leaf(40, 20), leaf(60, 20))),
  testCase(
    'reverse/row-reverse-center',
    row({ direction: 'row-reverse', x: 'center', y: 'start', gap: 10 }, leaf(40, 20), leaf(60, 20))
  ),
  testCase(
    'reverse/row-reverse-space-between',
    row({ direction: 'row-reverse', x: 'space-between', y: 'start' }, leaf(40, 20), leaf(60, 20), leaf(20, 20))
  ),
  testCase('reverse/column-reverse', column({ direction: 'column-reverse', x: 'start' }, leaf(40, 20), leaf(40, 30))),
  testCase('reverse/rtl-row', row({ textDirection: 'rtl', y: 'start' }, leaf(40, 20), leaf(60, 20))),
  testCase('reverse/rtl-row-end', row({ textDirection: 'rtl', x: 'end', y: 'start' }, leaf(40, 20), leaf(60, 20))),
  testCase(
    'reverse/rtl-row-reverse-cancels',
    row({ textDirection: 'rtl', direction: 'row-reverse', y: 'start' }, leaf(40, 20), leaf(60, 20))
  ),
  testCase(
    'reverse/rtl-auto-margin',
    row({ textDirection: 'rtl', y: 'start' }, leaf(40, 20), leaf(40, 20, { marginLeft: autoLength }))
  ),

  // ---------------------------------------------------------------------------
  // Auto margins
  // ---------------------------------------------------------------------------
  testCase('automargin/pushes-to-end', row({ y: 'start' }, leaf(40, 20), leaf(40, 20, { marginLeft: autoLength }))),
  testCase(
    'automargin/centers-with-both',
    row({ y: 'start' }, leaf(40, 20, { marginLeft: autoLength, marginRight: autoLength }))
  ),
  testCase(
    'automargin/shared-between-items',
    row({ y: 'start' }, leaf(40, 20, { marginRight: autoLength }), leaf(40, 20, { marginRight: autoLength }))
  ),
  testCase(
    'automargin/beats-alignment',
    row({ x: 'center', y: 'start' }, leaf(40, 20), leaf(40, 20, { marginLeft: autoLength }))
  ),
  testCase(
    'automargin/cross-centers',
    row({ height: 100 }, leaf(40, 20, { marginTop: autoLength, marginBottom: autoLength }), leaf(40, 20))
  ),
  testCase('automargin/cross-pushes-to-end', row({ height: 100 }, leaf(40, 20, { marginTop: autoLength }))),
  testCase(
    'automargin/column-main',
    column({ height: 200, x: 'start' }, leaf(40, 20), leaf(40, 20, { marginTop: autoLength }))
  ),

  // ---------------------------------------------------------------------------
  // flex shorthand, percentages, aspect ratio
  // ---------------------------------------------------------------------------
  testCase(
    'flex/equal-shares-ignore-content',
    row({ y: 'start' }, box({ height: 20, flex: 1 }), leaf(120, 20, { flex: 1 }), box({ height: 20, flex: 1 }))
  ),
  testCase('flex/weighted', row({ y: 'start' }, box({ height: 20, flex: 1 }), box({ height: 20, flex: 2 }))),
  testCase(
    'flex/explicit-basis-wins',
    row({ y: 'start' }, box({ height: 20, flex: 1, flexBasis: 100 }), box({ height: 20, flex: 1 }))
  ),
  testCase('percent/width-of-definite-parent', column({ width: 200, x: 'start' }, box({ width: pct(50), height: 20 }))),
  testCase(
    'percent/height-of-definite-parent',
    column({ height: 200, x: 'start' }, box({ width: 20, height: pct(25) }))
  ),
  testCase('percent/max-width', column({ width: 200, x: 'start' }, box({ width: 150, maxWidth: pct(50), height: 20 }))),
  testCase(
    'percent/flex-basis',
    row({ width: 200, y: 'start' }, box({ height: 20, flexBasis: pct(25) }), box({ height: 20, flexBasis: pct(25) }))
  ),
  testCase(
    'percent/absolute-insets',
    column(
      {},
      box(
        { position: 'relative', width: 200, height: 100 },
        box({ position: 'absolute', left: pct(10), top: pct(50), width: pct(30), height: pct(25) })
      )
    )
  ),
  testCase(
    'percent/padded-parent-uses-content-box',
    column({ width: 200, padding: 20, x: 'start' }, box({ width: pct(50), height: 20 }))
  ),
  testCase('aspect/width-drives-height', column({ x: 'start' }, box({ width: 100, aspectRatio: 2 }))),
  testCase('aspect/height-drives-width', row({ y: 'start' }, box({ height: 50, aspectRatio: 2 }))),
  testCase('aspect/stretched-width-drives-height', column({ width: 200 }, box({ aspectRatio: 4 }))),
  testCase('aspect/stretched-height-drives-width', row({ height: 50 }, box({ aspectRatio: 2 }), leaf(10, 10))),

  // ---------------------------------------------------------------------------
  // Overflow, scrolling and sticky (Chrome scrolls the elements before measuring)
  // ---------------------------------------------------------------------------
  testCase(
    'overflow/hidden-keeps-layout',
    column({ x: 'start' }, box({ width: 100, height: 50, overflow: 'hidden' }, leaf(150, 80)))
  ),
  ahem(
    'overflow/scroll-children-keep-content-height',
    column({ height: 40, overflow: 'scroll' }, paragraph('ab'), paragraph('cd'), paragraph('ef'), paragraph('gh'))
  ),
  ahem(
    'overflow/scrolled-content-shifts',
    column(
      { height: 40, overflow: 'scroll', scrollY: 8 },
      paragraph('ab'),
      paragraph('cd'),
      paragraph('ef'),
      paragraph('gh')
    )
  ),
  testCase(
    'overflow/scroll-offset-clamps-to-content',
    column(
      { height: 40, overflow: 'scroll', x: 'start' },
      leaf(20, 30, { flexShrink: 0 }),
      leaf(20, 30, { flexShrink: 0 })
    ),
    {}
  ),
  testCase(
    'overflow/nested-scroll-offsets-add',
    column(
      { height: 60, overflow: 'scroll', scrollY: 10, x: 'start' },
      column(
        { height: 40, overflow: 'scroll', scrollY: 5, x: 'start', flexShrink: 0 },
        leaf(20, 30, { flexShrink: 0 }),
        leaf(20, 30, { flexShrink: 0 })
      ),
      leaf(20, 50, { flexShrink: 0 })
    )
  ),
  testCase(
    'overflow/row-scrolls-horizontally',
    row(
      { width: 60, overflow: 'scroll', scrollX: 20, y: 'start' },
      leaf(40, 20, { flexShrink: 0 }),
      leaf(40, 20, { flexShrink: 0 })
    )
  ),
  testCase(
    'sticky/header-holds-at-scrollport-top',
    column(
      { height: 60, overflow: 'scroll', scrollY: 30, x: 'start' },
      box({ position: 'sticky', top: 0, width: 20, height: 10, flexShrink: 0 }),
      leaf(20, 200, { flexShrink: 0 })
    )
  ),
  testCase(
    'sticky/with-top-inset',
    column(
      { height: 60, overflow: 'scroll', scrollY: 30, x: 'start' },
      box({ position: 'sticky', top: 5, width: 20, height: 10, flexShrink: 0 }),
      leaf(20, 200, { flexShrink: 0 })
    )
  ),
  testCase(
    'sticky/unscrolled-stays-in-flow',
    column(
      { height: 60, overflow: 'scroll', x: 'start' },
      leaf(20, 15, { flexShrink: 0 }),
      box({ position: 'sticky', top: 0, width: 20, height: 10, flexShrink: 0 }),
      leaf(20, 200, { flexShrink: 0 })
    )
  ),
  testCase(
    'sticky/leaves-with-its-parent',
    column(
      { height: 60, overflow: 'scroll', scrollY: 50, x: 'start' },
      column({ x: 'start', flexShrink: 0 }, box({ position: 'sticky', top: 0, width: 20, height: 10 }), leaf(20, 30)),
      leaf(20, 200, { flexShrink: 0 })
    )
  ),
  testCase(
    'sticky/bottom-holds-at-scrollport-bottom',
    column(
      { height: 60, overflow: 'scroll', x: 'start' },
      leaf(20, 200, { flexShrink: 0 }),
      box({ position: 'sticky', bottom: 0, width: 20, height: 10, flexShrink: 0 })
    )
  ),
  testCase(
    'sticky/left-in-horizontal-scroll',
    row(
      { width: 60, overflow: 'scroll', scrollX: 25, y: 'start' },
      box({ position: 'sticky', left: 0, width: 10, height: 20, flexShrink: 0 }),
      leaf(200, 20, { flexShrink: 0 })
    )
  ),

  // ---------------------------------------------------------------------------
  // Nesting
  // ---------------------------------------------------------------------------
  testCase('nested/row-in-column', column({}, row({}, leaf(40, 20), leaf(40, 20)), leaf(40, 30))),
  testCase('nested/column-in-row', row({}, column({}, leaf(40, 20), leaf(40, 20)), leaf(40, 30))),
  testCase(
    'nested/grow-both-axes',
    column({}, row({ flexGrow: 1 }, leaf(40, 20), box({ height: 20, flexGrow: 1 })), leaf(40, 30))
  ),
  testCase(
    'nested/stretched-column-with-growing-child',
    row(
      { y: 'stretch' },
      column({ width: 60 }, leaf(40, 20), box({ width: 40, flexGrow: 1 })),
      box({ width: 40 }, leaf(10, 100))
    )
  ),
  testCase(
    'nested/inner-alignment-independent',
    column({ x: 'center' }, row({ x: 'end', width: 200 }, leaf(40, 20), leaf(40, 20)))
  ),
  testCase(
    'nested/four-levels',
    column(
      { padding: 4 },
      row(
        { padding: 4, gap: 4 },
        column({ padding: 4, gap: 4 }, row({ padding: 4 }, leaf(10, 10), leaf(10, 20)), leaf(30, 5)),
        leaf(20, 20)
      )
    )
  ),
  testCase(
    'nested/padding-and-gap-compose',
    column(
      { padding: 10, gap: 10 },
      row({ padding: 5, gap: 5 }, leaf(20, 20), leaf(20, 20)),
      row({ gap: 5 }, leaf(20, 20))
    )
  ),
  testCase(
    'nested/shrink-propagates-to-inner-row',
    column({}, row({ width: 100 }, row({}, leaf(80, 20), leaf(80, 20))))
  ),
  testCase(
    'nested/space-between-columns',
    row({ x: 'space-between' }, column({}, leaf(30, 10), leaf(30, 10)), column({ y: 'end', height: 100 }, leaf(30, 10)))
  ),
  testCase(
    'nested/center-both-axes',
    row(
      { x: 'center', y: 'center' },
      column({ x: 'center', y: 'center', width: 120, height: 80 }, leaf(30, 10), leaf(50, 10))
    )
  ),

  // ---------------------------------------------------------------------------
  // Grid (L6). A column around the grid keeps its height content-sized,
  // as it would be on a page; its width fills the 300px viewport.
  // ---------------------------------------------------------------------------
  testCase('grid/fixed-tracks', column({}, grid({ columns: [50, 100], rows: [20, 30] }, box(), box(), box(), box()))),
  testCase(
    'grid/gaps',
    column({}, grid({ columns: [50, 50], rows: [20, 20], gap: 10, rowGap: 4 }, box(), box(), box(), box()))
  ),
  testCase(
    'grid/fr-shares-free-space',
    column({}, grid({ columns: [100, frTrack(1), frTrack(3)] }, leaf(10, 20), leaf(10, 20), leaf(10, 20)))
  ),
  testCase(
    'grid/fr-keeps-min-content',
    column({}, grid({ width: 200, columns: [frTrack(1), frTrack(1)] }, text('aaaaaaaaaaaaaaaaaaaa'), leaf(10, 10)))
  ),
  testCase(
    'grid/auto-column-takes-widest',
    column(
      {},
      grid({ columns: [autoLength, frTrack(1)] }, text('Name'), leaf(10, 24), text('Email address'), leaf(10, 24))
    )
  ),
  testCase(
    'grid/percent-tracks',
    column({}, grid({ width: 200, columns: [pct(25), pct(50)], rows: [20] }, box(), box()))
  ),
  testCase(
    'grid/minmax-maximises-before-fr',
    column(
      {},
      grid({ columns: [pct(25), minmaxTrack(50, 80), frTrack(1), frTrack(3)], rows: [30] }, box(), box(), box(), box())
    )
  ),
  testCase(
    'grid/minmax-auto-max',
    column(
      {},
      grid(
        { columns: [minmaxTrack(20, autoLength), 40], rows: [20], justifyContent: 'start' },
        text('abcdefghij'),
        box()
      )
    )
  ),
  testCase(
    'grid/implicit-rows',
    column({}, grid({ columns: [50, 50], autoRows: 30 }, box(), box(), box(), box(), box()))
  ),
  testCase(
    'grid/auto-flow-column',
    column(
      {},
      grid(
        { rows: [20, 20], autoColumns: 40, autoFlow: 'column', justifyContent: 'start' },
        box(),
        box(),
        box(),
        box(),
        box()
      )
    )
  ),
  testCase(
    'grid/explicit-placement-and-span',
    column(
      {},
      grid(
        { columns: [50, 50, 50], rows: [20, 20], justifyContent: 'start' },
        box({ column: 1, row: 1, columnSpan: 2 }),
        box(),
        box(),
        box()
      )
    )
  ),
  testCase(
    'grid/row-span',
    column(
      {},
      grid(
        { columns: [50, 50], rows: [20, 20, 20], justifyContent: 'start' },
        box({ column: 1, row: 1, rowSpan: 2 }),
        box(),
        box(),
        box(),
        box()
      )
    )
  ),
  testCase(
    'grid/locked-row',
    column(
      {},
      grid({ columns: [50, 50], rows: [20, 20], justifyContent: 'start' }, box({ row: 2 }), box(), box(), box())
    )
  ),
  testCase(
    'grid/span-wraps-to-next-row',
    column({}, grid({ columns: [50, 50], autoRows: 20, justifyContent: 'start' }, box(), box({ columnSpan: 2 }), box()))
  ),
  testCase(
    'grid/items-align-in-cells',
    column(
      {},
      grid(
        { width: 200, height: 100, columns: [50, 50], rows: [40], x: 'center', y: 'end', alignContent: 'start' },
        leaf(20, 10),
        leaf(20, 10, { selfX: 'start', selfY: 'start' }),
        leaf(20, 10, { selfX: 'end', selfY: 'center' })
      )
    )
  ),
  testCase(
    'grid/distribute-space-between-and-end',
    column(
      {},
      grid(
        {
          width: 200,
          height: 100,
          columns: [50, 50],
          rows: [40],
          justifyContent: 'space-between',
          alignContent: 'end'
        },
        box(),
        box()
      )
    )
  ),
  testCase(
    'grid/distribute-center',
    column(
      {},
      grid(
        { width: 200, height: 100, columns: [50, 50], rows: [40], justifyContent: 'center', alignContent: 'center' },
        box(),
        box()
      )
    )
  ),
  testCase(
    'grid/stretch-auto-tracks',
    column({}, grid({ columns: [autoLength, autoLength], rows: [20] }, leaf(10, 10), leaf(30, 10)))
  ),
  testCase(
    'grid/margins-and-padding',
    column({}, grid({ columns: [100], rows: [50], padding: 5 }, box({ margin: 4 })))
  ),
  testCase(
    'grid/shrink-wraps-in-a-row',
    row({ x: 'start', y: 'start' }, grid({ columns: [autoLength, frTrack(1)], gap: 6 }, text('label'), leaf(40, 10)))
  ),
  testCase(
    'grid/fills-definite-height',
    grid(
      { columns: [50, frTrack(1)], rows: [autoLength, autoLength] },
      leaf(10, 10),
      leaf(10, 10),
      leaf(10, 20),
      leaf(10, 10)
    )
  ),
  ahem(
    'grid/text-wraps-at-its-column',
    column({}, grid({ columns: [60, 60], justifyContent: 'start' }, paragraph('aaaa bbbb cccc dddd'), box()))
  ),
  ahem(
    'grid/settings-page',
    column(
      {},
      grid(
        { columns: [autoLength, frTrack(1)], gap: 8, y: 'center' },
        paragraph('Name'),
        leaf(10, 24),
        paragraph('Email address'),
        leaf(10, 24),
        paragraph('Notifications'),
        leaf(10, 40)
      )
    )
  ),
  ahem(
    'grid/table-header-and-body',
    column(
      {},
      grid(
        { columns: [autoLength, frTrack(1), autoLength], gap: 4 },
        paragraph('Id'),
        paragraph('Name'),
        paragraph('Status'),
        paragraph('1234'),
        paragraph('A long name that wraps inside its cell'),
        paragraph('ok'),
        paragraph('5'),
        paragraph('B'),
        paragraph('failed')
      )
    )
  )
];

/**
 * A stable fingerprint of a case's inputs, so the spec can tell when
 * `expected.json` was generated from a different definition.
 */
export function caseFingerprint(layoutCase: LayoutCase): string {
  const source = JSON.stringify({ viewport: layoutCase.viewport, root: layoutCase.root });
  // FNV-1a, 32-bit: good enough to catch an edited case, no crypto dependency.
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
