import type { UiColorValue } from '../properties/UiPropertyValues';
import type { UiGradient } from '../properties/UiGradient';
import type { UiImage } from '../properties/UiImage';
import { tracePathData } from './PaintPathData';
import type { PaintFillRule, PaintLineCap, PaintLineJoin, PaintSurface, PaintTextStyle } from './PaintSurface';

/**
 * One call a painter made, as data.
 *
 * The union mirrors `PaintSurface` one method to one variant, and
 * deliberately keeps `translate`, `scale` and `rotate` apart from the
 * general `transform` they could all collapse into: a replay onto a
 * real context should make the call the painter made, both because it
 * is cheaper and because the renderer parity decoder reads those three
 * by name.
 */
export type PaintOp =
  | { readonly op: 'save' }
  | { readonly op: 'restore' }
  | { readonly op: 'translate'; readonly x: number; readonly y: number }
  | { readonly op: 'scale'; readonly x: number; readonly y: number }
  | { readonly op: 'rotate'; readonly angle: number }
  | {
      readonly op: 'transform';
      readonly a: number;
      readonly b: number;
      readonly c: number;
      readonly d: number;
      readonly e: number;
      readonly f: number;
    }
  | { readonly op: 'beginPath' }
  | { readonly op: 'moveTo'; readonly x: number; readonly y: number }
  | { readonly op: 'lineTo'; readonly x: number; readonly y: number }
  | {
      readonly op: 'quadraticCurveTo';
      readonly cx: number;
      readonly cy: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly op: 'bezierCurveTo';
      readonly c1x: number;
      readonly c1y: number;
      readonly c2x: number;
      readonly c2y: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly op: 'arc';
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      readonly startAngle: number;
      readonly endAngle: number;
      readonly counterclockwise: boolean;
    }
  | { readonly op: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  | {
      readonly op: 'roundRect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly radius: number;
    }
  | { readonly op: 'closePath' }
  | { readonly op: 'fillColor'; readonly color: UiColorValue }
  | {
      readonly op: 'fillGradient';
      readonly gradient: UiGradient;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | { readonly op: 'strokeColor'; readonly color: UiColorValue }
  | { readonly op: 'lineWidth'; readonly width: number }
  | { readonly op: 'lineCap'; readonly cap: PaintLineCap }
  | { readonly op: 'lineJoin'; readonly join: PaintLineJoin }
  | { readonly op: 'miterLimit'; readonly limit: number }
  | { readonly op: 'lineDash'; readonly segments: readonly number[]; readonly offset: number }
  | { readonly op: 'alpha'; readonly value: number }
  | { readonly op: 'blur'; readonly radius: number }
  | { readonly op: 'fill'; readonly rule: PaintFillRule }
  | { readonly op: 'stroke' }
  | { readonly op: 'clip'; readonly rule: PaintFillRule }
  | {
      readonly op: 'text';
      readonly value: string;
      readonly x: number;
      readonly y: number;
      readonly style: PaintTextStyle | undefined;
    }
  | {
      readonly op: 'image';
      readonly image: UiImage;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };

/**
 * What a painter drew, as an ordered list of calls.
 *
 * This is the object that makes the two backends agree, and it is
 * worth being precise about how. A painter does not draw; it describes
 * a drawing, once, when its inputs change. The description is then
 * turned into pixels in exactly one place, so there is no second
 * implementation of `arc`, of the even-odd rule or of a dash pattern
 * for a backend to get subtly wrong. `decisions/0078` is the argument
 * for that shape over the obvious alternative, which is for each
 * renderer to replay the recording in its own vocabulary.
 */
export interface PaintRecording {
  readonly ops: readonly PaintOp[];
}

/** A recording with nothing in it, for a painter that drew nothing. */
export const EMPTY_RECORDING: PaintRecording = Object.freeze({ ops: Object.freeze([]) as readonly PaintOp[] });

/**
 * The `PaintSurface` a painter is actually handed.
 *
 * Every call is one push. Nothing is validated, coalesced or
 * normalised on the way in: a recorder that dropped a redundant
 * `lineWidth` would be deciding what the picture is, and the whole
 * value of the recording is that it is what the painter said.
 */
export class PaintRecorder implements PaintSurface {
  private readonly recorded: PaintOp[] = [];

  /** The recording so far. Safe to keep; the recorder is done with it. */
  finish(): PaintRecording {
    return { ops: this.recorded };
  }

  save(): void {
    this.recorded.push(SAVE);
  }

  restore(): void {
    this.recorded.push(RESTORE);
  }

  translate(x: number, y: number): void {
    this.recorded.push({ op: 'translate', x, y });
  }

  scale(x: number, y: number): void {
    this.recorded.push({ op: 'scale', x, y });
  }

  rotate(angle: number): void {
    this.recorded.push({ op: 'rotate', angle });
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.recorded.push({ op: 'transform', a, b, c, d, e, f });
  }

  beginPath(): void {
    this.recorded.push(BEGIN_PATH);
  }

  moveTo(x: number, y: number): void {
    this.recorded.push({ op: 'moveTo', x, y });
  }

  lineTo(x: number, y: number): void {
    this.recorded.push({ op: 'lineTo', x, y });
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.recorded.push({ op: 'quadraticCurveTo', cx, cy, x, y });
  }

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.recorded.push({ op: 'bezierCurveTo', c1x, c1y, c2x, c2y, x, y });
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise = false): void {
    this.recorded.push({ op: 'arc', x, y, radius, startAngle, endAngle, counterclockwise });
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.recorded.push({ op: 'rect', x, y, width, height });
  }

  roundRect(x: number, y: number, width: number, height: number, radius: number): void {
    this.recorded.push({ op: 'roundRect', x, y, width, height, radius });
  }

  closePath(): void {
    this.recorded.push(CLOSE_PATH);
  }

  /**
   * The one call that is not one op: path data expands into the moves
   * and curves it names, so a recording never holds a string that has
   * to be parsed again at replay, and a `d` string and the equivalent
   * hand-written calls produce byte-identical recordings.
   */
  path(d: string): void {
    tracePathData(this, d);
  }

  fillColor(color: UiColorValue): void {
    this.recorded.push({ op: 'fillColor', color });
  }

  fillGradient(gradient: UiGradient, x: number, y: number, width: number, height: number): void {
    this.recorded.push({ op: 'fillGradient', gradient, x, y, width, height });
  }

  strokeColor(color: UiColorValue): void {
    this.recorded.push({ op: 'strokeColor', color });
  }

  lineWidth(width: number): void {
    this.recorded.push({ op: 'lineWidth', width });
  }

  lineCap(cap: PaintLineCap): void {
    this.recorded.push({ op: 'lineCap', cap });
  }

  lineJoin(join: PaintLineJoin): void {
    this.recorded.push({ op: 'lineJoin', join });
  }

  miterLimit(limit: number): void {
    this.recorded.push({ op: 'miterLimit', limit });
  }

  lineDash(segments: readonly number[], offset = 0): void {
    this.recorded.push({ op: 'lineDash', segments, offset });
  }

  alpha(value: number): void {
    this.recorded.push({ op: 'alpha', value });
  }

  blur(radius: number): void {
    this.recorded.push({ op: 'blur', radius });
  }

  fill(rule: PaintFillRule = 'nonzero'): void {
    this.recorded.push({ op: 'fill', rule });
  }

  stroke(): void {
    this.recorded.push(STROKE);
  }

  clip(rule: PaintFillRule = 'nonzero'): void {
    this.recorded.push({ op: 'clip', rule });
  }

  text(value: string, x: number, y: number, style?: PaintTextStyle): void {
    this.recorded.push({ op: 'text', value, x, y, style });
  }

  image(image: UiImage, x: number, y: number, width: number, height: number): void {
    this.recorded.push({ op: 'image', image, x, y, width, height });
  }
}

// The argument-free ops are shared values rather than fresh objects: a
// path of a hundred segments emits a `beginPath` and a `closePath` per
// subpath, and they carry nothing to tell apart.
const SAVE: PaintOp = Object.freeze({ op: 'save' as const });
const RESTORE: PaintOp = Object.freeze({ op: 'restore' as const });
const BEGIN_PATH: PaintOp = Object.freeze({ op: 'beginPath' as const });
const CLOSE_PATH: PaintOp = Object.freeze({ op: 'closePath' as const });
const STROKE: PaintOp = Object.freeze({ op: 'stroke' as const });

/**
 * Replays a recording onto any surface.
 *
 * The surface is a `PaintSurface` and not a canvas, so a recording can
 * be replayed into a rasteriser, into another recorder, or into a spec
 * double that counts what it was asked to do. That is the property the
 * parity gate leans on: neither backend is the one this understands.
 */
export function replayPaint(recording: PaintRecording, surface: PaintSurface): void {
  for (const op of recording.ops) {
    switch (op.op) {
      case 'save':
        surface.save();
        break;
      case 'restore':
        surface.restore();
        break;
      case 'translate':
        surface.translate(op.x, op.y);
        break;
      case 'scale':
        surface.scale(op.x, op.y);
        break;
      case 'rotate':
        surface.rotate(op.angle);
        break;
      case 'transform':
        surface.transform(op.a, op.b, op.c, op.d, op.e, op.f);
        break;
      case 'beginPath':
        surface.beginPath();
        break;
      case 'moveTo':
        surface.moveTo(op.x, op.y);
        break;
      case 'lineTo':
        surface.lineTo(op.x, op.y);
        break;
      case 'quadraticCurveTo':
        surface.quadraticCurveTo(op.cx, op.cy, op.x, op.y);
        break;
      case 'bezierCurveTo':
        surface.bezierCurveTo(op.c1x, op.c1y, op.c2x, op.c2y, op.x, op.y);
        break;
      case 'arc':
        surface.arc(op.x, op.y, op.radius, op.startAngle, op.endAngle, op.counterclockwise);
        break;
      case 'rect':
        surface.rect(op.x, op.y, op.width, op.height);
        break;
      case 'roundRect':
        surface.roundRect(op.x, op.y, op.width, op.height, op.radius);
        break;
      case 'closePath':
        surface.closePath();
        break;
      case 'fillColor':
        surface.fillColor(op.color);
        break;
      case 'fillGradient':
        surface.fillGradient(op.gradient, op.x, op.y, op.width, op.height);
        break;
      case 'strokeColor':
        surface.strokeColor(op.color);
        break;
      case 'lineWidth':
        surface.lineWidth(op.width);
        break;
      case 'lineCap':
        surface.lineCap(op.cap);
        break;
      case 'lineJoin':
        surface.lineJoin(op.join);
        break;
      case 'miterLimit':
        surface.miterLimit(op.limit);
        break;
      case 'lineDash':
        surface.lineDash(op.segments, op.offset);
        break;
      case 'alpha':
        surface.alpha(op.value);
        break;
      case 'blur':
        surface.blur(op.radius);
        break;
      case 'fill':
        surface.fill(op.rule);
        break;
      case 'stroke':
        surface.stroke();
        break;
      case 'clip':
        surface.clip(op.rule);
        break;
      case 'text':
        surface.text(op.value, op.x, op.y, op.style);
        break;
      case 'image':
        surface.image(op.image, op.x, op.y, op.width, op.height);
        break;
    }
  }
}
