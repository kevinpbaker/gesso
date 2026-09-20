import type { UiNode } from '../graph/UiNode';
import { noKeyModifiers, UiEventType, UiPinchEvent, type UiKeyModifiers, type UiPointerDevice } from './UiInputEvent';
import type { UiInputDispatcher } from './UiInputDispatcher';

export interface PinchRecognizerOptions {
  /**
   * How far apart the contacts' separation must change, as a fraction
   * of where it started, before the gesture is claimed as a pinch.
   *
   * Two fingers land a few milliseconds apart and never perfectly
   * still, so a gesture claimed on the first move would report a scale
   * of 1.02 for a two-finger press that was going to be a pan.
   */
  scaleThreshold?: number;
  /** The same in degrees, for the rotation half. */
  rotationThreshold?: number;
}

/**
 * One contact, kept in a fixed slot rather than a map.
 *
 * The recognizer holds exactly two of these for the life of the
 * runtime and writes into them, because a pointer move that allocates
 * is a per-frame allocation on the hottest path the framework has.
 */
interface Contact {
  id: number;
  x: number;
  y: number;
  down: boolean;
}

/**
 * Turns two contacts into a scale, a rotation and a translation.
 *
 * Touch input left this out for two reasons. Both are answered here
 * rather than waved past.
 *
 * The first was that a pinch "would have to undo the rule that a press
 * ignores every other contact". It does not. That rule is about who
 * owns the *press*, and it stays exactly as it was: the first contact
 * keeps the press, and the second contact's events are still refused
 * by everything downstream of it. What changed is that the pointer
 * controller now tells its gesture recognizer about every contact it
 * sees before deciding whose press it is, through `contactDown`,
 * `contactMove` and `contactUp`. A second finger is no longer
 * silently dropped on the floor; it is dropped from the press and
 * handed here.
 *
 * The second was that "what a framework should do with a pinch when it
 * owns no zoom is a design question". The answer this takes is that it
 * should do nothing at all: there is no framework-owned zoom, no
 * `UiTouchScroller` equivalent listening at the root, and a pinch that
 * nothing listens for costs one dispatch that returns immediately.
 * The zoom lives in `pinchable`, a modifier an element opts into, on
 * the same terms as every other behaviour a modifier carries.
 *
 * What a pinch does take is the press. When the second contact lands,
 * whatever single-contact gesture was in flight is ended where it
 * stands and the press stops producing a Click, because a person who
 * has put a second finger down is no longer doing the thing the first
 * finger started. The pan gets a real `PanEnd` rather than being
 * abandoned, so a `draggable` in the middle of a drag puts the card
 * down instead of leaving it stuck to a finger that has moved on.
 */
export class UiPinchRecognizer {
  private readonly scaleThreshold: number;
  private readonly rotationThreshold: number;

  private readonly first: Contact = { id: -1, x: 0, y: 0, down: false };
  private readonly second: Contact = { id: -1, x: 0, y: 0, down: false };

  private target: UiNode | null = null;
  private modifiers: UiKeyModifiers = noKeyModifiers();

  /** Separation and angle when the second contact landed. */
  private startDistance = 0;
  private startAngle = 0;
  /** What was last reported, so each event carries a delta as well. */
  private lastScale = 1;
  private lastRotation = 0;
  private lastCenterX = 0;
  private lastCenterY = 0;
  private recognized = false;

  constructor(
    private readonly dispatcher: UiInputDispatcher,
    options: PinchRecognizerOptions = {}
  ) {
    this.scaleThreshold = options.scaleThreshold ?? 0.05;
    this.rotationThreshold = options.rotationThreshold ?? 4;
  }

  /** Whether two contacts are down and the gesture has been claimed. */
  get pinching(): boolean {
    return this.recognized;
  }

  /** Whether a second contact is down at all, claimed or not. */
  get holding(): boolean {
    return this.first.down && this.second.down;
  }

