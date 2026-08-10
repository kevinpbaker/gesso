import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from '../layout/LayoutTypes';

/**
 * Renderer-facing image type.
 *
 * ImageBitmap is available on the main thread and in Workers
 * (createImageBitmap), so the rendering core never depends on
 * HTMLImageElement. Decoding/caching is a separate future layer.
 */
export type UiImage = ImageBitmap;

/**
 * Affine transform applied around a node's top-left corner.
 */
export interface UiTransform {
  /** Additional translation, applied before rotate/scale. */
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  /** Rotation in radians. */
  rotation: number;
}

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
  backgroundColor: string | undefined;
  image: UiImage | undefined;
  objectFit: ObjectFit;
  borderColor: string | undefined;
  borderWidth: number;
  borderRadius: number;
  hasTransform: boolean;
  transform: UiTransform;
  text: string | undefined;
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  lineHeight: number;
  textColor: string;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
}

export const DEFAULT_FONT_SIZE = 14;
export const DEFAULT_FONT_FAMILY = 'sans-serif';
export const DEFAULT_FONT_WEIGHT = 'normal';
export const DEFAULT_TEXT_COLOR = '#000';
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
 * Parses a node transform property into an identity-or-transformed
 * description. Any single-field object that equals the identity is
 * reported as "no transform".
 */
export function parseTransform(value: unknown): UiTransform | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const candidate = value as Partial<UiTransform>;
  const transform: UiTransform = {
    x: toFinite(candidate.x) ?? 0,
    y: toFinite(candidate.y) ?? 0,
    scaleX: toFinite(candidate.scaleX) ?? 1,
    scaleY: toFinite(candidate.scaleY) ?? 1,
    rotation: toFinite(candidate.rotation) ?? 0
  };
  if (isIdentityTransform(transform)) {
    return undefined;
  }
  return transform;
}

function isIdentityTransform(transform: UiTransform): boolean {
  return (
    transform.x === 0 &&
    transform.y === 0 &&
    transform.scaleX === 1 &&
    transform.scaleY === 1 &&
    transform.rotation === 0
  );
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
    borderRadius: 0,
    hasTransform: false,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    text: undefined,
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontWeight: DEFAULT_FONT_WEIGHT,
    // 0 means "unset": derive from fontSize, since fontSize itself
    // is a mutable default that callers may override after this
    // factory runs.
    lineHeight: 0,
    textColor: DEFAULT_TEXT_COLOR,
    textAlign: 'left',
    verticalAlign: 'top'
  };
}

/**
 * Folds a node's properties into the supplied paint state.
 *
 * Mutates `out` and returns it. The renderer owns one scratch and
 * calls this per node, so the tree stays structural and no paint
 * objects are allocated per frame.
 */
export function resolvePaintState(node: UiNode, out: PaintState): PaintState {
  const props = node.properties;
  out.visible = props.get('visible') !== false;

  const opacity = toFinite(props.get('opacity'));
  out.opacity = opacity === undefined ? 1 : Math.min(Math.max(opacity, 0), 1);

  out.backgroundColor = stringOrUndefined(props.get('backgroundColor'));
  out.borderColor = stringOrUndefined(props.get('borderColor'));
  out.borderWidth = toFinite(props.get('borderWidth')) ?? 0;
  out.borderRadius = Math.max(0, toFinite(props.get('borderRadius')) ?? 0);
  out.image = parseImage(props.get('image'));
  out.objectFit = parseObjectFit(props.get('objectFit'));

  const rawTransform = props.get('transform');
  if (rawTransform !== undefined) {
    const parsed = parseTransform(rawTransform);
    out.hasTransform = parsed !== undefined;
    if (parsed !== undefined) {
      out.transform.x = parsed.x;
      out.transform.y = parsed.y;
      out.transform.scaleX = parsed.scaleX;
      out.transform.scaleY = parsed.scaleY;
      out.transform.rotation = parsed.rotation;
    }
  } else {
    out.hasTransform = false;
  }

  const text = props.get('text');
  out.text = typeof text === 'string' && text.length > 0 ? text : undefined;

  const fontSize = toFinite(props.get('fontSize'));
  out.fontSize = fontSize === undefined ? DEFAULT_FONT_SIZE : fontSize;
  out.fontFamily = stringOrUndefined(props.get('fontFamily')) ?? DEFAULT_FONT_FAMILY;
  const fontWeight = props.get('fontWeight');
  out.fontWeight = parseFontWeight(fontWeight) ?? DEFAULT_FONT_WEIGHT;
  const lineHeight = toFinite(props.get('lineHeight'));
  out.lineHeight = lineHeight === undefined || lineHeight <= 0 ? out.fontSize * DEFAULT_LINE_HEIGHT_FACTOR : lineHeight;
  out.textColor = stringOrUndefined(props.get('color')) ?? DEFAULT_TEXT_COLOR;
  out.textAlign = normalizeTextAlign(props.get('textAlign'));
  out.verticalAlign = normalizeVerticalAlign(props.get('verticalAlign'));

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

function parseFontWeight(value: unknown): string | number | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toFinite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
