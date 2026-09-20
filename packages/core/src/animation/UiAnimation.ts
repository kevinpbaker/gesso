import { Subject, type Observable } from 'rxjs';

import { interpolatorFor, type UiInterpolator } from './Interpolate';
import { easings, type UiEasing } from './UiEasing';
import type { UiSpringSpec } from '../environment/UiMotion';

/**
 * Anything an animation can drive.
 *
 * A cell, not a node: `State<T>` from the framework satisfies this by
 * having a `value` getter and setter, and so does the small adapter a
 * `transition` prop puts in front of a node's property. Keeping the
 * driver on this side of the line is what lets one mechanism serve
 * `animate(cell, …)`, the declarative `transition` prop and the layout
 * modifier without any of them knowing about the others.
 */
export interface AnimatedCell<T> {
  value: T;
}

/**
 * What reduced motion does to one animation.
 *
 * `snap` — the default and the right answer nearly always: the cell
 * jumps to its target and the animation never runs, so the end state
 * is identical and no time passes.
 *
 * `keep` — run anyway, for the animations where the movement *is* the
 * information. A `Spinner` that stops turning is not a calmer spinner,
 * it is a spinner that says work has stopped; WCAG 2.3.3 is about
 * motion triggered by interaction, and a busy indicator is not that.
 * Reach for it only when standing still would state something false.
 */
export type UiReducedMotionPolicy = 'snap' | 'keep';

export interface UiAnimationOptions {
  /**
   * Sample this animation at most this often, in milliseconds. Zero,
   * the default, means every frame.
   *
   * This is what keeps the media tier's promise about the `Spinner`:
   * eight blades have eight positions, so with `stepMs` at an eighth
   * of the turn the runtime wakes eight times a second rather than
   * sixty, and the driver reports it through `nextTickAt` so the
   * scheduler sleeps in between rather than spinning.
   */
  stepMs?: number;
  /** What a reduced-motion preference does to it. Defaults to `snap`. */
  reducedMotion?: UiReducedMotionPolicy;
  /**
   * Wait this many milliseconds before the first sample.
   *
   * The cell is left alone while it waits — not written with its
   * starting value — so a delayed animation costs nothing until it
   * begins, and `nextTickAt` reports the moment it will, which is what
   * keeps the scheduler asleep in between rather than spinning through
   * the delay.
   *
   * This is where staggering comes from: a list that enters with
   * `delay: index * 40` is forty milliseconds of offset per row and no
   * orchestration mechanism at all.
   */
  delay?: number;
}

export interface UiTweenOptions extends UiAnimationOptions {
  /** Milliseconds. Zero writes the target and completes without a frame. */
  duration: number;
  easing?: UiEasing;
  /** Restart from the beginning forever. A repeating tween is never done. */
  repeat?: boolean;
}

export interface UiSpringOptions extends UiAnimationOptions {
  spring: UiSpringSpec;
  /** Units per second at the start; a gesture hands over the velocity it ended with. */
  velocity?: number;
  /** How close counts as arrived. */
  restDelta?: number;
}

/**
 * One running animation.
 *
 * Subclasses differ only in `sample`. Everything else — the cell, the
 * observable, when the next sample is due, and not writing a value
 * that has not changed — is the same for a tween and for a spring, and
 * is the part the driver depends on.
 */
/** The most a sample may be taken early, in milliseconds. */
const MAX_DUE_SLACK_MS = 4;

export abstract class UiAnimation<T> {
  /** When the first tick reached it, on the frame clock. */
  protected startedAt = 0;
  private begun = false;
  private readonly subject = new Subject<T>();
  private lastSampledAt: number | null = null;
  private lastWritten: T | undefined;
  private finished = false;

  protected constructor(
    readonly cell: AnimatedCell<T>,
    private readonly stepMs: number,
    readonly reducedMotionPolicy: UiReducedMotionPolicy,
    private readonly delayMs = 0
  ) {}

