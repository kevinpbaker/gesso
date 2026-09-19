import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { TextOverflow, TextWrap } from '../layout/TextMeasurer';
import { resolveProperty, resolveNumber, resolveString, resolveBoolean } from '../properties/UiPropertyResolver';
import { UiProperties } from '../properties/UiProperty';
import type { UiColor } from '../properties/UiColor';
import { UiBasicColors, colorToHex, colorToRgba } from '../properties/UiColor';
import type { UiBorderRadius } from '../properties/UiBorderRadius';
import { resolveBorderRadiusValue } from '../properties/UiThemeShape';
import type { UiBoxShadow } from '../properties/UiBoxShadow';
import type { UiTransform } from '../properties/UiTransform';
import type { UiImage } from '../properties/UiImage';
import { isVideoSurface, type UiVideoSurface } from '../properties/UiVideo';
import { resolveColor, resolveColorValue, resolveGradient, themeColor } from '../properties/UiThemeColor';
import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import type { ResolvedGradient } from '../properties/UiGradient';
import type { EditableTextModel } from '../editing/EditableTextModel';
import { editorFor, isEditableNode } from '../editing/UiEditable';
import { selectionRangeOf, type TextRange } from '../selection/UiSelectable';
import { matchRangesOf } from '../find/UiTextMatches';
import { resolveFontInto } from '../properties/UiTextFont';
import type {
  UiFontKerning,
  UiFontStretch,
  UiFontStyle,
  UiFontVariant,
  UiTextDecoration,
  UiTextLink,
  UiTextMetrics,
  UiResolvedTextSpan
} from '../properties/UiTextStyle';
import { resolvedSpansOf, textContentOf } from '../properties/UiTextStyle';
import { linkHoverOf } from '../selection/UiTextLinks';
import { parseTransform } from '../properties/UiTransform';

export type { UiImage } from '../properties/UiImage';
export type { UiVideoSurface } from '../properties/UiVideo';

export type TextAlign = 'start' | 'end' | 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';
export type ObjectFit = 'fill' | 'cover' | 'contain' | 'none';

/**
 * Everything a node needs to paint, folded out of node properties.
 *
 * Resolved per frame into a reusable scratch (see resolvePaintState);
 * never stored on the node. `transform` is always allocated so the
 * resolution pass does not allocate; read it only when hasTransform
 * is true.
 */
export interface PaintState {
  visible: boolean;
  opacity: number;
  backgroundColor: UiColor | undefined;
  /**
   * A gradient filling the box, painted over `backgroundColor` and
   * under `image`, with its stops' palette names already resolved
   * against the node's theme. Its geometry is still relative: the
   * renderer places it once it has the node's box.
   */
  backgroundGradient: ResolvedGradient | undefined;
  image: UiImage | undefined;
  /**
   * A moving picture, drawn where `image` would be and under the same
   * `objectFit` and rounded clip.
   *
   * A slot of its own rather than a widened `image`, because the two
   * are cached differently: an image is its pixels and a video is a
   * surface whose pixels change. See `UiVideo.ts`.
   */
  video: UiVideoSurface | undefined;
  objectFit: ObjectFit;
  borderColor: UiColor | undefined;
  borderWidth: number;
  borderRadius: UiBorderRadius;
  boxShadows: readonly UiBoxShadow[];
  hasTransform: boolean;
  transform: UiTransform;
  text: string | undefined;
  /**
   * The paragraph's runs, with their colours resolved against the
   * node's theme; undefined for a paragraph in one style.
   *
   * `text` is the runs' text concatenated, so every other field of
   * this state, and every offset any other layer holds, means what it
   * always meant.
   */
  spans: readonly PaintTextSpan[] | undefined;
  /** Index into `spans` of the link the pointer is on, or -1. */
  linkHover: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  lineHeight: number;
  /** Extra space after each character, as CSS `letter-spacing`. */
  letterSpacing: number;
  fontStyle: UiFontStyle;
  fontStretch: UiFontStretch;
  fontVariant: UiFontVariant;
  fontKerning: UiFontKerning;
  /** Lines drawn with the whole paragraph; a run may override it. */
  textDecoration: UiTextDecoration;
  textColor: UiColor;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
  textWrap: TextWrap;
  maxLines: number | undefined;
  textOverflow: TextOverflow;
  /** Right-to-left paragraph direction. */
  rtl: boolean;
  /**
   * Set for an EditableText node: the model whose text `text` is, with
   * its selection and composition, and the colours the editing chrome
   * is drawn in. Undefined for every other node.
   */
  editor: EditableTextModel | undefined;
  /**
   * Set for a `Text` node the user has selected part of: the range of
   * `text`, in source offsets, drawn behind the glyphs in
   * `selectionColor`. Undefined for everything else, including
   * editables, whose selection lives in `editor`.
   */
  textSelection: TextRange | undefined;
  /**
   * Set for a `Text` node the current find query matched: the ranges of
   * `text` drawn in `matchColor`, under the selection, so the active
   * match reads as the strongest of them.
   */
  textMatches: readonly TextRange[] | undefined;
  placeholder: string | undefined;
  placeholderColor: UiColor;
  selectionColor: UiColor;
  matchColor: UiColor;
  caretColor: UiColor;
}

