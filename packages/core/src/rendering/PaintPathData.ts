import type { PaintSurface } from './PaintSurface';

/**
 * SVG path data, as calls on a `PaintSurface`.
 *
 * `IconRasterizer` hands its `d` string to `Path2D` and lets the
 * browser do this. That is the right call there, because an icon is
 * only ever rasterised in a browser, and it is the wrong call here for
 * two reasons: `Path2D` does not exist in the suite, so nothing about
 * a path could be asserted without a browser, and a recording that
 * held an opaque `Path2D` could not be compared, replayed or handed to
 * a second backend, which is the whole design.
 *
 * The grammar is the full one: `M L H V C S Q T A Z`, upper case
 * absolute and lower case relative, repeated coordinate sets after one
 * command letter, and the shorthand curves' reflected control points.
 * An unknown letter ends the parse rather than throwing, because a
 * half-drawn logo is a better failure in front of a person than a
 * blank frame.
 */
export function tracePathData(surface: PaintSurface, d: string): void {
  const scanner = new Scanner(d);
  // Where the pen is, and where the subpath started, so `Z` and a
  // relative command after it both have an origin.
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  // The previous curve's second control point, reflected by `S` and
  // `T`. Null after anything that is not a curve of the matching kind,
  // which is what the specification says the reflection falls back on.
  let lastCubic: [number, number] | null = null;
  let lastQuadratic: [number, number] | null = null;
  let command = '';

  for (;;) {
    scanner.skipSeparators();
    if (scanner.done) {
      return;
    }
    const next = scanner.peekCommand();
    if (next !== undefined) {
      command = next;
    } else if (command === '') {
      return;
    } else if (command === 'M') {
      // A repeated coordinate set after `M` is a line, which is the
      // one place the implicit command is not the one just written.
      command = 'L';
    } else if (command === 'm') {
      command = 'l';
    }
    const relative = command >= 'a';
    const upper = relative ? command.toUpperCase() : command;
    const originX = relative ? x : 0;
    const originY = relative ? y : 0;

    switch (upper) {
      case 'M': {
        x = scanner.number() + originX;
        y = scanner.number() + originY;
        startX = x;
        startY = y;
        surface.moveTo(x, y);
        lastCubic = null;
        lastQuadratic = null;
        break;
      }
      case 'L': {
        x = scanner.number() + originX;
        y = scanner.number() + originY;
        surface.lineTo(x, y);
        lastCubic = null;
        lastQuadratic = null;
        break;
      }
      case 'H': {
        x = scanner.number() + originX;
        surface.lineTo(x, y);
        lastCubic = null;
        lastQuadratic = null;
        break;
      }
      case 'V': {
        y = scanner.number() + originY;
        surface.lineTo(x, y);
        lastCubic = null;
        lastQuadratic = null;
        break;
      }
      case 'C': {
        const c1x = scanner.number() + originX;
        const c1y = scanner.number() + originY;
        const c2x = scanner.number() + originX;
        const c2y = scanner.number() + originY;
        x = scanner.number() + originX;
        y = scanner.number() + originY;
        surface.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
        lastCubic = [c2x, c2y];
        lastQuadratic = null;
        break;
      }
      case 'S': {
        const [c1x, c1y] = reflect(lastCubic, x, y);
        const c2x = scanner.number() + originX;
        const c2y = scanner.number() + originY;
        x = scanner.number() + originX;
        y = scanner.number() + originY;
        surface.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
        lastCubic = [c2x, c2y];
        lastQuadratic = null;
        break;
      }
      case 'Q': {
        const cx = scanner.number() + originX;
        const cy = scanner.number() + originY;
        x = scanner.number() + originX;
        y = scanner.number() + originY;
        surface.quadraticCurveTo(cx, cy, x, y);
        lastQuadratic = [cx, cy];
        lastCubic = null;
        break;
      }
      case 'T': {
        const [cx, cy] = reflect(lastQuadratic, x, y);
        x = scanner.number() + originX;
        y = scanner.number() + originY;
        surface.quadraticCurveTo(cx, cy, x, y);
        lastQuadratic = [cx, cy];
        lastCubic = null;
        break;
      }
      case 'A': {
        const rx = scanner.number();
        const ry = scanner.number();
        const rotation = (scanner.number() * Math.PI) / 180;
        const largeArc = scanner.flag();
        const sweep = scanner.flag();
        const endX = scanner.number() + originX;
        const endY = scanner.number() + originY;
        arcToCurves(surface, x, y, rx, ry, rotation, largeArc, sweep, endX, endY);
        x = endX;
        y = endY;
        lastCubic = null;
        lastQuadratic = null;
        break;
      }
      case 'Z': {
        surface.closePath();
        x = startX;
        y = startY;
        lastCubic = null;
        lastQuadratic = null;
        break;
      }
      default:
        return;
    }
  }
}

/** The previous control point mirrored through the current point. */
function reflect(control: [number, number] | null, x: number, y: number): [number, number] {
  return control === null ? [x, y] : [2 * x - control[0], 2 * y - control[1]];
}

/**
 * An elliptical arc as cubic segments, by the endpoint-to-centre
 * conversion in the SVG specification's implementation notes.
 *
 * Nothing in the surface draws an ellipse, and nothing should: an arc
 * with a rotation and two radii is the only shape in the grammar that
 * a rectangle-and-curve vocabulary cannot state, and one conversion
 * here is cheaper than a primitive every consumer of the recording
 * would have to implement. Ninety degrees per segment keeps the error
 * far under a tenth of a pixel at icon sizes.
 */
