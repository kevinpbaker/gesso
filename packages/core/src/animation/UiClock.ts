import type { UiNode } from '../graph/UiNode';
import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import type { UiMotion } from '../environment/UiMotion';

/**
 * How time passes for the animations under a node: at a speed of its
 * own, or not at all.
 *
 * A node provides one to its subtree,
 * `provide={[provided(UiEnvironmentKeys.clock, clock)]}`, and every
 * animation started there runs on it: a transition, a `motion` state,
 * hover and press, and `AnimationService.animate` given the node it
 * animates `on`. Nothing provided is real time.
 *
 * What a design tool needs to show one screen two ways at once. The
 * frames on its board are pictures: under a `settled` clock every
 * animation lands where it is going the moment it starts, and a loop
 * holds still. The screen it plays runs at the person's own speed, a
 * quarter of it to watch a press closely, or paused. Reduced motion and
 * a hidden page are the whole app's; this is one part of it.
 *
 * An animation takes all its time from the driver, which hands each
 * the local time of its clock, so nothing inside a tween or a spring
 * knows; and the driver asks for the next frame in real time, so a
 * slowed clock asks for frames as often as it needs them and a paused
 * one asks for none.
 */
export class UiClock {
  private rate: number;
  /** A real time and the local time it was, from the last change of speed: where local time is measured from. */
  private anchor: { real: number; local: number } | null = null;
  /** The real time last asked about, where a change of speed takes effect. */
  private lastReal: number | null = null;

  /** Every animation lands where it is going, and none runs. */
  settled: boolean;

  /**
   * Animations that reach their end stay, held there, rather than
   * finishing: so moving the time back (`seek`) plays them back. What a
   * design tool scrubs a transition with; let go, they finish as they
   * would have. A spring, which is worked out step by step rather than
   * from the time, holds but does not run back.
   */
  holding = false;

  /** Bumped by `seek`, so a driver knows to draw again at the new time. */
  moves = 0;

  constructor(options: { readonly speed?: number; readonly settled?: boolean } = {}) {
    this.rate = checkedSpeed(options.speed ?? 1);
    this.settled = options.settled ?? false;
  }

  /** How fast time passes: 1 is real time, 0.25 a quarter of it, 0 paused. */
  get speed(): number {
    return this.rate;
  }

  set speed(next: number) {
    const speed = checkedSpeed(next);
    if (this.anchor !== null && this.lastReal !== null) {
      this.anchor = { real: this.lastReal, local: this.local(this.lastReal) };
    }
    this.rate = speed;
  }

  /** The local time now, as last asked: where a seek is measured from. */
  get now(): number {
    return this.lastReal === null ? 0 : this.local(this.lastReal);
  }

  /**
   * Puts local time at `at`, from now on: forward, or back to replay
   * what is held (`holding`). Paused, it stays there; running, it goes
   * on from there.
   */
  seek(at: number): void {
    const real = this.lastReal ?? 0;
    this.anchor = { real, local: at };
    this.moves += 1;
  }

  /** The local time at real time `now`. The first time asked, the two agree. */
  local(now: number): number {
    this.anchor ??= { real: now, local: now };
    this.lastReal = now;
    return this.anchor.local + (now - this.anchor.real) * this.rate;
  }

  /** The real time at which local time `at` comes; Infinity while paused. */
  real(at: number): number {
    if (this.anchor === null) {
      return at;
    }
    if (this.rate === 0) {
      return Infinity;
    }
    return this.anchor.real + (at - this.anchor.local) / this.rate;
  }
}

function checkedSpeed(speed: number): number {
  if (!(speed >= 0) || !Number.isFinite(speed)) {
    throw new Error(`A clock's speed is a number of 0 or more (0 is paused, 1 real time), not ${speed}.`);
  }
  return speed;
}

/** The motion vocabulary names resolve to under `node`: the nearest provided above it, or Gesso's. */
export function motionOf(node: UiNode | null | undefined): UiMotion {
  for (let at: UiNode | null = node ?? null; at !== null; at = at.parent) {
    if (at.environment !== null) {
      return at.environment.get(UiEnvironmentKeys.motion);
    }
  }
  return UiEnvironmentKeys.motion.defaultValue;
}

/** The clock the animations under `node` run on: the nearest one provided above it, or null for real time. */
export function clockOf(node: UiNode | null | undefined): UiClock | null {
  for (let at: UiNode | null = node ?? null; at !== null; at = at.parent) {
    if (at.environment !== null) {
      return at.environment.get(UiEnvironmentKeys.clock);
    }
  }
  return null;
}