/** A run of a paragraph, ready to paint: metrics, resolved colours, and its link. */
export interface PaintTextSpan extends UiTextMetrics {
  readonly start: number;
  readonly end: number;
  readonly color?: UiColor;
  readonly backgroundColor?: UiColor;
  readonly textDecoration?: UiTextDecoration;
  readonly link?: UiTextLink;
}

export const DEFAULT_FONT_SIZE = 14;
export const DEFAULT_FONT_FAMILY = 'sans-serif';
export const DEFAULT_FONT_WEIGHT = 'normal';
export const DEFAULT_TEXT_COLOR = UiBasicColors.black;
export { DEFAULT_LINE_HEIGHT_FACTOR } from '../properties/UiTextFont';

export function normalizeTextAlign(value: unknown): TextAlign {
  switch (value) {
    case 'center':
    case 'right':
    case 'left':
    case 'end':
      return value;
    default:
      return 'start';
  }
}

export function normalizeTextWrap(value: unknown): TextWrap {
  if (value === 'none' || value === 'nowrap') {
    return 'none';
  }
  if (value === 'char') {
    return 'char';
  }
  return 'word';
}

export function normalizeTextOverflow(value: unknown): TextOverflow {
  return value === 'ellipsis' ? 'ellipsis' : 'clip';
}

export function normalizeVerticalAlign(value: unknown): VerticalAlign {
  if (value === 'middle' || value === 'center') {
    return 'middle';
  }
  if (value === 'bottom' || value === 'end') {
    return 'bottom';
  }
  return 'top';
}

