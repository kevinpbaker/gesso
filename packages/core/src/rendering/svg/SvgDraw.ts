import { percent } from '../../layout/UiLength';
import { parseColor, type UiColor } from '../../properties/UiColor';
import type { UiGradient, UiGradientStop } from '../../properties/UiGradient';
import type { UiColorValue } from '../../properties/UiPropertyValues';
import { tracePathData } from '../PaintPathData';
import type { PaintBox, PaintFillRule, PaintLineCap, PaintLineJoin, PaintSurface, UiPaint } from '../PaintSurface';
import {
  localName,
  numbersIn,
  parseDeclarations,
  parseViewBox,
  selectorMatches,
  type SvgDocument,
  type SvgRect
} from './SvgDocument';
import type { SvgXmlElement } from './SvgXml';

/** How a drawing fills a box whose shape is not its own: `objectFit`'s values. */
export type SvgFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';

export interface SvgDrawOptions {
  /** How the drawing fills the box. `contain` by default, as an `<img>` of an SVG keeps its proportions. */
  readonly fit?: SvgFit;
  /**
   * What `currentColor` is: a palette name or a colour. `text` by
   * default, so an icon set authored in `currentColor` takes the
   * theme's text colour and follows a theme change.
   */
  readonly color?: UiColorValue;
}

/**
 * Draws a read SVG file into a box, through the surface every painted
 * node draws through, so it is vectors on either renderer and is drawn
 * again at whatever size the box is laid out at.
 */
export function drawSvg(
  document: SvgDocument,
  surface: PaintSurface,
  box: Pick<PaintBox, 'width' | 'height'>,
  options: SvgDrawOptions = {}
): void {
  const { viewBox } = document;
  const fit = options.fit ?? 'contain';
  let scaleX = box.width / viewBox.width;
  let scaleY = box.height / viewBox.height;
  if (fit !== 'fill') {
    const contain = Math.min(scaleX, scaleY);
    const natural = document.width / viewBox.width;
    const uniform =
      fit === 'cover'
        ? Math.max(scaleX, scaleY)
        : fit === 'none'
          ? natural
          : fit === 'scale-down'
            ? Math.min(contain, natural)
            : contain;
    scaleX = uniform;
    scaleY = uniform;
  }
  surface.save();
  if (fit === 'cover' || fit === 'none') {
    // Drawn past the box on one axis, which the box cuts off as an
    // `<img>` cuts off a covering picture.
    surface.beginPath();
    surface.rect(0, 0, box.width, box.height);
    surface.clip();
  }
  surface.translate((box.width - viewBox.width * scaleX) / 2, (box.height - viewBox.height * scaleY) / 2);
  surface.scale(scaleX, scaleY);
  surface.translate(-viewBox.x, -viewBox.y);
  const context: Context = { document, surface, currentColor: options.color ?? 'text', using: new Set() };
  // The root's own presentation attributes are inherited like any
  // group's: an icon set says `fill="none" stroke="currentColor"` there.
  drawChildren(
    document.root,
    cascade(INITIAL_STYLE, declarationsOf(document.root, document), context),
    viewBox,
    context
  );
  surface.restore();
}

const paints = new WeakMap<SvgDocument, Map<string, UiPaint>>();

/**
 * A read SVG file as a node's `paint`: drawn to fill the node, and the
 * file's own size as the node's when the layout gives it none.
 *
 * The same object for the same file and options, so a node given it
 * again is not drawn again; see `paintValuesEqual`.
 */
export function svgPaint(document: SvgDocument, options: SvgDrawOptions = {}): UiPaint {
  let byOptions = paints.get(document);
  if (byOptions === undefined) {
    byOptions = new Map();
    paints.set(document, byOptions);
  }
  const key = JSON.stringify([options.fit ?? 'contain', options.color ?? 'text']);
  let paint = byOptions.get(key);
  if (paint === undefined) {
    paint = {
      draw: (surface, box) => drawSvg(document, surface, box, options),
      inputs: [document, key],
      intrinsicWidth: document.width,
      intrinsicHeight: document.height
    };
    byOptions.set(key, paint);
  }
  return paint;
}

interface Context {
  readonly document: SvgDocument;
  readonly surface: PaintSurface;
  readonly currentColor: UiColorValue;
  /** The `<use>`s being drawn, so one that reaches itself draws nothing instead of forever. */
  readonly using: Set<SvgXmlElement>;
}