  /**
   * Emits every value written to the cell, and completes when the
   * animation stops driving it — whether it arrived, was superseded by
   * another animation on the same cell, or was stopped. A caller that
   * needs to know which of the three reads the cell.
   */
  get values(): Observable<T> {
    return this.subject.asObservable();
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /** When this animation next wants a frame. */
  /**
   * How early a sample may be taken and still count as on time.
   *
   * Frames arrive on the display's refreshes, not on demand, so a
   * cadence that does not divide the refresh interval can only ever be
   * served early or late. Insisting on "not before due" makes that a
   * catastrophe rather than a rounding error: 59.94fps video has a
   * 16.683ms frame and a 60Hz display refreshes every 16.667ms, so
   * every due time falls 0.016ms after a refresh, every refresh is
   * turned away, and the video plays at half rate.
   *
   * Half a step, capped, because being early by a fraction of your own
   * interval is imperceptible while being early by a whole one would
   * be a dropped frame's worth of drift.
   */
  get dueSlackMs(): number {
    return Math.min(this.stepMs / 2, MAX_DUE_SLACK_MS);
  }

  dueAt(now: number): number {
    // Still waiting out its delay: the next frame it has any use for is
    // the one the delay ends on, so the scheduler can sleep until then
    // rather than waking sixty times to decide it is not ready.
    if (this.begun && now - this.startedAt < this.delayMs) {
      return this.startedAt + this.delayMs;
    }
    return this.lastSampledAt === null ? now : this.lastSampledAt + this.stepMs;
  }

  /** Where it is at `now`, and whether that is the end of it. */
  protected abstract sample(now: number, elapsedMs: number): { value: T; done: boolean };

  /**
   * Begins at `now`, on the first frame that advances it.
   *
   * Not at the moment it was asked for: `animate()` is called from a
   * click handler or a reconcile, which run on `performance.now()`,
   * while sampling runs on the frame clock — and under a manual clock
   * in a spec those are different numbers entirely. Taking the start
   * time from the first tick means one clock decides everything, so an
   * animation cannot be born a thousand milliseconds old.
   */
  begin(now: number): void {
    if (this.begun) {
      return;
    }
    this.begun = true;
    this.startedAt = now;
    this.onBegin();
  }

  get hasBegun(): boolean {
    return this.begun;
  }

  protected onBegin(): void {}

  advance(now: number): void {
    if (this.finished) {
      return;
    }
    this.begin(now);
    const elapsed = now - this.startedAt;
    if (elapsed < this.delayMs) {
      // Waiting. The cell is deliberately not written: whoever asked
      // for the delay has already put the cell where it wants it, and
      // writing it again would dirty a node for nothing.
      this.lastSampledAt = now;
      return;
    }
    const { value, done } = this.sample(now, elapsed - this.delayMs);
    this.lastSampledAt = now;
    // A stepped easing holds one value across many frames, and a
    // spring at rest holds its target: writing an unchanged value
    // would emit through the cell and dirty a node for nothing.
    if (this.lastWritten === undefined || !this.valuesEqual(this.lastWritten, value)) {
      this.lastWritten = value;
      this.cell.value = value;
      this.subject.next(value);
    }
    if (done) {
      this.finish();
    }
  }

  /** Writes the target and completes, for reduced motion and for `duration: 0`. */
  snap(): void {
    if (this.finished) {
      return;
    }
    const value = this.target;
    this.lastWritten = value;
    this.cell.value = value;
    this.subject.next(value);
    this.finish();
  }

  /** Stops without reaching the target: superseded, or the node left. */
  cancel(): void {
    this.finish();
  }

  protected abstract get target(): T;

  protected valuesEqual(a: T, b: T): boolean {
    return Object.is(a, b);
  }

  private finish(): void {
    this.finished = true;
    this.subject.complete();
  }
}

/**
 * A value moving from where it is to where it was told, over a fixed
 * time, along a curve.
 *
 * `from` is read at construction rather than at the first frame, so an
 * animation that starts on the same turn as the write it reacts to
 * blends from the value that was on screen and not from the one that
 * has just replaced it.
 */
export class UiTween<T> extends UiAnimation<T> {
  private readonly from: T;
  private readonly to: T;
  private readonly duration: number;
  private readonly easing: UiEasing;
  private readonly repeat: boolean;
  private readonly interpolate: UiInterpolator<T>;

