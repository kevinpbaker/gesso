import type { UiColorValue } from '../properties/UiPropertyValues';
import type { UiGradient } from '../properties/UiGradient';
import type { UiImage } from '../properties/UiImage';

/**
 * The drawing vocabulary an application gets when it wants to draw
 * something the property set has no name for: a sparkline, a gauge, a
 * waveform, a chart axis.
 *
 * It sits beside `UiRenderer` on purpose argues
 * the placement at length. The short version is the risk it exists to
 * avoid: a paint hook handed a `CanvasRenderingContext2D` would be a
 * Canvas2D-only capability with a WebGPU backend that could never
 * catch up, which is how a second-class renderer is made. Nothing here
 * names a canvas, a device or a texture, so neither backend can be the
 * one the vocabulary was written for.
 *
 * **Coordinates are the node's own.** `(0, 0)` is the top-left of the
 * resolved box and the box's width and height are the extent, so a
 * painter never reads a layout record and never learns where on the
 * screen it ended up. The device scale arrives separately, for the one
 * thing that genuinely needs it: choosing a hairline that is one
 * physical pixel rather than one logical one.
 *
 * **Every call is recorded, not executed.** The object a painter is
 * handed is a `PaintRecorder`, and what it produces is a
 * `PaintRecording`: plain data, comparable, replayable, and cheap
 * enough to keep. See `PaintRecording.ts` for why that indirection is
 * what makes the two backends agree.
 */
export interface PaintSurface {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** Pushes the transform, the clip and every style value. */
  save(): void;
  restore(): void;

  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  /** Radians, clockwise, about the current origin. */
  rotate(angle: number): void;
  /** Multiplies the current transform by the 3x2 affine `a b c d e f`. */
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;

  // -------------------------------------------------------------------------
  // Path building
  // -------------------------------------------------------------------------

  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  /** Radians; `counterclockwise` defaults to false. */
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  rect(x: number, y: number, width: number, height: number): void;
  /** One radius for all four corners, clamped to half the smaller side. */
  roundRect(x: number, y: number, width: number, height: number, radius: number): void;
  closePath(): void;
  /**
   * Appends SVG path data to the current path, in the surface's own
   * coordinates.
   *
   * The whole grammar an icon set uses is understood, `A` included:
   * `PaintPathData.ts` turns it into the calls above, so a `d` string
   * costs exactly what writing those calls by hand would and works
   * wherever the rest of this does. That last part is the reason it is
   * parsed here rather than handed to `Path2D`, which exists in a
   * browser and not in the suite.
   */
  path(d: string): void;

  // -------------------------------------------------------------------------
  // Style
  // -------------------------------------------------------------------------

  /**
   * A `UiColor`, a hex or named CSS colour, or a palette name.
   *
   * A palette name is the reason a painted node follows the light and
   * dark toggle without the painter knowing there was a toggle: the
   * name is resolved against whatever theme the node inherits, at the
   * moment the picture is made, exactly as a `backgroundColor` prop is.
   */
  fillColor(color: UiColorValue): void;
  /**
   * A gradient for the fills that follow, placed in the rectangle
   * given here rather than in the node's box, so a painter can ramp
   * one bar of a chart without arithmetic of its own.
   */
  fillGradient(gradient: UiGradient, x: number, y: number, width: number, height: number): void;
  strokeColor(color: UiColorValue): void;
  lineWidth(width: number): void;
  lineCap(cap: PaintLineCap): void;
  lineJoin(join: PaintLineJoin): void;
  miterLimit(limit: number): void;
  /**
   * A dash pattern in logical pixels, and how far into it the first
   * dash starts. An empty pattern draws solid.
   */
  lineDash(segments: readonly number[], offset?: number): void;
  /** Multiplies into the opacity already in force, as a node's does. */
  alpha(value: number): void;
  /**
   * Blurs everything drawn after it, by a radius in logical pixels.
   *
   * Scoped by `save` and `restore` like every other style value, so a
   * frosted panel is `save`, `blur`, draw, `restore`. Zero clears it.
   */
  blur(radius: number): void;

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  /** Fills the current path. The default rule is `nonzero`. */
  fill(rule?: PaintFillRule): void;
  stroke(): void;
  /** Intersects the clip with the current path, until the next `restore`. */
  clip(rule?: PaintFillRule): void;
  /**
   * One line of text at a baseline, in the current fill colour.
   *
   * Deliberately one line and not a paragraph: wrapping, bidi and
   * selection belong to the text node, which does them properly, and a
   * painter that needs them should draw a text node instead. This is
   * for the labels a chart puts on its own axes.
   */
  text(value: string, x: number, y: number, style?: PaintTextStyle): void;
  /** Draws an image into a rectangle, stretched to fill it. */
  image(image: UiImage, x: number, y: number, width: number, height: number): void;
}

export type PaintFillRule = 'nonzero' | 'evenodd';
export type PaintLineCap = 'butt' | 'round' | 'square';
export type PaintLineJoin = 'miter' | 'round' | 'bevel';
export type PaintTextAlign = 'left' | 'center' | 'right';

