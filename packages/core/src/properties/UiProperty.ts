import { DirtyFlags } from '../graph/DirtyFlags';
import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import { defineProperty, type UiPropertyDefinition } from './UiPropertyDefinition';
import type { UiEnvironmentKey } from '../environment/UiEnvironmentKey';
import { UiBasicColors, colorValuesEqual } from './UiColor';
import type { UiBorderRadius } from './UiBorderRadius';
import { UiBorderRadiuses, borderRadiusEqual, normalizeBorderRadius } from './UiBorderRadius';
import type { UiBoxShadow } from './UiBoxShadow';
import { boxShadowArraysEqual } from './UiBoxShadow';
import type { UiTransform } from './UiTransform';
import { transform, transformsEqual } from './UiTransform';
import type { UiTextStyle } from './UiTextStyle';
import { defaultTextStyle } from './UiTextStyle';
import type { UiVisualStateSet } from './UiVisualState';
import type { UiLength, UiTrackSize } from '../layout/UiLength';
import type { UiNode } from '../graph/UiNode';
import type { UiTheme } from '../environment/UiTheme';
import type { UiImage } from './UiImage';
import type { UiVideoSurface } from './UiVideo';
import type { UiVirtualWindow } from '../composition/UiVirtualWindow';
import type { EditableTextModel } from '../editing/EditableTextModel';
import type {
  UiAlignment,
  UiColorValue,
  UiContentDistribution,
  UiCursor,
  UiDirection,
  UiFlexWrap,
  UiFontWeight,
  UiGridAutoFlow,
  UiObjectFit,
  UiOverflow,
  UiPlacement,
  UiPointerEvents,
  UiPosition,
  UiSelfAlignment,
  UiSubgridAxis,
  UiTextAlign,
  UiTextDirection,
  UiTextOverflowValue,
  UiTextWrapValue,
  UiVerticalAlign
} from './UiPropertyValues';
import { validateSubgrid } from './UiPropertyValues';
import { defaultVisualState, visualStatesEqual } from './UiVisualState';
import type { UiRole, UiSemanticStates } from './UiSemantics';
import { statesEqual, validateRole, validateStates } from './UiSemantics';