  /**
   * A contact landed. Returns true when this is the second one, which
   * is the moment the caller has to end whatever the first was doing.
   */
  contactDown(
    pointer: UiPointerDevice,
    x: number,
    y: number,
    target: UiNode | null,
    modifiers: UiKeyModifiers
  ): boolean {
    if (!this.first.down) {
      write(this.first, pointer.id, x, y);
      this.target = target;
      return false;
    }
    if (this.second.down || pointer.id === this.first.id) {
      // A third finger is not a second pinch. It is ignored until the
      // hand comes off, which is what every platform does.
      return false;
    }
    write(this.second, pointer.id, x, y);
    this.modifiers = modifiers;
    if (target !== null) {
      this.target = target;
    }
    this.startDistance = this.distance();
    this.startAngle = this.angle();
    this.lastScale = 1;
    this.lastRotation = 0;
    this.lastCenterX = (this.first.x + this.second.x) / 2;
    this.lastCenterY = (this.first.y + this.second.y) / 2;
    this.recognized = false;
    return true;
  }

  /** A contact moved. Emits PinchStart the first time past the threshold. */
  contactMove(pointer: UiPointerDevice, x: number, y: number): void {
    const contact = this.contactFor(pointer.id);
    if (contact === null) {
      return;
    }
    contact.x = x;
    contact.y = y;
    if (!this.holding || this.target === null || this.startDistance <= 0) {
      return;
    }
    const scale = this.distance() / this.startDistance;
    const rotation = normalizeDegrees(this.angle() - this.startAngle);
    if (!this.recognized) {
      if (Math.abs(scale - 1) < this.scaleThreshold && Math.abs(rotation) < this.rotationThreshold) {
        return;
      }
      this.recognized = true;
      this.emit(UiEventType.PinchStart, scale, rotation);
      return;
    }
    this.emit(UiEventType.PinchMove, scale, rotation);
  }

  /**
   * A contact left. A pinch needs both, so the gesture ends with the
   * first one to go and the other is left in place doing nothing until
   * it too comes off.
   */
  contactUp(pointer: UiPointerDevice): void {
    const contact = this.contactFor(pointer.id);
    if (contact === null) {
      return;
    }
    if (this.recognized) {
      this.emit(UiEventType.PinchEnd, this.lastScale, this.lastRotation);
      this.recognized = false;
    }
    contact.down = false;
    contact.id = -1;
    if (!this.first.down && !this.second.down) {
      this.target = null;
    }
  }

  /** Drops everything, for a cancelled press or a disposed runtime. */
  cancel(): void {
    this.recognized = false;
    this.first.down = false;
    this.first.id = -1;
    this.second.down = false;
    this.second.id = -1;
    this.target = null;
  }

  private contactFor(id: number): Contact | null {
    if (this.first.down && this.first.id === id) {
      return this.first;
    }
    if (this.second.down && this.second.id === id) {
      return this.second;
    }
    return null;
  }

  private distance(): number {
    return Math.hypot(this.second.x - this.first.x, this.second.y - this.first.y);
  }

  private angle(): number {
    return (Math.atan2(this.second.y - this.first.y, this.second.x - this.first.x) * 180) / Math.PI;
  }

  private emit(
    type: UiEventType.PinchStart | UiEventType.PinchMove | UiEventType.PinchEnd,
    scale: number,
    rotation: number
  ): void {
    const centerX = (this.first.x + this.second.x) / 2;
    const centerY = (this.first.y + this.second.y) / 2;
    const event = new UiPinchEvent(
      type,
      centerX,
      centerY,
      scale,
      rotation,
      scale - this.lastScale,
      rotation - this.lastRotation,
      centerX - this.lastCenterX,
      centerY - this.lastCenterY,
      this.modifiers
    );
    this.lastScale = scale;
    this.lastRotation = rotation;
    this.lastCenterX = centerX;
    this.lastCenterY = centerY;
    this.dispatcher.dispatch(event, this.target!);
  }
}

function write(contact: Contact, id: number, x: number, y: number): void {
  contact.id = id;
  contact.x = x;
  contact.y = y;
  contact.down = true;
}

/**
 * An angle difference brought back into (-180, 180].
 *
 * Two contacts crossing the -180/180 seam would otherwise report a
 * rotation of nearly a full turn for a movement of one degree, and a
 * transform written from it would spin the element.
 */
function normalizeDegrees(degrees: number): number {
  let value = degrees % 360;
  if (value > 180) {
    value -= 360;
  }
  if (value <= -180) {
    value += 360;
  }
  return value;
}
