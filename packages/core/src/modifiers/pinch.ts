import { UiEventType, type UiPinchEvent, type UiWheelEvent } from '../input/UiInputEvent';
import { defineModifier, type UiModifier } from './UiModifier';
import type { UiModifierHost } from './UiModifierHost';

/** Where a zoomable node has got to. */
export interface ZoomState {
  readonly scale: number;
  /** Degrees, matching the transform property's own units. */
  readonly rotation: number;
  readonly translateX: number;
  readonly translateY: number;
}

export interface PinchableOptions {
  /** How far it may be zoomed out. Default 1, which is "no smaller than declared". */
  readonly minScale?: number;
  /** How far in. Default 8. */
  readonly maxScale?: number;
  /**
   * Whether two fingers twisting also rotate the node. Default false.
   *
   * Off by default because rotation is a gesture people make by
   * accident: a pinch on a photo is never perfectly parallel, and a
   * viewer that rotates two degrees every time it is zoomed feels
   * broken. A map or a canvas of freeform objects turns it on.
   */
  readonly rotate?: boolean;
  /**
   * Whether Ctrl (or Command) with the wheel zooms as well. Default
   * true.
   *
   * A trackpad pinch reaches the browser as exactly this, and it is
   * also the only way a mouse can zoom at all, so a zoomable node that
   * answers only to two fingers is a zoomable node most people cannot
   * zoom.
   */
  readonly wheel?: boolean;
  /** How much of a zoom one wheel notch is worth. Default 0.0015 per pixel of delta. */
  readonly wheelSensitivity?: number;
  /** Told whenever the zoom changes, for a readout or a reset button. */
  readonly onChange?: (state: ZoomState) => void;
}

/**
 * Makes a node zoomable by two fingers, or by Ctrl and the wheel.
 *
 * Pinch was deferred partly on the ground that "what a
 * framework should do with a pinch when it owns no zoom is a design
 * question this work did not need to answer". This is the answer: the
 * framework owns no zoom, and this modifier does. Nothing listens for a
 * pinch unless an element asks for it, exactly as nothing hovers unless
 * an element asks for it, which is the whole shape of
 * the modifier contract.
 *
 * ## It zooms about the gesture, not about the middle
 *
 * The point under the fingers stays under the fingers. That is the
 * difference between a photo viewer that feels like a photo viewer and
 * one that scales about its own centre and slides the thing you were
 * looking at off the edge. Each gesture holds the node-local point the
 * pinch started on and solves the translation that keeps it in place,
 * which is also why a two-finger pan and a pinch are one gesture here
 * rather than two that fight over the same transform.
 *
 * ## What it does to the transform
 *
 * It writes `scaleX`, `scaleY`, `rotation` and the translation as one
 * override, with the pivot at the node's own origin. A transform the
 * element declared is read once at attach and used as the **starting
 * state** rather than composed with: a photo that starts at 1.5x zooms
 * out to 1x, which is what an application that declared 1.5x meant,
 * and composing would have made its lower bound 1.5 without saying so.
 */
const kind = defineModifier<PinchableOptions>({
  name: 'pinchable',
  attach(host, options) {
    zoomers.set(host, new Pinchable(host, options).attach());
  },
  update(host, options) {
    zoomers.get(host)?.setOptions(options);
  }
});

const zoomers = new WeakMap<UiModifierHost, Pinchable>();

/** Makes a node zoomable. Hoist the options object, as every modifier asks. */
export function pinchable(options: PinchableOptions = EMPTY_OPTIONS): UiModifier<PinchableOptions> {
  return kind(options);
}

const EMPTY_OPTIONS: PinchableOptions = Object.freeze({});

class Pinchable {
  private scale = 1;
  private rotation = 0;
  private translateX = 0;
  private translateY = 0;

  /** The gesture's own baseline, so its cumulative scale is relative to it. */
  private startScale = 1;
  private startRotation = 0;

  constructor(
    private readonly host: UiModifierHost,
    private options: PinchableOptions
  ) {}

