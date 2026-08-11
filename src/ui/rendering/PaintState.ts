import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from '../layout/LayoutTypes';
import { resolveProperty, resolveNumber, resolveString, resolveBoolean } from '../properties/UiPropertyResolver';
import { UiProperties } from '../properties/UiProperty';
import type { UiColor } from '../properties/UiColor';
import { UiColors, colorToHex, colorToRgba, normalizeColor } from '../properties/UiColor';
import type { UiBorderRadius } from '../properties/UiBorderRadius';
import { normalizeBorderRadius } from '../properties/UiBorderRadius';
import type { UiBoxShadow } from '../properties/UiBoxShadow';
import type { UiTransform } from '../properties/UiTransform';
import { parseTransform } from '../properties/UiTransform';

/**
 * Renderer-facing image type.
 *
 * ImageBitmap is available on the main thread and in Workers
 * (createImageBitmap), so the rendering core never depends on
 * HTMLImageElement. Decoding/caching is a separate future layer.
 */
export type UiImage = ImageBitmap;

export type TextAlign = 'left' | 'center' | 'right';
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
  image: UiImage | undefined;
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
  textColor: UiColor;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
}

export const DEFAULT_FONT_SIZE = 14;
export const DEFAULT_FONT_FAMILY = 'sans-serif';
export const DEFAULT_FONT_WEIGHT = 'normal';
export const DEFAULT_TEXT_COLOR = UiColors.black;
export const DEFAULT_LINE_HEIGHT_FACTOR = 1.2;

export function normalizeTextAlign(value: unknown): TextAlign {
  if (value === 'center') {
    return 'center';
  }
  if (value === 'right' || value === 'end') {
    return 'right';
  }
  return 'left';
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

  out.backgroundColor = normalizeColor(resolveProperty(node, UiProperties.backgroundColor));
  out.borderColor = normalizeColor(resolveProperty(node, UiProperties.borderColor));
  out.borderWidth = resolveNumber(node, 'borderWidth') ?? 0;
  out.borderRadius = normalizeBorderRadius(resolveProperty(node, UiProperties.borderRadius));
  out.boxShadows = resolveProperty(node, UiProperties.boxShadows);
  out.image = parseImage(node.properties.get('image'));
  out.objectFit = parseObjectFit(node.properties.get('objectFit'));

  const rawTransform = node.properties.get('transform');
  const parsedTransform = rawTransform !== undefined ? parseTransform(rawTransform) : undefined;
  if (parsedTransform !== undefined) {
    out.hasTransform = true;
    out.transform = parsedTransform;
  } else {
    out.hasTransform = false;
  }

  const text = resolveString(node, 'text');
  out.text = text;

  out.fontSize = resolveNumber(node, 'fontSize') ?? DEFAULT_FONT_SIZE;
  out.fontFamily = resolveString(node, 'fontFamily') ?? DEFAULT_FONT_FAMILY;
  const fontWeight = resolveString(node, 'fontWeight') ?? resolveNumber(node, 'fontWeight');
  out.fontWeight = fontWeight ?? DEFAULT_FONT_WEIGHT;
  const lineHeight = resolveNumber(node, 'lineHeight');
  out.lineHeight = lineHeight === undefined || lineHeight <= 0 ? out.fontSize * DEFAULT_LINE_HEIGHT_FACTOR : lineHeight;
  out.textColor = normalizeColor(resolveProperty(node, UiProperties.color)) ?? UiColors.black;
  out.textAlign = normalizeTextAlign(resolveProperty(node, UiProperties.textAlign));
  out.verticalAlign = normalizeVerticalAlign(resolveString(node, 'verticalAlign'));

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
    image: undefined,
    objectFit: 'fill',
    borderColor: undefined,
    borderWidth: 0,
    borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
    boxShadows: [],
    hasTransform: false,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    text: undefined,
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontWeight: DEFAULT_FONT_WEIGHT,
    lineHeight: 0,
    textColor: DEFAULT_TEXT_COLOR,
    textAlign: 'left',
    verticalAlign: 'top'
  };
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