/** A fill or a stroke: nothing, a colour, or a gradient by id. */
type Paint =
  | { readonly kind: 'none' }
  | { readonly kind: 'color'; readonly color: UiColorValue }
  | { readonly kind: 'ref'; readonly id: string; readonly fallback: Paint };

/** The properties that inherit, as they stand at an element. */
interface Style {
  readonly fill: Paint;
  readonly fillOpacity: number;
  readonly fillRule: PaintFillRule;
  readonly stroke: Paint;
  readonly strokeOpacity: number;
  readonly strokeWidth: number;
  readonly lineCap: PaintLineCap;
  readonly lineJoin: PaintLineJoin;
  readonly miterLimit: number;
  readonly dash: readonly number[];
  readonly dashOffset: number;
  readonly clipRule: PaintFillRule;
  /** What `currentColor` is here, when an element set `color`. */
  readonly color: UiColorValue | null;
  readonly visible: boolean;
}

const BLACK: Paint = { kind: 'color', color: { r: 0, g: 0, b: 0, a: 1 } };
const NONE: Paint = { kind: 'none' };

const INITIAL_STYLE: Style = {
  fill: BLACK,
  fillOpacity: 1,
  fillRule: 'nonzero',
  stroke: NONE,
  strokeOpacity: 1,
  strokeWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  miterLimit: 4,
  dash: [],
  dashOffset: 0,
  clipRule: 'nonzero',
  color: null,
  visible: true
};

/** Drawn only when something points at them, or not at all. */
const NOT_DRAWN = new Set([
  'defs',
  'clipPath',
  'linearGradient',
  'radialGradient',
  'symbol',
  'style',
  'title',
  'desc',
  'metadata',
  'mask',
  'filter',
  'pattern',
  'marker',
  'text',
  'image',
  'foreignObject'
]);

function drawChildren(element: SvgXmlElement, style: Style, viewport: SvgRect, context: Context): void {
  for (const child of element.children) {
    drawElement(child, style, viewport, context);
  }
}

function drawElement(element: SvgXmlElement, inherited: Style, viewport: SvgRect, context: Context): void {
  const name = localName(element.name);
  if (NOT_DRAWN.has(name)) {
    return;
  }
  const declared = declarationsOf(element, context.document);
  if (declared.display === 'none') {
    return;
  }
  const style = cascade(inherited, declared, context);
  const { surface } = context;
  surface.save();
  if (declared.transform !== undefined) {
    applyTransform(surface, declared.transform);
  }
  const opacity = unit(declared.opacity);
  if (opacity < 1) {
    surface.alpha(opacity);
  }
  if (declared['clip-path'] !== undefined) {
    clipTo(declared['clip-path'], viewport, context);
  }
  switch (name) {
    case 'g':
    case 'a':
    case 'switch':
      drawChildren(element, style, viewport, context);
      break;
    case 'svg':
      drawNested(element, style, viewport, context);
      break;
    case 'use':
      drawUse(element, style, viewport, context);
      break;
    default: {
      const shape = shapeOf(element, name, viewport);
      if (shape !== null && style.visible) {
        paintShape(shape, style, viewport, context);
      }
    }
  }
  surface.restore();
}

/** A nested `<svg>`: a viewport of its own, at its x and y. */
function drawNested(element: SvgXmlElement, style: Style, viewport: SvgRect, context: Context): void {
  const { surface } = context;
  const x = length(element.attributes.x, viewport.width);
  const y = length(element.attributes.y, viewport.height);
  const width = length(element.attributes.width ?? '100%', viewport.width);
  const height = length(element.attributes.height ?? '100%', viewport.height);
  const viewBox = parseViewBox(element.attributes.viewBox);
  surface.translate(x, y);
  if (viewBox !== undefined) {
    const scale = Math.min(width / viewBox.width, height / viewBox.height);
    surface.translate((width - viewBox.width * scale) / 2, (height - viewBox.height * scale) / 2);
    surface.scale(scale, scale);
    surface.translate(-viewBox.x, -viewBox.y);
  }
  drawChildren(element, style, viewBox ?? { x: 0, y: 0, width, height }, context);
}