/**
 * Folds a node's properties into the supplied paint state.
 *
 * Mutates `out` and returns it. The renderer owns one scratch and
 * calls this per node, so the tree stays structural and no paint
 * objects are allocated per frame.
 *
 * The text half is resolved only for a node that has text, because
 * most nodes in a real tree are boxes and the half is about ten
 * property resolutions they would never read. The condition is
 * `out.text`, which is set a few lines above by the branch that knows:
 * an editable takes it from its model, so it is a string (possibly
 * empty) for every editable and drives the caret and placeholder that
 * an empty field still paints; everything else takes it from
 * `resolveString`, which reports an empty string as absent, so a
 * `<text text="" />` and a `<box />` are the same node to paint and
 * were before this split too.
 *
 * What makes that safe is that nothing reads a text field without
 * first asking whether the node has text. Both renderer walks capture
 * a `hasText` from the resolved state and enter their foreground block
 * only if it is set; Canvas2D's `paintContent` tests `text` again
 * before it draws. Decorations, backgrounds, borders, images,
 * scrollbars and the lifted-node replay read only the geometry half.
 * The three controllers that resolve a state of their own reach a text
 * field only through `paragraphGeometry` or `EditableLayout`, and each
 * of them is already behind a guard that requires text: the selection
 * and find controllers only ever ask about a node `selectableTextOf`
 * returned a non-empty string for, and the editing controller only
 * about a node with an editor. `rtl` lives here rather than with the
 * geometry because paint's copy is the paragraph's base direction and
 * nothing else; the row reversal that reads the same declared property
 * asks the node directly, in `LayoutEngine`.
 *
 * The skipped fields are reset rather than left holding the previous
 * node's, so the scratch a box comes out of is exactly the one
 * `createPaintState` builds. That costs about a twentieth of what
 * resolving them costs and it is what makes the split safe by
 * construction: a reader added later that forgets the guard gets a
 * default font and a black, top-left, wrapping paragraph, not the
 * neighbouring label's.
 *
 * A new reader of any of these fields must therefore be reachable only
 * when `text` is set, or it must resolve what it needs from the node
 * itself. Widening the condition is the wrong repair: the fields exist
 * to describe a paragraph, and a node with no paragraph has no honest
 * answer for them.
 */
export function resolvePaintState(node: UiNode, out: PaintState): PaintState {
  out.visible = resolveBoolean(node, 'visible') ?? true;

  const opacity = resolveNumber(node, 'opacity');
  out.opacity = opacity === undefined ? 1 : Math.min(Math.max(opacity, 0), 1);

  out.backgroundColor = resolveColor(node, UiProperties.backgroundColor);
  out.backgroundGradient = resolveGradient(node, resolveProperty(node, UiProperties.backgroundGradient));
  out.borderColor = resolveColor(node, UiProperties.borderColor);
  out.borderWidth = resolveNumber(node, 'borderWidth') ?? 0;
  out.borderRadius = resolveBorderRadiusValue(node, resolveProperty(node, UiProperties.borderRadius));
  out.boxShadows = resolveProperty(node, UiProperties.boxShadows);
  out.image = parseImage(node.properties.get('image'));
  out.video = parseVideo(node.properties.get('video'));
  out.objectFit = parseObjectFit(node.properties.get('objectFit'));

  const rawTransform = node.properties.get('transform');
  const parsedTransform = rawTransform !== undefined ? parseTransform(rawTransform) : undefined;
  if (parsedTransform !== undefined) {
    out.hasTransform = true;
    out.transform = parsedTransform;
  } else {
    out.hasTransform = false;
  }

  if (isEditableNode(node)) {
    // The user's text lives in the model, not in a property; see
    // UiEditable. It is always a string here, so an empty field still
    // paints its caret and placeholder.
    const model = editorFor(node);
    out.editor = model;
    out.text = model.text;
    out.placeholder = resolveString(node, 'placeholder');
    out.placeholderColor =
      resolveColor(node, UiProperties.placeholderColor) ?? themeColor(node, 'textMuted') ?? DEFAULT_PLACEHOLDER_COLOR;
    out.selectionColor = resolveColor(node, UiProperties.selectionColor) ?? defaultSelectionColor(node);
    out.caretColor =
      resolveColor(node, UiProperties.caretColor) ?? resolveColor(node, UiProperties.color) ?? UiBasicColors.black;
    out.textSelection = undefined;
    out.textMatches = undefined;
  } else {
    out.editor = undefined;
    const spanned = resolvedSpansOf(node);
    if (spanned.length > 0) {
      out.text = textContentOf(node);
    } else {
      out.text = resolveString(node, 'text');
      if (out.text === undefined) {
        warnIfTextIsNotText(node);
      }
    }
    out.placeholder = undefined;
    // Only a selected paragraph pays for the colour: the scratch is
    // reused across nodes, so an unselected one must not resolve it and
    // must not read the last node's either.
    out.textSelection = out.text === undefined ? undefined : selectionRangeOf(node);
    if (out.textSelection !== undefined) {
      out.selectionColor = resolveColor(node, UiProperties.selectionColor) ?? defaultSelectionColor(node);
    }
    out.textMatches = out.text === undefined ? undefined : matchRangesOf(node);
    if (out.textMatches !== undefined) {
      out.matchColor = resolveColor(node, UiProperties.matchColor) ?? defaultMatchColor(node);
    }
  }

  if (out.text === undefined) {
    resetTextStyle(out);
    return out;
  }

  out.rtl = resolveProperty(node, UiProperties.textDirection) === 'rtl';

  // Resolved the same way layout measured it (see resolveFont), and
  // straight into the scratch: the state already has the fields under
  // those names, so paint has no record to allocate and copy.
  resolveFontInto(node, out);
  out.spans = out.editor === undefined ? resolvePaintSpans(node) : undefined;
  out.linkHover = out.spans === undefined ? -1 : linkHoverOf(node);
  out.textDecoration = resolveProperty(node, UiProperties.textDecoration);
  out.textColor = resolveColor(node, UiProperties.color) ?? UiBasicColors.black;
  out.textAlign = normalizeTextAlign(resolveProperty(node, UiProperties.textAlign));
  out.verticalAlign = normalizeVerticalAlign(resolveString(node, 'verticalAlign'));
  out.textWrap = normalizeTextWrap(resolveString(node, 'textWrap'));
  const maxLines = resolveNumber(node, 'maxLines');
  out.maxLines = maxLines !== undefined && maxLines >= 1 ? Math.floor(maxLines) : undefined;
  out.textOverflow = normalizeTextOverflow(resolveString(node, 'textOverflow'));

  return out;
}

