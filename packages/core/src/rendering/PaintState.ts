import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { TextOverflow, TextWrap } from '../layout/TextMeasurer';
import { resolveProperty, resolveNumber, resolveString, resolveBoolean } from '../properties/UiPropertyResolver';
import { UiProperties } from '../properties/UiProperty';
import type { UiColor } from '../properties/UiColor';
import { UiBasicColors, colorToHex, colorToRgba } from '../properties/UiColor';
import type { UiBorderRadius } from '../properties/UiBorderRadius';
import { normalizeBorderRadius } from '../properties/UiBorderRadius';
import type { UiBoxShadow } from '../properties/UiBoxShadow';
import type { UiTransform } from '../properties/UiTransform';
import type { UiImage } from '../properties/UiImage';
import { isVideoSurface, type UiVideoSurface } from '../properties/UiVideo';
import { resolveColor, resolveGradient, themeColor } from '../properties/UiThemeColor';
import type { ResolvedGradient } from '../properties/UiGradient';
import type { EditableTextModel } from '../editing/EditableTextModel';
import { editorFor, isEditableNode } from '../editing/UiEditable';
import { selectionRangeOf, type TextRange } from '../selection/UiSelectable';
import { matchRangesOf } from '../find/UiTextMatches';
import { resolveFont } from '../properties/UiTextFont';
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
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  lineHeight: number;
  /** Extra space after each character, as CSS `letter-spacing`. */
  letterSpacing: number;
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
 */
export function resolvePaintState(node: UiNode, out: PaintState): PaintState {
  out.visible = resolveBoolean(node, 'visible') ?? true;

  const opacity = resolveNumber(node, 'opacity');
  out.opacity = opacity === undefined ? 1 : Math.min(Math.max(opacity, 0), 1);

  out.backgroundColor = resolveColor(node, UiProperties.backgroundColor);
  out.backgroundGradient = resolveGradient(node, resolveProperty(node, UiProperties.backgroundGradient));
  out.borderColor = resolveColor(node, UiProperties.borderColor);
  out.borderWidth = resolveNumber(node, 'borderWidth') ?? 0;
  out.borderRadius = normalizeBorderRadius(resolveProperty(node, UiProperties.borderRadius));
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
    out.text = resolveString(node, 'text');
    if (out.text === undefined) {
      warnIfTextIsNotText(node);
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
  out.rtl = resolveProperty(node, UiProperties.textDirection) === 'rtl';

  // Resolved the same way layout measured it (see resolveFont).
  const font = resolveFont(node);
  out.fontSize = font.fontSize;
  out.fontFamily = font.fontFamily;
  out.fontWeight = font.fontWeight;
  out.lineHeight = font.lineHeight;
  out.letterSpacing = font.letterSpacing;
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
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontWeight: DEFAULT_FONT_WEIGHT,
    lineHeight: 0,
    letterSpacing: 0,
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