/** A `<use>`: the element it names, drawn at its x and y, inheriting from the `<use>`. */
function drawUse(element: SvgXmlElement, style: Style, viewport: SvgRect, context: Context): void {
  const target = referenced(element, context.document);
  if (target === undefined || context.using.has(element)) {
    return;
  }
  const { surface } = context;
  surface.translate(length(element.attributes.x, viewport.width), length(element.attributes.y, viewport.height));
  context.using.add(element);
  if (localName(target.name) === 'symbol') {
    drawNested(target, style, viewport, context);
  } else {
    // Drawn as its own element would be, through the not-drawn list's
    // exception: what `<defs>` holds is drawn when it is used.
    const name = localName(target.name);
    if (name === 'g' || name === 'svg' || name === 'use' || !NOT_DRAWN.has(name)) {
      drawElement(target, style, viewport, context);
    }
  }
  context.using.delete(element);
}

function referenced(element: SvgXmlElement, document: SvgDocument): SvgXmlElement | undefined {
  const href = element.attributes.href ?? element.attributes['xlink:href'];
  return href?.startsWith('#') ? document.ids.get(href.slice(1)) : undefined;
}

/** A shape, as something that can trace itself onto a surface. */
interface Shape {
  trace(surface: PaintSurface): void;
}

function shapeOf(element: SvgXmlElement, name: string, viewport: SvgRect): Shape | null {
  const a = element.attributes;
  const w = viewport.width;
  const h = viewport.height;
  const diagonal = Math.sqrt((w * w + h * h) / 2);
  switch (name) {
    case 'path': {
      const d = a.d;
      return d === undefined || d.trim() === '' ? null : { trace: surface => surface.path(d) };
    }
    case 'rect': {
      const x = length(a.x, w);
      const y = length(a.y, h);
      const width = length(a.width, w);
      const height = length(a.height, h);
      if (width <= 0 || height <= 0) {
        return null;
      }
      const rx = a.rx === undefined ? undefined : length(a.rx, w);
      const ry = a.ry === undefined ? undefined : length(a.ry, h);
      const radius = Math.min(rx ?? ry ?? 0, ry ?? rx ?? 0);
      return {
        trace: surface =>
          radius > 0 ? surface.roundRect(x, y, width, height, radius) : surface.rect(x, y, width, height)
      };
    }
    case 'circle':
      return ellipse(length(a.cx, w), length(a.cy, h), length(a.r, diagonal), length(a.r, diagonal));
    case 'ellipse':
      return ellipse(length(a.cx, w), length(a.cy, h), length(a.rx, w), length(a.ry, h));
    case 'line': {
      const [x1, y1, x2, y2] = [length(a.x1, w), length(a.y1, h), length(a.x2, w), length(a.y2, h)];
      return {
        trace: surface => {
          surface.moveTo(x1, y1);
          surface.lineTo(x2, y2);
        }
      };
    }
    case 'polyline':
    case 'polygon': {
      const points = numbersIn(a.points ?? '');
      if (points.length < 4) {
        return null;
      }
      return {
        trace: surface => {
          surface.moveTo(points[0]!, points[1]!);
          for (let i = 2; i + 1 < points.length; i += 2) {
            surface.lineTo(points[i]!, points[i + 1]!);
          }
          if (name === 'polygon') {
            surface.closePath();
          }
        }
      };
    }
    default:
      return null;
  }
}