/**
 * Returns the text half of a reused scratch to the values
 * `createPaintState` gives it, for a node that has no text.
 *
 * Twelve assignments of constants, against the ten property
 * resolutions they stand in for: on the frame benchmark's tree the
 * reset is 0.09ms of a 3.2ms pass over 5,001 nodes, where skipping the
 * resolutions saves 1.7ms of it. Keeping the previous node's values
 * instead would save that twentieth and cost the one guarantee worth
 * having here, which is that a box never comes out of this function
 * wearing a label's font.
 *
 * `lineHeight` resets to zero rather than to a normal line height for
 * the default size, because zero is what the field means when nothing
 * has resolved it: `textMeasureRequest` reads any value at or below
 * zero as "no declared line height" and lets the paragraph choose.
 */
function resetTextStyle(out: PaintState): void {
  out.fontSize = DEFAULT_FONT_SIZE;
  out.fontFamily = DEFAULT_FONT_FAMILY;
  out.fontWeight = DEFAULT_FONT_WEIGHT;
  out.lineHeight = 0;
  out.letterSpacing = 0;
  out.textColor = DEFAULT_TEXT_COLOR;
  out.textAlign = 'start';
  out.verticalAlign = 'top';
  out.textWrap = 'word';
  out.maxLines = undefined;
  out.textOverflow = 'clip';
  out.rtl = false;
  out.fontStyle = 'normal';
  out.fontStretch = 'normal';
  out.fontVariant = 'normal';
  out.fontKerning = 'auto';
  out.textDecoration = 'none';
  out.spans = undefined;
  out.linkHover = -1;
}

/**
 * A node's runs with their colours resolved against its theme,
 * remembered by the identity of the array they came from and the
 * theme they were resolved against.
 *
 * The memo is what keeps the paint state's promise not to allocate per
 * frame: a run's colour may be a palette name, so resolving it needs
 * the theme, and doing that for every run of every paragraph on screen
 * on every frame would allocate a run record per run per frame. A
 * theme change is an object change, so it invalidates the memo without
 * anything having to notice.
 */
const paintSpans = new WeakMap<readonly UiResolvedTextSpan[], { theme: unknown; spans: readonly PaintTextSpan[] }>();