  constructor(cell: AnimatedCell<T>, to: T, options: UiTweenOptions, interpolate: UiInterpolator<T>) {
    super(cell, options.stepMs ?? 0, options.reducedMotion ?? 'snap', options.delay ?? 0);
    this.from = cell.value;
    this.to = to;
    this.duration = options.duration;
    this.easing = options.easing ?? easings.standard;
    this.repeat = options.repeat === true;
    this.interpolate = interpolate;
  }

  /** Whether it will ever finish on its own. */
  get isRepeating(): boolean {
    return this.repeat;
  }

  protected override get target(): T {
    return this.to;
  }

  protected override sample(_now: number, elapsedMs: number): { value: T; done: boolean } {
    if (this.duration <= 0) {
      return { value: this.to, done: !this.repeat };
    }
    if (this.repeat) {
      const progress = (elapsedMs % this.duration) / this.duration;
      return { value: this.interpolate(this.from, this.to, this.easing(progress)), done: false };
    }
    const progress = Math.min(1, Math.max(0, elapsedMs / this.duration));
    if (progress >= 1) {
      return { value: this.to, done: true };
    }
    return { value: this.interpolate(this.from, this.to, this.easing(progress)), done: false };
  }

  protected override valuesEqual(a: T, b: T): boolean {
    return valuesLookEqual(a, b);
  }
}

/** Sub-step for the spring integrator, in milliseconds. */
const SPRING_STEP_MS = 1000 / 240;
/**
 * The most simulated time one frame may cover.
 *
 * A stall — a blocked main thread, a backgrounded tab — hands the next
 * frame a delta of seconds. Integrating all of it would either cost a
 * visible pause or, with a stiff spring, blow up; clamping means the
 * spring resumes from where it was, which is what a person sees as the
 * animation simply carrying on.
 */
const SPRING_MAX_FRAME_MS = 64;

/**
 * A number pulled towards a target by a spring.
 *
 * Numbers only, deliberately. A spring integrates a position and a
 * velocity, and there is no honest velocity for a colour or for a
 * transform's five fields taken together; the usual dodge — springing
 * a scalar progress and interpolating along it — reintroduces the
 * duration a spring exists to be free of. Two springs on two numbers
 * is what a layout animation uses, and it is the correct model.
 *
 * Integrated at a fixed sub-step rather than with the frame delta, so
 * the same animation reaches the same values whether it was sampled at
 * 60 Hz or at 30, and so a spec can assert them.
 */
export class UiSpring extends UiAnimation<number> {
  private position: number;
  /** The position one sub-step back, for the interpolation below. */
  private previousPosition: number;
  private velocity: number;
  private readonly to: number;
  private readonly spec: UiSpringSpec;
  private readonly restDelta: number;
  private simulatedTo: number;

  constructor(cell: AnimatedCell<number>, to: number, options: UiSpringOptions) {
    super(cell, options.stepMs ?? 0, options.reducedMotion ?? 'snap', options.delay ?? 0);
    this.position = cell.value;
    this.previousPosition = this.position;
    this.velocity = options.velocity ?? 0;
    this.to = to;
    this.spec = options.spring;
    this.restDelta = options.restDelta ?? 0.01;
    this.simulatedTo = 0;
  }

  /** Where it is going, for a retarget that wants to know. */
  get destination(): number {
    return this.to;
  }

  /** Units per second right now, so a retarget can carry it over. */
  get currentVelocity(): number {
    return this.velocity;
  }