/** An ellipse as two arcs of path data, which the surface turns into curves. */
function ellipse(cx: number, cy: number, rx: number, ry: number): Shape | null {
  if (rx <= 0 || ry <= 0) {
    return null;
  }
  const d = `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}` + `A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
  return { trace: surface => surface.path(d) };
}

function paintShape(shape: Shape, style: Style, viewport: SvgRect, context: Context): void {
  const { surface } = context;
  surface.beginPath();
  shape.trace(surface);
  if (style.fill.kind !== 'none' && style.fillOpacity > 0) {
    surface.save();
    if (style.fillOpacity < 1) {
      surface.alpha(style.fillOpacity);
    }
    if (setPaint(style.fill, 'fill', shape, style, viewport, context)) {
      surface.fill(style.fillRule);
    }
    surface.restore();
  }
  if (style.stroke.kind !== 'none' && style.strokeOpacity > 0 && style.strokeWidth > 0) {
    surface.save();
    if (style.strokeOpacity < 1) {
      surface.alpha(style.strokeOpacity);
    }
    if (setPaint(style.stroke, 'stroke', shape, style, viewport, context)) {
      surface.lineWidth(style.strokeWidth);
      surface.lineCap(style.lineCap);
      surface.lineJoin(style.lineJoin);
      surface.miterLimit(style.miterLimit);
      if (style.dash.length > 0) {
        surface.lineDash(style.dash, style.dashOffset);
      }
      surface.stroke();
    }
    surface.restore();
  }
}

/**
 * Sets a fill or a stroke on the surface. False when there is nothing
 * to draw with: a gradient with no stops, or a reference to nothing and
 * no fallback.
 *
 * A gradient stroke is drawn in its last stop's colour, because the
 * surface strokes only in a colour.
 */
function setPaint(
  paint: Paint,
  role: 'fill' | 'stroke',
  shape: Shape,
  style: Style,
  viewport: SvgRect,
  context: Context
): boolean {
  if (paint.kind === 'none') {
    return false;
  }
  if (paint.kind === 'color') {
    if (role === 'fill') {
      context.surface.fillColor(paint.color);
    } else {
      context.surface.strokeColor(paint.color);
    }
    return true;
  }
  const target = context.document.ids.get(paint.id);
  const gradient = target === undefined ? undefined : gradientOf(target, shape, style, viewport, context);
  if (gradient === undefined) {
    return setPaint(paint.fallback, role, shape, style, viewport, context);
  }
  if (gradient.stops.length === 0) {
    return false;
  }
  if (role === 'stroke' || gradient.stops.length === 1) {
    const color = gradient.stops.at(-1)!.color;
    if (role === 'fill') {
      context.surface.fillColor(color);
    } else {
      context.surface.strokeColor(color);
    }
    return true;
  }
  context.surface.fillGradient(
    gradient.paint,
    gradient.rect.x,
    gradient.rect.y,
    gradient.rect.width,
    gradient.rect.height
  );
  return true;
}

/**
 * An SVG gradient as Gesso's, and the rectangle to place it in.
 *
 * SVG gives a linear gradient as the two ends of its line and Gesso as
 * an angle across a rectangle, CSS's way, so the rectangle is chosen to
 * make the two agree: a square about the line's midpoint whose
 * gradient line, at that angle, is exactly as long as the SVG's. A
 * radial one is its centre and radius in pixels, placed at the origin.
 */
function gradientOf(
  element: SvgXmlElement,
  shape: Shape,
  style: Style,
  viewport: SvgRect,
  context: Context
): { paint: UiGradient; stops: readonly UiGradientStop[]; rect: SvgRect } | undefined {
  const name = localName(element.name);
  if (name !== 'linearGradient' && name !== 'radialGradient') {
    return undefined;
  }
  const attributes = gradientAttributes(element, context.document);
  const stops = gradientStops(element, style, context);
  const userSpace = attributes.gradientUnits === 'userSpaceOnUse';
  const box = userSpace ? viewport : boundsOf(shape);
  const matrix = attributes.gradientTransform === undefined ? IDENTITY : parseTransform(attributes.gradientTransform);
  /** A point in the gradient's units, in the drawing's. */
  const place = (x: string | undefined, y: string | undefined, fallbackX: string, fallbackY: string) => {
    const u = gradientLength(x ?? fallbackX, userSpace, viewport.width);
    const v = gradientLength(y ?? fallbackY, userSpace, viewport.height);
    const [tx, ty] = apply(matrix, u, v);
    return userSpace ? [tx, ty] : [box.x + tx * box.width, box.y + ty * box.height];
  };
  if (name === 'linearGradient') {
    const [x1, y1] = place(attributes.x1, attributes.y1, '0%', '0%') as [number, number];
    const [x2, y2] = place(attributes.x2, attributes.y2, '100%', '0%') as [number, number];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const span = Math.hypot(dx, dy);
    if (span === 0) {
      return { paint: { kind: 'linear', angle: 0, stops: stops.slice(-1) }, stops: stops.slice(-1), rect: box };
    }
    const angle = Math.atan2(dx, -dy);
    const side = span / (Math.abs(Math.sin(angle)) + Math.abs(Math.cos(angle)));
    return {
      paint: { kind: 'linear', angle, stops },
      stops,
      rect: { x: (x1 + x2) / 2 - side / 2, y: (y1 + y2) / 2 - side / 2, width: side, height: side }
    };
  }
  const [cx, cy] = place(attributes.cx, attributes.cy, '50%', '50%') as [number, number];
  const r = gradientLength(
    attributes.r ?? '50%',
    userSpace,
    Math.sqrt((viewport.width ** 2 + viewport.height ** 2) / 2)
  );
  const scale = Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]));
  const radius = r * scale * (userSpace ? 1 : (box.width + box.height) / 2);
  if (radius <= 0) {
    return { paint: { kind: 'radial', stops: stops.slice(-1) }, stops: stops.slice(-1), rect: box };
  }
  return {
    paint: { kind: 'radial', centerX: cx, centerY: cy, radius, stops },
    stops,
    rect: { x: 0, y: 0, width: 1, height: 1 }
  };
}

/** A gradient's attributes, with the ones it inherits through `href` from the gradient it names. */
function gradientAttributes(element: SvgXmlElement, document: SvgDocument): Record<string, string> {
  const chain: SvgXmlElement[] = [];
  for (
    let at: SvgXmlElement | undefined = element;
    at !== undefined && !chain.includes(at);
    at = referenced(at, document)
  ) {
    chain.push(at);
  }
  return Object.assign({}, ...chain.reverse().map(link => link.attributes)) as Record<string, string>;
}

/** Its stops, or those of the gradient it names when it has none. */
function gradientStops(element: SvgXmlElement, style: Style, context: Context): UiGradientStop[] {
  const seen: SvgXmlElement[] = [];
  let at: SvgXmlElement | undefined = element;
  while (at !== undefined && !seen.includes(at)) {
    seen.push(at);
    const stops = at.children.filter(child => localName(child.name) === 'stop');
    if (stops.length > 0) {
      let last = 0;
      return stops.map(stop => {
        const declared = declarationsOf(stop, context.document);
        const raw = declared.offset ?? '0';
        const offset = Math.max(
          last,
          Math.min(1, raw.trim().endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw) || 0)
        );
        last = offset;
        const color = colorValue(declared['stop-color'] ?? 'black', style, context) ?? BLACK_COLOR;
        return { offset: percent(offset * 100), color: withOpacity(color, unit(declared['stop-opacity'])) };
      });
    }
    at = referenced(at, context.document);
  }
  return [];
}

const BLACK_COLOR: UiColor = { r: 0, g: 0, b: 0, a: 1 };

function withOpacity(color: UiColorValue, opacity: number): UiColorValue {
  if (opacity >= 1 || typeof color === 'string') {
    // A palette name carries no opacity of its own to multiply.
    return color;
  }
  return { ...color, a: color.a * opacity };
}

/** A gradient coordinate: a fraction of the box, or pixels in user space. */
function gradientLength(value: string, userSpace: boolean, extent: number): number {
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) {
    const fraction = parseFloat(trimmed) / 100;
    return userSpace ? fraction * extent : fraction;
  }
  return parseFloat(trimmed) || 0;
}

/** The box a shape's outline and control points lie in, for a gradient sized to it. */
function boundsOf(shape: Shape): SvgRect {
  const bounds = new BoundsSurface();
  shape.trace(bounds as unknown as PaintSurface);
  return bounds.bounds();
}

/** A surface that only notes where a path goes. */
class BoundsSurface {
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  private note(x: number, y: number): void {
    this.minX = Math.min(this.minX, x);
    this.minY = Math.min(this.minY, y);
    this.maxX = Math.max(this.maxX, x);
    this.maxY = Math.max(this.maxY, y);
  }

  bounds(): SvgRect {
    if (this.minX > this.maxX) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    return { x: this.minX, y: this.minY, width: this.maxX - this.minX, height: this.maxY - this.minY };
  }

  moveTo(x: number, y: number): void {
    this.note(x, y);
  }
  lineTo(x: number, y: number): void {
    this.note(x, y);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.note(cx, cy);
    this.note(x, y);
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.note(c1x, c1y);
    this.note(c2x, c2y);
    this.note(x, y);
  }
  arc(x: number, y: number, radius: number): void {
    this.note(x - radius, y - radius);
    this.note(x + radius, y + radius);
  }
  rect(x: number, y: number, width: number, height: number): void {
    this.note(x, y);
    this.note(x + width, y + height);
  }
  roundRect(x: number, y: number, width: number, height: number): void {
    this.rect(x, y, width, height);
  }
  closePath(): void {}
  path(d: string): void {
    tracePathData(this as unknown as PaintSurface, d);
  }
}
/** Intersects the clip with a `<clipPath>`'s shapes, in the drawing's own coordinates. */
function clipTo(value: string, viewport: SvgRect, context: Context): void {
  const id = /url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(value)?.[1];
  const clip = id === undefined ? undefined : context.document.ids.get(id);
  if (clip === undefined || localName(clip.name) !== 'clipPath') {
    return;
  }
  const { surface } = context;
  surface.beginPath();
  let rule: PaintFillRule = 'nonzero';
  const add = (element: SvgXmlElement): void => {
    const name = localName(element.name);
    const declared = declarationsOf(element, context.document);
    if (name === 'use') {
      const target = referenced(element, context.document);
      if (target !== undefined && localName(target.name) !== 'use') {
        add(target);
      }
      return;
    }
    if (name === 'g') {
      element.children.forEach(add);
      return;
    }
    const shape = shapeOf(element, name, viewport);
    if (shape === null) {
      return;
    }
    if (declared['clip-rule'] === 'evenodd') {
      rule = 'evenodd';
    }
    if (declared.transform !== undefined) {
      // A transformed clip shape is traced through a matrix of its own,
      // since the surface's transform applies to the whole clip.
      const matrix = parseTransform(declared.transform);
      shape.trace(new TransformedSurface(surface, matrix) as unknown as PaintSurface);
    } else {
      shape.trace(surface);
    }
  };
  clip.children.forEach(add);
  surface.clip(rule);
}

/** Forwards path calls with every point through a matrix. */
class TransformedSurface {
  constructor(
    private readonly target: PaintSurface,
    private readonly matrix: Matrix
  ) {}
  private at(x: number, y: number): [number, number] {
    return apply(this.matrix, x, y);
  }
  moveTo(x: number, y: number): void {
    this.target.moveTo(...this.at(x, y));
  }
  lineTo(x: number, y: number): void {
    this.target.lineTo(...this.at(x, y));
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.target.quadraticCurveTo(...this.at(cx, cy), ...this.at(x, y));
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.target.bezierCurveTo(...this.at(c1x, c1y), ...this.at(c2x, c2y), ...this.at(x, y));
  }
  rect(x: number, y: number, width: number, height: number): void {
    this.moveTo(x, y);
    this.lineTo(x + width, y);
    this.lineTo(x + width, y + height);
    this.lineTo(x, y + height);
    this.closePath();
  }
  roundRect(x: number, y: number, width: number, height: number): void {
    this.rect(x, y, width, height);
  }
  closePath(): void {
    this.target.closePath();
  }
  path(d: string): void {
    tracePathData(this as unknown as PaintSurface, d);
  }
}

/**
 * What an element declares, in the cascade's order: its presentation
 * attributes, then the `<style>` rules that match it by specificity,
 * then its own `style` attribute.
 */
function declarationsOf(element: SvgXmlElement, document: SvgDocument): Record<string, string> {
  const declared: Record<string, string> = { ...element.attributes };
  if (document.rules.length > 0) {
    const matching = document.rules
      .map((rule, order) => ({ rule, order }))
      .filter(({ rule }) => selectorMatches(rule.selector, element))
      .sort((a, b) => a.rule.specificity - b.rule.specificity || a.order - b.order);
    for (const { rule } of matching) {
      Object.assign(declared, rule.declarations);
    }
  }
  if (element.attributes.style !== undefined) {
    Object.assign(declared, parseDeclarations(element.attributes.style));
  }
  return declared;
}

/** The inherited style at an element, from its parent's and what it declares. */
function cascade(parent: Style, declared: Record<string, string>, context: Context): Style {
  const color =
    declared.color === undefined || declared.color === 'inherit'
      ? parent.color
      : (colorValue(declared.color, parent, context) ?? parent.color);
  const here: Style = { ...parent, color };
  const pick = <K extends keyof Style>(
    key: K,
    property: string,
    read: (value: string) => Style[K] | undefined
  ): Style[K] => {
    const value = declared[property];
    return value === undefined || value === 'inherit' ? here[key] : (read(value) ?? here[key]);
  };
  const number = (value: string): number | undefined => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    ...here,
    fill: pick('fill', 'fill', value => paintValue(value, here, context)),
    fillOpacity: pick('fillOpacity', 'fill-opacity', value => unit(value)),
    fillRule: pick('fillRule', 'fill-rule', value => (value === 'evenodd' ? 'evenodd' : 'nonzero')),
    stroke: pick('stroke', 'stroke', value => paintValue(value, here, context)),
    strokeOpacity: pick('strokeOpacity', 'stroke-opacity', value => unit(value)),
    strokeWidth: pick('strokeWidth', 'stroke-width', number),
    lineCap: pick('lineCap', 'stroke-linecap', value =>
      value === 'round' || value === 'square' || value === 'butt' ? value : undefined
    ),
    lineJoin: pick('lineJoin', 'stroke-linejoin', value =>
      value === 'round' || value === 'bevel' || value === 'miter'
        ? value
        : value === 'arcs' || value === 'miter-clip'
          ? 'miter'
          : undefined
    ),
    miterLimit: pick('miterLimit', 'stroke-miterlimit', number),
    dash: pick('dash', 'stroke-dasharray', value => {
      if (value === 'none') {
        return [];
      }
      const segments = numbersIn(value);
      if (segments.some(segment => segment < 0) || segments.every(segment => segment === 0)) {
        return [];
      }
      return segments.length % 2 === 1 ? [...segments, ...segments] : segments;
    }),
    dashOffset: pick('dashOffset', 'stroke-dashoffset', number),
    clipRule: pick('clipRule', 'clip-rule', value => (value === 'evenodd' ? 'evenodd' : 'nonzero')),
    visible: pick('visible', 'visibility', value =>
      value === 'visible' || value === 'inherit' ? true : value === 'hidden' || value === 'collapse' ? false : undefined
    )
  };
}

function paintValue(value: string, style: Style, context: Context): Paint | undefined {
  const trimmed = value.trim();
  if (trimmed === 'none' || trimmed === 'transparent') {
    return NONE;
  }
  const reference = /^url\(\s*['"]?#([^'")]+)['"]?\s*\)\s*(.*)$/.exec(trimmed);
  if (reference !== null) {
    const fallback =
      reference[2] === '' || reference[2] === undefined ? NONE : (paintValue(reference[2], style, context) ?? NONE);
    return { kind: 'ref', id: reference[1]!, fallback };
  }
  const color = colorValue(trimmed, style, context);
  return color === undefined ? undefined : { kind: 'color', color };
}

/** A colour, with `currentColor` resolved to whatever it is here. */
function colorValue(value: string, style: Style, context: Context): UiColorValue | undefined {
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === 'currentcolor') {
    return style.color ?? context.currentColor;
  }
  return parseColor(trimmed);
}

/** An opacity: a number or a percentage, clamped to 0..1, and 1 when absent. */
function unit(value: string | undefined): number {
  if (value === undefined) {
    return 1;
  }
  const trimmed = value.trim();
  const parsed = trimmed.endsWith('%') ? parseFloat(trimmed) / 100 : parseFloat(trimmed);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 1;
}

/** A length in the drawing's units, a percentage being of `extent`. */
function length(value: string | undefined, extent: number): number {
  if (value === undefined) {
    return 0;
  }
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) {
    return (parseFloat(trimmed) / 100) * extent;
  }
  const parsed = parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A 2D affine matrix, `a b c d e f` as canvas and SVG write it. */
type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** A `transform` list as one matrix, its functions applied left to right as SVG says. */
export function parseTransform(value: string): Matrix {
  let matrix = IDENTITY;
  for (const match of value.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const args = numbersIn(match[2]!);
    let step: Matrix = IDENTITY;
    switch (match[1]) {
      case 'matrix':
        if (args.length >= 6) {
          step = [args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!];
        }
        break;
      case 'translate':
        step = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case 'scale':
        step = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const angle = ((args[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const [cx, cy] = [args[1] ?? 0, args[2] ?? 0];
        step = multiply(multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
        step = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        step = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    matrix = multiply(matrix, step);
  }
  return matrix;
}

function applyTransform(surface: PaintSurface, value: string): void {
  const [a, b, c, d, e, f] = parseTransform(value);
  surface.transform(a, b, c, d, e, f);
}