function arcToCurves(
  surface: PaintSurface,
  x0: number,
  y0: number,
  rx: number,
  ry: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean,
  x1: number,
  y1: number
): void {
  if (x0 === x1 && y0 === y1) {
    return;
  }
  let radiusX = Math.abs(rx);
  let radiusY = Math.abs(ry);
  if (radiusX === 0 || radiusY === 0) {
    // A degenerate radius is a straight line, which is what the
    // specification says and what an exported path occasionally holds.
    surface.lineTo(x1, y1);
    return;
  }
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = (x0 - x1) / 2;
  const dy = (y0 - y1) / 2;
  const px = cos * dx + sin * dy;
  const py = -sin * dx + cos * dy;
  // Radii too small to join the endpoints are grown until they just
  // do, rather than the arc being dropped.
  const lambda = (px * px) / (radiusX * radiusX) + (py * py) / (radiusY * radiusY);
  if (lambda > 1) {
    const grow = Math.sqrt(lambda);
    radiusX *= grow;
    radiusY *= grow;
  }
  const numerator = radiusX * radiusX * radiusY * radiusY - radiusX * radiusX * py * py - radiusY * radiusY * px * px;
  const denominator = radiusX * radiusX * py * py + radiusY * radiusY * px * px;
  const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxPrime = (factor * radiusX * py) / radiusY;
  const cyPrime = (-factor * radiusY * px) / radiusX;
  const cx = cos * cxPrime - sin * cyPrime + (x0 + x1) / 2;
  const cy = sin * cxPrime + cos * cyPrime + (y0 + y1) / 2;

  const start = Math.atan2((py - cyPrime) / radiusY, (px - cxPrime) / radiusX);
  const end = Math.atan2((-py - cyPrime) / radiusY, (-px - cxPrime) / radiusX);
  let sweepAngle = end - start;
  if (!sweep && sweepAngle > 0) {
    sweepAngle -= 2 * Math.PI;
  } else if (sweep && sweepAngle < 0) {
    sweepAngle += 2 * Math.PI;
  }

  const segments = Math.max(1, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 2)));
  const step = sweepAngle / segments;
  // The control-point distance that makes a cubic match a circular arc
  // of `step` radians; 4/3 tan(step/4) is the standard value.
  const handle = (4 / 3) * Math.tan(step / 4);
  let angle = start;
  for (let i = 0; i < segments; i++) {
    const next = angle + step;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const cosB = Math.cos(next);
    const sinB = Math.sin(next);
    const p1 = onEllipse(cx, cy, radiusX, radiusY, cos, sin, cosA - handle * sinA, sinA + handle * cosA);
    const p2 = onEllipse(cx, cy, radiusX, radiusY, cos, sin, cosB + handle * sinB, sinB - handle * cosB);
    const p3 = onEllipse(cx, cy, radiusX, radiusY, cos, sin, cosB, sinB);
    surface.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    angle = next;
  }
}

/** A point on the rotated ellipse, from its unit-circle coordinates. */
function onEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  cos: number,
  sin: number,
  ux: number,
  uy: number
): [number, number] {
  const x = rx * ux;
  const y = ry * uy;
  return [cx + cos * x - sin * y, cy + sin * x + cos * y];
}

/**
 * A cursor over path data.
 *
 * Path data is written without separators wherever it can be
 * (`M0 0l5-3.5`), so nothing here can split on whitespace: numbers are
 * read character by character, and the two arc flags are read as a
 * single digit each, which is the one place the grammar is not a plain
 * number list.
 */
class Scanner {
  private index = 0;

  constructor(private readonly source: string) {}

  get done(): boolean {
    return this.index >= this.source.length;
  }

  skipSeparators(): void {
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index);
      // space, tab, newline, carriage return, form feed, comma
      if (code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 44) {
        this.index++;
        continue;
      }
      return;
    }
  }

  /** The command letter here, consumed; undefined when a number is next. */
  peekCommand(): string | undefined {
    const char = this.source[this.index];
    if (char === undefined || !/[a-zA-Z]/.test(char)) {
      return undefined;
    }
    this.index++;
    return char;
  }

  number(): number {
    this.skipSeparators();
    const start = this.index;
    if (this.source[this.index] === '+' || this.source[this.index] === '-') {
      this.index++;
    }
    while (this.isDigit()) {
      this.index++;
    }
    if (this.source[this.index] === '.') {
      this.index++;
      while (this.isDigit()) {
        this.index++;
      }
    }
    const exponent = this.source[this.index];
    if (exponent === 'e' || exponent === 'E') {
      this.index++;
      if (this.source[this.index] === '+' || this.source[this.index] === '-') {
        this.index++;
      }
      while (this.isDigit()) {
        this.index++;
      }
    }
    const value = Number.parseFloat(this.source.slice(start, this.index));
    return Number.isNaN(value) ? 0 : value;
  }

  /** One character, `0` or `1`: the arc flags carry no separator. */
  flag(): boolean {
    this.skipSeparators();
    const char = this.source[this.index];
    this.index++;
    return char === '1';
  }

  private isDigit(): boolean {
    const code = this.source.charCodeAt(this.index);
    return code >= 48 && code <= 57;
  }
}