function resolvePaintSpans(node: UiNode): readonly PaintTextSpan[] | undefined {
  const spans = resolvedSpansOf(node);
  if (spans.length === 0) {
    return undefined;
  }
  const theme = node.environment !== null ? node.environment.get(UiEnvironmentKeys.theme) : undefined;
  const cached = paintSpans.get(spans);
  if (cached !== undefined && cached.theme === theme) {
    return cached.spans;
  }
  const resolved: PaintTextSpan[] = spans.map(span => ({
    start: span.start,
    end: span.end,
    fontFamily: span.fontFamily,
    fontSize: span.fontSize,
    fontWeight: span.fontWeight,
    fontStyle: span.fontStyle,
    fontStretch: span.fontStretch,
    fontVariant: span.fontVariant,
    fontKerning: span.fontKerning,
    letterSpacing: span.letterSpacing,
    color: resolveColorValue(node, span.color),
    backgroundColor: resolveColorValue(node, span.backgroundColor),
    textDecoration: span.textDecoration,
    link: span.link
  }));
  paintSpans.set(spans, { theme, spans: resolved });
  return resolved;
}

/**
 * Whether a node paints at all, answered from its two cheapest
 * properties.
 *
 * Both renderer walks need to know this before they know anything else:
 * an invisible node is skipped whether or not it is on screen, and a
 * lifted one must not join the top layer if it is invisible. Resolving
 * the whole paint state to learn it costs about twenty-five property
 * resolutions, which a long list pays for every row it then culls, so
 * the walks ask this first and resolve the rest only for the nodes that
 * survive the cull.
 *
 * It reads `visible` and `opacity` through the same resolvers
 * `resolvePaintState` uses, so the two cannot come to different
 * answers. `resolvePaintState` clamps opacity into [0, 1] and the
 * renderers then test it against zero, which is the same question as
 * "is it zero or less" asked of the unclamped value; a non-numeric
 * opacity fails both comparisons and stays visible either way.
 */
export function isPaintVisible(node: UiNode): boolean {
  if (resolveBoolean(node, 'visible') === false) {
    return false;
  }
  const opacity = resolveNumber(node, 'opacity');
  return !(opacity !== undefined && opacity <= 0);
}

/**
 * Resolves the destination rectangle for an object-fit image.
 *
 * Pure geometry so the same semantics can be reused by a future
 * WebGPU backend.
 */
export function computeObjectFitRect(
  fit: ObjectFit,
  imageWidth: number,
  imageHeight: number,
  box: LayoutBox
): LayoutBox {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { x: box.x, y: box.y, width: 0, height: 0 };
  }
  switch (fit) {
    case 'cover': {
      const scale = Math.max(box.width / imageWidth, box.height / imageHeight);
      const width = imageWidth * scale;
      const height = imageHeight * scale;
      return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
    }
    case 'contain': {
      const scale = Math.min(box.width / imageWidth, box.height / imageHeight);
      const width = imageWidth * scale;
      const height = imageHeight * scale;
      return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
    }
    case 'none':
      return { x: box.x, y: box.y, width: imageWidth, height: imageHeight };
    default:
      return { x: box.x, y: box.y, width: box.width, height: box.height };
  }
}

function parseVideo(value: unknown): UiVideoSurface | undefined {
  return isVideoSurface(value) ? value : undefined;
}

function parseImage(value: unknown): UiImage | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const candidate = value as { width?: unknown; height?: unknown };
  if (typeof candidate.width !== 'number' || typeof candidate.height !== 'number') {
    return undefined;
  }
  return value as UiImage;
}

function parseObjectFit(value: unknown): ObjectFit {
  if (value === 'cover' || value === 'contain' || value === 'none') {
    return value;
  }
  return 'fill';
}

/**
 * Creates a fresh default PaintState with its transform scratch
 * pre-allocated. The result is meant to be reused across nodes.
 */