  protected override onBegin(): void {
    this.simulatedTo = 0;
  }

  protected override get target(): number {
    return this.to;
  }

  protected override sample(_now: number, elapsedMs: number): { value: number; done: boolean } {
    const until = Math.min(elapsedMs, this.simulatedTo + SPRING_MAX_FRAME_MS);
    const { stiffness, damping, mass } = this.spec;
    const seconds = SPRING_STEP_MS / 1000;
    // Whole sub-steps only, with the remainder carried into the next
    // frame. Integrating a partial step to land exactly on the frame's
    // time would make the result depend on the cadence, which is the
    // one thing this integrator exists to avoid — the spec asserts
    // that 60 Hz and 30 Hz agree to six places.
    while (this.simulatedTo + SPRING_STEP_MS <= until) {
      this.previousPosition = this.position;
      const acceleration = (-stiffness * (this.position - this.to) - damping * this.velocity) / mass;
      this.velocity += acceleration * seconds;
      this.position += this.velocity * seconds;
      this.simulatedTo += SPRING_STEP_MS;
    }
    // Rest is both halves: near the target *and* slow. A spring passing
    // through its target at speed is not finished.
    if (Math.abs(this.position - this.to) < this.restDelta && Math.abs(this.velocity) < this.restDelta * 10) {
      this.position = this.to;
      this.previousPosition = this.to;
      this.velocity = 0;
      return { value: this.to, done: true };
    }
    // Reported between the last two sub-steps, by however much of one
    // is left over.
    //
    // The simulation runs on whole steps and must: a partial step would
    // make the *trajectory* depend on the cadence, which is what this
    // integrator exists to avoid. But reporting the whole-step position
    // makes the value it hands out depend on the cadence in a different
    // and more visible way. A sub-step is 1/240s, so a 60Hz frame is
    // exactly four of them and every frame advances the same amount —
    // while a 165Hz frame is 1.4545 of them, so the loop above runs one
    // step, then one, then two, and the element moves by twice as much
    // on every third frame. That reads as judder on exactly the
    // displays fast enough to show it, which is the opposite of what a
    // high refresh rate is for.
    //
    // Interpolating the *output* keeps both: the simulation is
    // untouched and still agrees to six places across cadences, and the
    // value handed out advances by an equal amount every frame. It
    // trails the simulation by up to one sub-step, which is 4ms.
    const alpha = (until - this.simulatedTo) / SPRING_STEP_MS;
    return { value: this.previousPosition + (this.position - this.previousPosition) * alpha, done: false };
  }
}

/**
 * Whether two interpolated values are the same to a writer.
 *
 * Object.is is wrong for the compound ones: every sample of a
 * transform or a colour is a fresh object, so an identity comparison
 * would report a change on every frame of a stepped animation and undo
 * the reason `stepMs` exists.
 */
function valuesLookEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  const keys = Object.keys(a as object);
  if (keys.length !== Object.keys(b as object).length) {
    return false;
  }
  for (const key of keys) {
    const left = (a as Record<string, unknown>)[key];
    const right = (b as Record<string, unknown>)[key];
    if (typeof left === 'number' && typeof right === 'number') {
      if (Math.abs(left - right) > 1e-6) {
        return false;
      }
      continue;
    }
    if (!Object.is(left, right)) {
      return false;
    }
  }
  return true;
}

/**
 * Builds a tween, or undefined when the two values cannot be blended.
 *
 * Undefined is a real answer and not a failure: see `interpolatorFor`
 * for the two cases (typed lengths, palette names) where the honest
 * thing is to write the value rather than to invent a midpoint.
 */
export function createTween<T>(cell: AnimatedCell<T>, to: T, options: UiTweenOptions): UiTween<T> | undefined {
  const interpolate = interpolatorFor(cell.value, to) as UiInterpolator<T> | undefined;
  if (interpolate === undefined) {
    return undefined;
  }
  return new UiTween(cell, to, options, interpolate);
}