  attach(): this {
    const declared = this.host.get<Record<string, unknown> | null | undefined>('transform');
    if (declared !== undefined && declared !== null) {
      this.scale = numberOr(declared.scaleX, 1);
      this.rotation = numberOr(declared.rotation, 0);
      this.translateX = numberOr(declared.translateX, 0);
      this.translateY = numberOr(declared.translateY, 0);
    }
    this.host.on(UiEventType.PinchStart, event => this.start(event as UiPinchEvent));
    this.host.on(UiEventType.PinchMove, event => this.pinch(event as UiPinchEvent));
    this.host.on(UiEventType.Wheel, event => this.wheel(event as UiWheelEvent));
    return this;
  }

  setOptions(options: PinchableOptions): void {
    this.options = options;
  }

  /** Where the node has got to, for a reset button or a readout. */
  get state(): ZoomState {
    return {
      scale: this.scale,
      rotation: this.rotation,
      translateX: this.translateX,
      translateY: this.translateY
    };
  }

  private start(event: UiPinchEvent): void {
    event.stopPropagation();
    this.startScale = this.scale;
    this.startRotation = this.rotation;
  }

  private pinch(event: UiPinchEvent): void {
    event.stopPropagation();
    const rotation = this.options.rotate === true ? this.startRotation + event.rotation : this.rotation;
    this.applyAt(event.x, event.y, this.startScale * event.scale, rotation, event.translateX, event.translateY);
  }

  private wheel(event: UiWheelEvent): void {
    if (this.options.wheel === false) {
      return;
    }
    if (!event.modifiers.ctrl && !event.modifiers.meta) {
      return;
    }
    // The wheel was spent here, so the container underneath does not
    // scroll on the same notch.
    event.preventDefault();
    event.stopPropagation();
    const sensitivity = this.options.wheelSensitivity ?? 0.0015;
    // Exponential rather than linear: a fixed fraction per notch means
    // zooming in and back out by the same number of notches lands
    // exactly where it started.
    const factor = Math.exp(-event.deltaY * sensitivity);
    this.applyAt(event.x, event.y, this.scale * factor, this.rotation, 0, 0);
  }

  /**
   * Moves to a new scale and rotation while holding one point still.
   *
   * `anchorX`/`anchorY` are in canvas space, and the node's layout box
   * is where the node sits before this modifier's transform, so the
   * anchor is turned into a node-local point under the *current*
   * transform, then the translation that puts that same local point
   * back under the anchor at the *new* transform is solved directly.
   * Doing it in one step rather than accumulating deltas is what keeps
   * a long gesture from drifting.
   */
  private applyAt(anchorX: number, anchorY: number, scale: number, rotation: number, panX: number, panY: number): void {
    const box = this.host.layoutBox();
    if (box === null) {
      return;
    }
    const clamped = Math.min(Math.max(scale, this.options.minScale ?? 1), this.options.maxScale ?? 8);
    const localX = anchorX - box.x - this.translateX;
    const localY = anchorY - box.y - this.translateY;
    const [unrotatedX, unrotatedY] = unapply(localX, localY, this.scale, this.rotation);
    const [reappliedX, reappliedY] = apply(unrotatedX, unrotatedY, clamped, rotation);
    this.scale = clamped;
    this.rotation = rotation;
    this.translateX = anchorX + panX - box.x - reappliedX;
    this.translateY = anchorY + panY - box.y - reappliedY;
    this.write();
  }

  private write(): void {
    this.host.set('transform', {
      x: 0,
      y: 0,
      translateX: this.translateX,
      translateY: this.translateY,
      scaleX: this.scale,
      scaleY: this.scale,
      rotation: this.rotation
    });
    this.options.onChange?.(this.state);
  }
}

/** Rotates and scales a node-local point, the way the renderers do. */
function apply(x: number, y: number, scale: number, degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [(x * cos - y * sin) * scale, (x * sin + y * cos) * scale];
}

/** The inverse of `apply`, for turning a screen offset back into a local point. */
function unapply(x: number, y: number, scale: number, degrees: number): [number, number] {
  if (scale === 0) {
    return [0, 0];
  }
  const radians = (-degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const sx = x / scale;
  const sy = y / scale;
  return [sx * cos - sy * sin, sx * sin + sy * cos];
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