export function createPaintState(): PaintState {
  return {
    visible: true,
    opacity: 1,
    backgroundColor: undefined,
    backgroundGradient: undefined,
    image: undefined,
    video: undefined,
    objectFit: 'fill',
    borderColor: undefined,
    borderWidth: 0,
    borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
    boxShadows: [],
    hasTransform: false,
    transform: { x: 0, y: 0, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    text: undefined,
    spans: undefined,
    linkHover: -1,
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontWeight: DEFAULT_FONT_WEIGHT,
    lineHeight: 0,
    letterSpacing: 0,
    fontStyle: 'normal',
    fontStretch: 'normal',
    fontVariant: 'normal',
    fontKerning: 'auto',
    textDecoration: 'none',
    textColor: DEFAULT_TEXT_COLOR,
    textAlign: 'start',
    verticalAlign: 'top',
    textWrap: 'word',
    maxLines: undefined,
    textOverflow: 'clip',
    rtl: false,
    editor: undefined,
    textSelection: undefined,
    textMatches: undefined,
    placeholder: undefined,
    placeholderColor: DEFAULT_PLACEHOLDER_COLOR,
    selectionColor: DEFAULT_SELECTION_COLOR,
    matchColor: DEFAULT_MATCH_COLOR,
    caretColor: DEFAULT_TEXT_COLOR
  };
}

const DEFAULT_PLACEHOLDER_COLOR: UiColor = { r: 0.4, g: 0.4, b: 0.4, a: 1 };
const DEFAULT_SELECTION_COLOR: UiColor = { r: 0.13, g: 0.59, b: 0.95, a: 0.35 };
const DEFAULT_MATCH_COLOR: UiColor = { r: 0.61, g: 0.15, b: 0.69, a: 0.3 };

/** The theme's primary at a third of its strength, behind selected text. */
function defaultSelectionColor(node: UiNode): UiColor {
  const primary = themeColor(node, 'primary');
  return primary === undefined ? DEFAULT_SELECTION_COLOR : { r: primary.r, g: primary.g, b: primary.b, a: 0.35 };
}

/**
 * The theme's secondary, weaker than the selection. Find matches are
 * drawn under the active one, which is a real selection in the theme's
 * primary, so the two have to be told apart at a glance.
 */
function defaultMatchColor(node: UiNode): UiColor {
  const secondary = themeColor(node, 'secondary');
  return secondary === undefined ? DEFAULT_MATCH_COLOR : { r: secondary.r, g: secondary.g, b: secondary.b, a: 0.3 };
}

/**
 * Converts a UiColor to a CSS color string for renderer consumption.
 *
 * Uses hex for fully opaque colors and rgba() when transparency is
 * involved, matching common Canvas2D conventions.
 */
export function colorToCss(color: UiColor): string {
  if (color.a === 1) {
    return colorToHex(color);
  }
  return colorToRgba(color);
}

const warnedNonText = new WeakSet<UiNode>();

/**
 * A `text` that is not a string paints nothing and, until now, said
 * nothing. The one honest way to write one is the JSX rule that a lone
 * Observable child of <text> or <button> is its label: an icon written
 * as `<button>{icon$}</button>` binds an element to `text`. Once per
 * node, so a bound value that flickers through a wrong type is one line
 * and not a stream.
 */
function warnIfTextIsNotText(node: UiNode): void {
  const raw = resolveProperty(node, UiProperties.text) as unknown;
  if (raw === undefined || raw === null || typeof raw === 'string' || warnedNonText.has(node)) {
    return;
  }
  warnedNonText.add(node);
  const kind = Array.isArray(raw) ? 'an array' : typeof raw === 'object' ? 'an element or object' : typeof raw;
  console.warn(
    `Node '${node.id}' has a text that is ${kind}, and nothing is drawn for it. A lone Observable child of ` +
      `<text> or <button> is read as its text; if it was meant as children, put it in an array (\`{[child$]}\`) ` +
      `or wrap it in a <box>.`
  );
}