const L = DirtyFlags.Layout;
const P = DirtyFlags.Paint;
const C = DirtyFlags.Content;
const T = DirtyFlags.Transform;
const E = DirtyFlags.Environment;
const S = DirtyFlags.Semantics;

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
  flexWrap: defineProperty<UiFlexWrap | undefined>({
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
  alignContent: defineProperty<UiContentDistribution | undefined>({
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

  /**
   * A grid item that is itself a Grid takes its column tracks from the
   * span it occupies in its parent, instead of declaring its own — so a
   * table's rows line up with its header without either knowing the
   * widths. Only the column axis: a virtualized table's parent cannot
   * see the rows that are not mounted, so its row tracks are not
   * something a row could share.
   */
  subgrid: defineProperty<UiSubgridAxis | undefined>({
    name: 'subgrid',
    defaultValue: undefined,
    inherited: false,
    affects: L,
    validate: validateSubgrid
  }),

  /** 'row' (default) fills rows left to right; 'column' fills columns top to bottom. */
  autoFlow: defineProperty<UiGridAutoFlow | undefined>({
    name: 'autoFlow',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /** Distribution of a grid's columns across spare width: 'stretch' (default), 'start', 'center', 'end', 'space-*'. */
  justifyContent: defineProperty<UiContentDistribution | undefined>({
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
  x: defineProperty<UiAlignment | undefined>({
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
  y: defineProperty<UiAlignment | undefined>({
    name: 'y',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * Per-child override for x-axis alignment.
   */
  selfX: defineProperty<UiSelfAlignment | undefined>({
    name: 'selfX',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * Per-child override for y-axis alignment.
   */
  selfY: defineProperty<UiSelfAlignment | undefined>({
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
  position: defineProperty<UiPosition | undefined>({
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
   *
   * Layout rather than Paint, which it was until a bound zIndex was
   * found to change nothing. The order is not decided at paint time:
   * `LayoutEngine.updatePaintOrder` sorts a parent's children into
   * `LayoutRecord.paintOrder` during layout, from the same record
   * field `position` writes — so a zIndex that only marked Paint was
   * read back from a record nothing had recomputed, and took effect
   * only if something else happened to relayout. Its partner in that
   * sort key, `position`, has always been Layout.
   */
  zIndex: defineProperty<number | undefined>({
    name: 'zIndex',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * The UiNode an absolutely positioned node is placed next to. With
   * an anchor, top/right/bottom/left are ignored and `placement`
   * decides the side; the node flips to the opposite side when it
   * would overflow its containing block and shifts along the anchor
   * to stay inside it.
   */
  anchor: defineProperty<UiNode | null | undefined>({
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
  placement: defineProperty<UiPlacement | undefined>({
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
  direction: defineProperty<UiDirection | undefined>({
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
  overflow: defineProperty<UiOverflow | undefined>({
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

  backgroundColor: defineProperty<UiColorValue | undefined>({
    name: 'backgroundColor',
    defaultValue: undefined,
    inherited: false,
    affects: P,
    compare: colorValuesEqual
  }),

  color: defineProperty<UiColorValue>({
    name: 'color',
    defaultValue: UiBasicColors.black,
    inherited: true,
    affects: P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => {
      const textStyle = value as UiTextStyle;
      return textStyle.color;
    },
    compare: colorValuesEqual
  }),

  borderColor: defineProperty<UiColorValue | undefined>({
    name: 'borderColor',
    defaultValue: undefined,
    inherited: false,
    affects: P,
    compare: colorValuesEqual
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

  fontWeight: defineProperty<UiFontWeight>({
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

  textAlign: defineProperty<UiTextAlign>({
    name: 'textAlign',
    defaultValue: defaultTextStyle.textAlign,
    inherited: true,
    affects: P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).textAlign
  }),

  textDirection: defineProperty<UiTextDirection>({
    name: 'textDirection',
    defaultValue: defaultTextStyle.textDirection,
    inherited: true,
    affects: P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).textDirection
  }),

  verticalAlign: defineProperty<UiVerticalAlign | undefined>({
    name: 'verticalAlign',
    defaultValue: undefined,
    inherited: false,
    affects: P
  }),

  /**
   * How text breaks into lines: 'word' (default), 'char', or 'none'.
   */
  textWrap: defineProperty<UiTextWrapValue | undefined>({
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
  textOverflow: defineProperty<UiTextOverflowValue | undefined>({
    name: 'textOverflow',
    defaultValue: undefined,
    inherited: false,
    affects: L | P
  }),

  // -------------------------------------------------------------------------
  // Editing (EditableText)
  // -------------------------------------------------------------------------

  /**
   * The text of an editable node. Writing it replaces what the user
   * typed; the runtime reports edits through `onInput`, and an app that
   * writes the reported value back gets a controlled field.
   */
  value: defineProperty<string | undefined>({
    name: 'value',
    defaultValue: undefined,
    inherited: false,
    // Semantics too: an editable's value is what a screen reader reads
    // it as, so the semantics tree has to follow the text.
    affects: C | L | S
  }),

  /** Shown, muted, while an editable is empty. */
  placeholder: defineProperty<string | undefined>({
    name: 'placeholder',
    defaultValue: undefined,
    inherited: false,
    affects: L | P
  }),

  /** Enter inserts a newline (default false: Enter is left to the app). */
  multiline: defineProperty<boolean | undefined>({
    name: 'multiline',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  /** The text can be selected and copied but not changed. */
  readOnly: defineProperty<boolean | undefined>({
    name: 'readOnly',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  /** Colour of the caret; defaults to the text colour. */
  caretColor: defineProperty<UiColorValue | undefined>({
    name: 'caretColor',
    defaultValue: undefined,
    inherited: false,
    affects: P,
    compare: colorValuesEqual
  }),

  /** Colour behind selected text; defaults to a translucent theme primary. */
  selectionColor: defineProperty<UiColorValue | undefined>({
    name: 'selectionColor',
    defaultValue: undefined,
    inherited: false,
    affects: P,
    compare: colorValuesEqual
  }),

  /** Colour behind text a find query matched; defaults to a translucent theme secondary. */
  matchColor: defineProperty<UiColorValue | undefined>({
    name: 'matchColor',
    defaultValue: undefined,
    inherited: false,
    affects: P,
    compare: colorValuesEqual
  }),

  /** Colour of the placeholder; defaults to the theme's muted text. */
  placeholderColor: defineProperty<UiColorValue | undefined>({
    name: 'placeholderColor',
    defaultValue: undefined,
    inherited: false,
    affects: P,
    compare: colorValuesEqual
  }),

  /** Set by the runtime on each editable node: its EditableTextModel. */
  editor: defineProperty<EditableTextModel | undefined>({
    name: 'editor',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  /**
   * CSS cursor shown while the pointer is over this node or a
   * descendant that sets none. Resolved by the runtime on hover and
   * applied to the canvas by the shell.
   */
  cursor: defineProperty<UiCursor | undefined>({
    name: 'cursor',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  /**
   * Whether the user may select this subtree's text with the pointer.
   * Read up the ancestor chain like CSS `user-select`, so setting it
   * once on a container covers everything inside; a Button opts its
   * label out by default.
   */
  selectable: defineProperty<boolean | undefined>({
    name: 'selectable',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  pointerEvents: defineProperty<UiPointerEvents | undefined>({
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
    // Inert-ness is a semantic fact as well as an input one: a
    // disabled control is announced as unavailable, not hidden.
    affects: DirtyFlags.Properties | S
  }),

  // -------------------------------------------------------------------------
  // Semantics
  //
  // What the node means. Read by the semantics phase, diffed per frame
  // and (F6b) mirrored into an off-screen DOM. See UiSemantics.ts.
  // -------------------------------------------------------------------------

  /** What this node is, in ARIA's vocabulary. Closed: a typo throws. */
  role: defineProperty<UiRole | undefined>({
    name: 'role',
    defaultValue: undefined,
    inherited: false,
    affects: S,
    validate: validateRole
  }),

  /** The node's accessible name. Without one it is named by its text. */
  label: defineProperty<string | undefined>({
    name: 'label',
    defaultValue: undefined,
    inherited: false,
    affects: S
  }),

  /** Supplementary text read after the name: a hint, an error. */
  description: defineProperty<string | undefined>({
    name: 'description',
    defaultValue: undefined,
    inherited: false,
    affects: S
  }),

  /** Conditions beyond role and value: checked, expanded, invalid, … */
  states: defineProperty<UiSemanticStates | undefined>({
    name: 'states',
    defaultValue: undefined,
    inherited: false,
    affects: S,
    compare: statesEqual,
    validate: validateStates
  }),

  /** A range control's current position; with valueMin and valueMax. */
  valueNow: defineProperty<number | undefined>({
    name: 'valueNow',
    defaultValue: undefined,
    inherited: false,
    affects: S
  }),

  valueMin: defineProperty<number | undefined>({
    name: 'valueMin',
    defaultValue: undefined,
    inherited: false,
    affects: S
  }),

  valueMax: defineProperty<number | undefined>({
    name: 'valueMax',
    defaultValue: undefined,
    inherited: false,
    affects: S
  }),

  /** How the value should be spoken, when the number is not it ("40%"). */
  valueText: defineProperty<string | undefined>({
    name: 'valueText',
    defaultValue: undefined,
    inherited: false,
    affects: S
  }),

  /** 1-based position in a set, for a virtualized list's rows. */
  posInSet: defineProperty<number | undefined>({
    name: 'posInSet',
    defaultValue: undefined,
    inherited: false,
    affects: S
  }),

  /** How many items the set holds, including the ones not mounted. */
  setSize: defineProperty<number | undefined>({
    name: 'setSize',
    defaultValue: undefined,
    inherited: false,
    affects: S
  }),

  /**
   * How deep a treeitem sits, 1 for a root. A tree is rendered as a
   * flat list of rows — it must be, to be virtualized — so the nesting
   * exists nowhere else for a reader to find.
   */
  level: defineProperty<number | undefined>({
    name: 'level',
    defaultValue: undefined,
    inherited: false,
    affects: S
  }),

  // -------------------------------------------------------------------------
  // Transform
  // -------------------------------------------------------------------------

  /** Any subset of x, y, scaleX, scaleY, rotation; the rest is identity. */
  transform: defineProperty<Partial<UiTransform> | undefined>({
    name: 'transform',
    defaultValue: undefined,
    inherited: false,
    affects: P | T,
    compare: (a, b) => {
      if (a === undefined && b === undefined) return true;
      if (a === undefined || b === undefined) return false;
      return transformsEqual(transform(a), transform(b));
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

  image: defineProperty<UiImage | undefined>({
    name: 'image',
    defaultValue: undefined,
    inherited: false,
    affects: P
  }),

  /**
   * A moving picture, drawn where `image` is and under the same
   * `objectFit` and rounded clip.
   *
   * Paint only, like `image`: a video's box comes from the element, so
   * a new frame arriving never moves anything. See `UiVideo.ts` for
   * why the value is a surface with a version rather than a frame.
   */
  video: defineProperty<UiVideoSurface | undefined>({
    name: 'video',
    defaultValue: undefined,
    inherited: false,
    affects: P
  }),

  objectFit: defineProperty<UiObjectFit | undefined>({
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

  /**
   * Whether a wheel moves this container at once or animates it.
   *
   * `'instant'` opts out of the smoothing a notched wheel gets by
   * default. Only the wheel consults it — a scrollbar thumb drag, a
   * focus reveal and a caret reveal are always instant, because each
   * of them is already tracking something the person is doing.
   *
   * It affects nothing that is laid out or painted; it is a policy the
   * input layer reads, and it is registered rather than read loosely
   * so that a misspelling is an error instead of silence.
   */
  scrollBehavior: defineProperty<'instant' | 'smooth' | undefined>({
    name: 'scrollBehavior',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.None
  }),

  scrollY: defineProperty<number | undefined>({
    name: 'scrollY',
    defaultValue: undefined,
    inherited: false,
    affects: T
  }),

  // -------------------------------------------------------------------------
  // Interaction and internal markers
  // -------------------------------------------------------------------------

  /** False skips the node itself in hit testing; its children still hit. */
  hitTestable: defineProperty<boolean | undefined>({
    name: 'hitTestable',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  /** Set by LazyColumn/LazyRow on each mounted item wrapper: its index. */
  virtualIndex: defineProperty<number | undefined>({
    name: 'virtualIndex',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  /** Set by LazyGrid on its header: the content above the first row. */
  virtualLead: defineProperty<boolean | undefined>({
    name: 'virtualLead',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  /** Set by LazyColumn/LazyRow on the scroll container: its UiVirtualWindow. */
  virtualWindow: defineProperty<UiVirtualWindow | undefined>({
    name: 'virtualWindow',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  // -------------------------------------------------------------------------
  // Environment provider properties
  // -------------------------------------------------------------------------

  theme: defineProperty<UiTheme | undefined>({
    name: 'theme',
    defaultValue: undefined,
    inherited: false,
    affects: E
  }),

  textStyle: defineProperty<UiTextStyle | undefined>({
    name: 'textStyle',
    defaultValue: undefined,
    inherited: false,
    affects: E
  }),

  contentColor: defineProperty<UiColorValue | undefined>({
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

/** The value type a property definition was declared with. */
export type UiPropertyValueOf<D> = D extends UiPropertyDefinition<infer T> ? T : never;

/**
 * Property name → value type, derived from the registry so that the
 * authoring types (`TextProps`, `RowProps`, …) can never disagree with
 * what the runtime reads.
 */
export type UiPropertyValues = {
  readonly [K in UiPropertyName]: UiPropertyValueOf<(typeof UiProperties)[K]>;
};
