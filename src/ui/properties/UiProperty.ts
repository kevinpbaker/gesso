import { DirtyFlags } from '../graph/DirtyFlags';
import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import { defineProperty } from './UiPropertyDefinition';
import type { UiEnvironmentKey } from '../environment/UiEnvironmentKey';
import type { UiColor } from './UiColor';
import { UiColors, colorsEqual, normalizeColor } from './UiColor';
import type { UiBorderRadius } from './UiBorderRadius';
import { UiBorderRadiuses, borderRadiusEqual, normalizeBorderRadius } from './UiBorderRadius';
import type { UiBoxShadow } from './UiBoxShadow';
import { boxShadowArraysEqual } from './UiBoxShadow';
import type { UiTransform } from './UiTransform';
import { transformsEqual } from './UiTransform';
import type { UiTextStyle } from './UiTextStyle';
import { defaultTextStyle } from './UiTextStyle';
import type { UiVisualStateSet } from './UiVisualState';
import type { UiLength, UiTrackSize } from '../layout/UiLength';
import { defaultVisualState, visualStatesEqual } from './UiVisualState';

const L = DirtyFlags.Layout;
const P = DirtyFlags.Paint;
const C = DirtyFlags.Content;
const T = DirtyFlags.Transform;
const E = DirtyFlags.Environment;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const UiProperties = {
  width: defineProperty<UiLength | undefined>({
    name: 'width',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  height: defineProperty<UiLength | undefined>({
    name: 'height',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  minWidth: defineProperty<UiLength | undefined>({
    name: 'minWidth',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  maxWidth: defineProperty<UiLength | undefined>({
    name: 'maxWidth',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  minHeight: defineProperty<UiLength | undefined>({
    name: 'minHeight',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  maxHeight: defineProperty<UiLength | undefined>({
    name: 'maxHeight',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  padding: defineProperty<number | undefined>({
    name: 'padding',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  paddingTop: defineProperty<number | undefined>({
    name: 'paddingTop',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  paddingRight: defineProperty<number | undefined>({
    name: 'paddingRight',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  paddingBottom: defineProperty<number | undefined>({
    name: 'paddingBottom',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  paddingLeft: defineProperty<number | undefined>({
    name: 'paddingLeft',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  margin: defineProperty<UiLength | undefined>({
    name: 'margin',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  marginTop: defineProperty<UiLength | undefined>({
    name: 'marginTop',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  marginRight: defineProperty<UiLength | undefined>({
    name: 'marginRight',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  marginBottom: defineProperty<UiLength | undefined>({
    name: 'marginBottom',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  marginLeft: defineProperty<UiLength | undefined>({
    name: 'marginLeft',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  gap: defineProperty<number | undefined>({
    name: 'gap',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** Gap between rows (lines of a wrapping row, items of a column). */
  rowGap: defineProperty<number | undefined>({
    name: 'rowGap',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** Gap between columns (items of a row, lines of a wrapping column). */
  columnGap: defineProperty<number | undefined>({
    name: 'columnGap',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** `flex: n` — grow n, shrink 1, basis 0, as in CSS. */
  flex: defineProperty<number | undefined>({
    name: 'flex',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** 'nowrap' (default), 'wrap' or 'wrap-reverse'. */
  flexWrap: defineProperty<string | undefined>({
    name: 'flexWrap',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * How a wrapping container distributes its lines along the cross
   * axis: 'stretch' (default), 'start', 'center', 'end',
   * 'space-between', 'space-around', 'space-evenly'.
   */
  alignContent: defineProperty<string | undefined>({
    name: 'alignContent',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  // -------------------------------------------------------------------------
  // Grid
  // -------------------------------------------------------------------------

  /** Explicit column tracks: numbers, percent(), auto, fr(), minmax(). */
  columns: defineProperty<readonly UiTrackSize[] | undefined>({
    name: 'columns',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** Explicit row tracks. Rows beyond them are implicit, sized by autoRows. */
  rows: defineProperty<readonly UiTrackSize[] | undefined>({
    name: 'rows',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** Size of implicit columns (default auto). */
  autoColumns: defineProperty<UiTrackSize | undefined>({
    name: 'autoColumns',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** Size of implicit rows (default auto). */
  autoRows: defineProperty<UiTrackSize | undefined>({
    name: 'autoRows',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** 'row' (default) fills rows left to right; 'column' fills columns top to bottom. */
  autoFlow: defineProperty<string | undefined>({
    name: 'autoFlow',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** Distribution of a grid's columns across spare width: 'stretch' (default), 'start', 'center', 'end', 'space-*'. */
  justifyContent: defineProperty<string | undefined>({
    name: 'justifyContent',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** 1-based column line a grid item starts at. */
  column: defineProperty<number | undefined>({
    name: 'column',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** Columns a grid item spans (default 1). */
  columnSpan: defineProperty<number | undefined>({
    name: 'columnSpan',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** 1-based row line a grid item starts at. */
  row: defineProperty<number | undefined>({
    name: 'row',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** Rows a grid item spans (default 1). */
  rowSpan: defineProperty<number | undefined>({
    name: 'rowSpan',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** Width divided by height; the decided axis drives the other. */
  aspectRatio: defineProperty<number | undefined>({
    name: 'aspectRatio',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  flexGrow: defineProperty<number | undefined>({
    name: 'flexGrow',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  flexShrink: defineProperty<number | undefined>({
    name: 'flexShrink',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  flexBasis: defineProperty<UiLength | undefined>({
    name: 'flexBasis',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * Alignment of children along the x-axis.
   *
   * For a row this is the main axis; for a column this is the cross
   * axis. The value is axis-relative and does not flip meaning when
   * the flex direction changes.
   */
  x: defineProperty<string | undefined>({
    name: 'x',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * Alignment of children along the y-axis.
   *
   * For a column this is the main axis; for a row this is the cross
   * axis. The value is axis-relative and does not flip meaning when
   * the flex direction changes.
   */
  y: defineProperty<string | undefined>({
    name: 'y',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * Per-child override for x-axis alignment.
   */
  selfX: defineProperty<string | undefined>({
    name: 'selfX',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * Per-child override for y-axis alignment.
   */
  selfY: defineProperty<string | undefined>({
    name: 'selfY',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * 'static' (default), 'relative' (in flow, then offset by
   * top/right/bottom/left, and a containing block for absolute
   * descendants), 'absolute' (out of flow, positioned against the
   * nearest positioned ancestor or the layout root) or 'sticky' (in
   * flow, but held at the edge of its scroll container by
   * top/right/bottom/left while the container scrolls, until its
   * parent's box ends).
   */
  position: defineProperty<string | undefined>({
    name: 'position',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  top: defineProperty<UiLength | undefined>({
    name: 'top',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  right: defineProperty<UiLength | undefined>({
    name: 'right',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  bottom: defineProperty<UiLength | undefined>({
    name: 'bottom',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  left: defineProperty<UiLength | undefined>({
    name: 'left',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * Paint and hit-test order among siblings; higher paints later and
   * is hit first. Ties keep tree order.
   */
  zIndex: defineProperty<number | undefined>({
    name: 'zIndex',
    defaultValue: undefined,
    inherited: false,
    affects: P
  }),

  /**
   * The UiNode an absolutely positioned node is placed next to. With
   * an anchor, top/right/bottom/left are ignored and `placement`
   * decides the side; the node flips to the opposite side when it
   * would overflow its containing block and shifts along the anchor
   * to stay inside it.
   */
  anchor: defineProperty<unknown | undefined>({
    name: 'anchor',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * Side and alignment against the anchor: 'bottom' (default),
   * 'bottom-start', 'bottom-end', 'top', 'top-start', 'top-end',
   * 'left', 'left-start', 'left-end', 'right', 'right-start',
   * 'right-end'.
   */
  placement: defineProperty<string | undefined>({
    name: 'placement',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** Gap between an anchored node and its anchor. */
  anchorOffset: defineProperty<number | undefined>({
    name: 'anchorOffset',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * Layout direction for flex and scroll containers.
   */
  direction: defineProperty<string | undefined>({
    name: 'direction',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * 'visible' (default): children may paint outside the box. 'hidden'
   * clips them to it (following borderRadius in Canvas2D). 'scroll' and
   * 'auto' clip and make the box a scroll container: scrollX/scrollY
   * apply, overlay scrollbars show while scrolling, and sticky
   * descendants stick to its edges.
   */
  overflow: defineProperty<string | undefined>({
    name: 'overflow',
    defaultValue: undefined,
    inherited: false,
    affects: L | P
  }),

  inset: defineProperty<UiLength | undefined>({
    name: 'inset',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  // -------------------------------------------------------------------------
  // Paint
  // -------------------------------------------------------------------------

  backgroundColor: defineProperty<UiColor | string | undefined>({
    name: 'backgroundColor',
    defaultValue: undefined,
    inherited: false,
    affects: P,
    compare: (a, b) => {
      const normalizedA = normalizeColor(a);
      const normalizedB = normalizeColor(b);
      if (normalizedA === undefined && normalizedB === undefined) return true;
      if (normalizedA === undefined || normalizedB === undefined) return false;
      return colorsEqual(normalizedA, normalizedB);
    }
  }),

  color: defineProperty<UiColor | string>({
    name: 'color',
    defaultValue: UiColors.black,
    inherited: true,
    affects: P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => {
      const textStyle = value as UiTextStyle;
      return textStyle.color;
    },
    compare: (a, b) => {
      const normalizedA = normalizeColor(a) ?? UiColors.black;
      const normalizedB = normalizeColor(b) ?? UiColors.black;
      return colorsEqual(normalizedA, normalizedB);
    }
  }),

  borderColor: defineProperty<UiColor | string | undefined>({
    name: 'borderColor',
    defaultValue: undefined,
    inherited: false,
    affects: P,
    compare: (a, b) => {
      const normalizedA = normalizeColor(a);
      const normalizedB = normalizeColor(b);
      if (normalizedA === undefined && normalizedB === undefined) return true;
      if (normalizedA === undefined || normalizedB === undefined) return false;
      return colorsEqual(normalizedA, normalizedB);
    }
  }),

  borderWidth: defineProperty<number | undefined>({
    name: 'borderWidth',
    defaultValue: undefined,
    inherited: false,
    affects: P
  }),

  borderRadius: defineProperty<UiBorderRadius | number>({
    name: 'borderRadius',
    defaultValue: UiBorderRadiuses.none,
    inherited: false,
    affects: P,
    compare: (a, b) => borderRadiusEqual(normalizeBorderRadius(a), normalizeBorderRadius(b))
  }),

  opacity: defineProperty<number>({
    name: 'opacity',
    defaultValue: 1,
    inherited: false,
    affects: P
  }),

  boxShadows: defineProperty<readonly UiBoxShadow[]>({
    name: 'boxShadows',
    defaultValue: [],
    inherited: false,
    affects: P,
    compare: boxShadowArraysEqual
  }),

  visible: defineProperty<boolean>({
    name: 'visible',
    defaultValue: true,
    inherited: false,
    affects: P
  }),

  // -------------------------------------------------------------------------
  // Typography
  // -------------------------------------------------------------------------

  fontFamily: defineProperty<string>({
    name: 'fontFamily',
    defaultValue: defaultTextStyle.fontFamily,
    inherited: true,
    affects: L | P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).fontFamily
  }),

  fontSize: defineProperty<number>({
    name: 'fontSize',
    defaultValue: defaultTextStyle.fontSize,
    inherited: true,
    affects: L | P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).fontSize
  }),

  fontWeight: defineProperty<number | string>({
    name: 'fontWeight',
    defaultValue: defaultTextStyle.fontWeight,
    inherited: true,
    affects: L | P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).fontWeight
  }),

  lineHeight: defineProperty<number>({
    name: 'lineHeight',
    defaultValue: defaultTextStyle.lineHeight,
    inherited: true,
    affects: L | P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).lineHeight
  }),

  letterSpacing: defineProperty<number>({
    name: 'letterSpacing',
    defaultValue: defaultTextStyle.letterSpacing,
    inherited: true,
    affects: L | P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).letterSpacing
  }),

  textAlign: defineProperty<'left' | 'center' | 'right'>({
    name: 'textAlign',
    defaultValue: defaultTextStyle.textAlign,
    inherited: true,
    affects: P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).textAlign
  }),

  textDirection: defineProperty<'ltr' | 'rtl'>({
    name: 'textDirection',
    defaultValue: defaultTextStyle.textDirection,
    inherited: true,
    affects: P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).textDirection
  }),

  verticalAlign: defineProperty<string | undefined>({
    name: 'verticalAlign',
    defaultValue: undefined,
    inherited: false,
    affects: P
  }),

  /**
   * How text breaks into lines: 'word' (default), 'char', or 'none'.
   */
  textWrap: defineProperty<string | undefined>({
    name: 'textWrap',
    defaultValue: undefined,
    inherited: false,
    affects: L | P
  }),

  /**
   * Maximum number of lines a text node keeps.
   */
  maxLines: defineProperty<number | undefined>({
    name: 'maxLines',
    defaultValue: undefined,
    inherited: false,
    affects: L | P
  }),

  /**
   * What happens to a line that does not fit: 'clip' (default) or
   * 'ellipsis'.
   */
  textOverflow: defineProperty<string | undefined>({
    name: 'textOverflow',
    defaultValue: undefined,
    inherited: false,
    affects: L | P
  }),

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  cursor: defineProperty<string | undefined>({
    name: 'cursor',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  pointerEvents: defineProperty<string | undefined>({
    name: 'pointerEvents',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  focusable: defineProperty<boolean | undefined>({
    name: 'focusable',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  disabled: defineProperty<boolean | undefined>({
    name: 'disabled',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  // -------------------------------------------------------------------------
  // Transform
  // -------------------------------------------------------------------------

  transform: defineProperty<UiTransform | undefined>({
    name: 'transform',
    defaultValue: undefined,
    inherited: false,
    affects: P | T,
    compare: (a, b) => {
      if (a === undefined && b === undefined) return true;
      if (a === undefined || b === undefined) return false;
      return transformsEqual(a, b);
    }
  }),

  // -------------------------------------------------------------------------
  // Content
  // -------------------------------------------------------------------------

  text: defineProperty<string | undefined>({
    name: 'text',
    defaultValue: undefined,
    inherited: false,
    affects: C | L
  }),

  image: defineProperty<unknown | undefined>({
    name: 'image',
    defaultValue: undefined,
    inherited: false,
    affects: P
  }),

  objectFit: defineProperty<string | undefined>({
    name: 'objectFit',
    defaultValue: undefined,
    inherited: false,
    affects: P
  }),

  scrollX: defineProperty<number | undefined>({
    name: 'scrollX',
    defaultValue: undefined,
    inherited: false,
    affects: T
  }),

  scrollY: defineProperty<number | undefined>({
    name: 'scrollY',
    defaultValue: undefined,
    inherited: false,
    affects: T
  }),

  // -------------------------------------------------------------------------
  // Environment provider properties
  // -------------------------------------------------------------------------

  theme: defineProperty<unknown | undefined>({
    name: 'theme',
    defaultValue: undefined,
    inherited: false,
    affects: E
  }),

  textStyle: defineProperty<unknown | undefined>({
    name: 'textStyle',
    defaultValue: undefined,
    inherited: false,
    affects: E
  }),

  contentColor: defineProperty<unknown | undefined>({
    name: 'contentColor',
    defaultValue: undefined,
    inherited: false,
    affects: E
  }),

  // -------------------------------------------------------------------------
  // Visual state
  // -------------------------------------------------------------------------

  visualState: defineProperty<UiVisualStateSet>({
    name: 'visualState',
    defaultValue: defaultVisualState,
    inherited: false,
    affects: P,
    compare: visualStatesEqual
  })
} as const;

export type UiPropertyName = keyof typeof UiProperties;