/** The little of a text style a single painted line can carry. */
export interface PaintTextStyle {
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly fontWeight?: number | string;
  /** Which end of the run `x` names. Defaults to `left`. */
  readonly align?: PaintTextAlign;
}

/**
 * The box a painter is asked to fill, in its own coordinates.
 *
 * The node's border box, not its content box: a painter that wants to
 * respect padding is told what it is and decides, because a gauge
 * drawn to the edge and a chart inset by its padding are both
 * legitimate and the property set cannot tell which was meant.
 */
export interface PaintBox {
  readonly width: number;
  readonly height: number;
  readonly paddingTop: number;
  readonly paddingRight: number;
  readonly paddingBottom: number;
  readonly paddingLeft: number;
  /**
   * Physical pixels per logical pixel the picture is being made at.
   *
   * The one thing a painter needs the device for: `1 / scale` is a
   * hairline, and a grid line drawn at `1` on a retina display is two
   * physical pixels wide and looks it.
   */
  readonly scale: number;
}

/**
 * What a node's `paint` prop holds: the drawing, and what it depends
 * on.
 *
 * `inputs` is the whole of the cost story. The picture is made when
 * the inputs change and at no other time, so a painted node on a
 * still frame costs one image draw and nothing else, and
 * `PaintPicture.budget.spec.ts` asserts exactly that. Without it the
 * only safe assumption would be that the closure captured something
 * new, and every frame would repaint.
 *
 * Values are compared with `Object.is`, one by one, so a list of
 * numbers or of stable references works and an array literal rebuilt
 * per render does not defeat it. Omitting `inputs` means the drawing
 * never changes on its own, which is the right default for a static
 * shape and the wrong one for a chart.
 */
export interface UiPaint {
  readonly draw: (surface: PaintSurface, box: PaintBox) => void;
  readonly inputs?: readonly unknown[];
  /**
   * The size the node takes when the layout has none to give it: no
   * width or height, no flex, nothing stretching it. Zero, like any
   * other empty leaf, when it is absent.
   */
  readonly intrinsicWidth?: number;
  readonly intrinsicHeight?: number;
}

/**
 * A static vector shape, as a property rather than a function.
 *
 * The declarative half of this workstream: an icon, a logo, a
 * decorative rule, anything whose geometry is fixed and whose colours
 * follow the theme. It is drawn through the same surface a painter
 * writes to, so there is no second path to keep in step, and a node
 * may carry both a `path` and a `paint` (the path is drawn first, and
 * the painter draws over it).
 */
export interface UiPath {
  /** SVG path data, in `viewBox` units. */
  readonly d: string;
  /**
   * The square the path is authored in, scaled to fit the node's box
   * as `object-fit: contain` would, and centred in it. Omitted means
   * the path is already in the node's own logical pixels.
   */
  readonly viewBox?: number;
  readonly fill?: UiColorValue;
  readonly fillRule?: PaintFillRule;
  readonly stroke?: UiColorValue;
  readonly strokeWidth?: number;
  readonly lineCap?: PaintLineCap;
  readonly lineJoin?: PaintLineJoin;
  readonly miterLimit?: number;
  readonly dash?: readonly number[];
  readonly dashOffset?: number;
}

/**
 * Whether two `paint` values would draw the same picture.
 *
 * Identity on `draw` plus item-by-item identity on `inputs`, which is
 * the comparison the property registry runs on every write. A painter
 * rebuilt by a render body has a new `draw`, so a component that wants
 * the caching has to hoist the function and vary the inputs, which is
 * the same rule a modifier's arguments follow.
 */
export function paintValuesEqual(a: UiPaint | undefined, b: UiPaint | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined) {
    return false;
  }
  if (a.draw !== b.draw || a.intrinsicWidth !== b.intrinsicWidth || a.intrinsicHeight !== b.intrinsicHeight) {
    return false;
  }
  return inputsEqual(a.inputs, b.inputs);
}

/** Item-by-item identity, with absent and empty treated alike. */
export function inputsEqual(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  const left = a ?? EMPTY_INPUTS;
  const right = b ?? EMPTY_INPUTS;
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i++) {
    if (!Object.is(left[i], right[i])) {
      return false;
    }
  }
  return true;
}

const EMPTY_INPUTS: readonly unknown[] = Object.freeze([]);

/** Whether two `path` values describe the same shape in the same style. */
export function pathValuesEqual(a: UiPath | undefined, b: UiPath | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined) {
    return false;
  }
  return (
    a.d === b.d &&
    a.viewBox === b.viewBox &&
    a.fill === b.fill &&
    a.fillRule === b.fillRule &&
    a.stroke === b.stroke &&
    a.strokeWidth === b.strokeWidth &&
    a.lineCap === b.lineCap &&
    a.lineJoin === b.lineJoin &&
    a.miterLimit === b.miterLimit &&
    a.dashOffset === b.dashOffset &&
    inputsEqual(a.dash, b.dash)
  );
}
