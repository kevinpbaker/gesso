import { EMPTY, type Observable } from 'rxjs';

import {
  AnimationDriver,
  UiSpring,
  createTween,
  easings,
  type AnimatedCell,
  type UiAnimation,
  type UiEasing,
  type UiReducedMotionPolicy,
  defaultMotion,
  type UiDurationToken,
  type UiEasingToken,
  type UiMotion,
  type UiSpringSpec,
  type UiSpringToken
} from 'gesso-core';
import { internalState } from '../InternalState';

/** A duration named from the motion vocabulary, or milliseconds outright. */
export type UiDuration = UiDurationToken | number;
/** A curve named from the motion vocabulary, or a function outright. */
export type UiEasingChoice = UiEasingToken | UiEasing;

export interface AnimateOptions {
  /** Defaults to `normal`. */
  duration?: UiDuration;
  /** Defaults to `standard`. */
  easing?: UiEasingChoice;
  /** Sample no more often than this; see `UiAnimationOptions.stepMs`. */
  stepMs?: number;
  /** Run forever, restarting each time. A repeating animation never completes. */
  repeat?: boolean;
  /** What a reduced-motion preference does to it. Defaults to `snap`. */
  reducedMotion?: UiReducedMotionPolicy;
  /** Wait this long before the first sample; see `UiAnimationOptions.delay`. */
  delay?: number;
}

export interface SpringOptions {
  /** A named spring, or one given outright. Defaults to `snappy`. */
  spring?: UiSpringToken | UiSpringSpec;
  /** Overrides on top of the chosen spring, so `{ stiffness, damping }` alone works. */
  stiffness?: number;
  damping?: number;
  mass?: number;
  /** Units per second at the start; a gesture hands over what it ended with. */
  velocity?: number;
  restDelta?: number;
  reducedMotion?: UiReducedMotionPolicy;
  /** Wait this long before the first sample; see `UiAnimationOptions.delay`. */
  delay?: number;
}

/**
 * Animation, as a store components can inject.
 *
 * A store for the reason `MediaService` is one, and it is the same
 * reason: the running set has to be **per runtime**. The playground
 * runs several runtimes in one worker, and a module-level driver would
 * tick a disposed runtime's cells — which is why `animate(cell, to)`
 * is a method here rather than the free function first
 * sketched. A free function has nowhere to find its driver, and the
 * framework's answer to "where does a component reach the world" has
 * been an injected store since `ShellService`.
 *
 * The driver itself lives in the runtime, beside the layout engine and
 * the focus manager, because the runtime is what advances it: the
 * `ticks` phase is the driver's only caller. This store is the handle
 * on it, exactly as `FocusService` is the handle on `UiFocusManager`.
 */
export class AnimationService {
  /**
   * Whether the person using this app has asked for less motion.
   *
   * Bindable, so a component can decide not to render a decorative
   * movement at all rather than running one that snaps. The runtime
   * sets it from the shell; see `GessoRuntime.setReducedMotion`.
   */
  readonly reducedMotion = internalState(false);

  private driver: AnimationDriver | null = null;
  private motionVocabulary: UiMotion = defaultMotion;

  /** Installed by the runtime. Without one, every animation snaps to its target. */
  setDriver(driver: AnimationDriver | null): void {
    this.driver = driver;
    if (driver !== null) {
      driver.setReducedMotion(this.reducedMotion.value);
    }
  }

  /**
   * Replaces the durations, easings and springs the tokens name.
   *
   * The seam for an application with its own feel. It is here rather
   * than on `UiTheme` because a theme value resolves per node and an
   * animation drives a cell, which has no node — see `UiMotion`.
   */
  setMotion(motion: UiMotion): void {
    this.motionVocabulary = motion;
  }

  get motion(): UiMotion {
    return this.motionVocabulary;
  }

  /**
   * Turns reduced motion on or off for this runtime.
   *
   * The runtime calls it when the shell reports the platform's
   * `prefers-reduced-motion`, which is where the answer normally comes
   * from. It is public because an application may legitimately offer
   * its own motion setting — many do — and because a person who wants
   * less motion in *this* app should not have to change an OS
   * preference to get it. The last caller wins; there is no priority
   * between the platform's answer and the app's.
   */
  applyReducedMotion(reduced: boolean): void {
    if (this.reducedMotion.value === reduced) {
      return;
    }
    this.reducedMotion.value = reduced;
    this.driver?.setReducedMotion(reduced);
  }

  /**
   * Moves a cell to a value over time, and returns what it writes.
   *
   * The cell is driven whether or not anyone subscribes — it is the
   * animation's purpose, not a side effect of observation — so the
   * returned Observable is for watching and for knowing when it is
   * over. It completes when the animation stops driving the cell,
   * which includes being superseded by the next `animate` on the same
   * cell; a caller that needs to know whether it arrived reads the
   * cell.
   */
  animate<T>(cell: AnimatedCell<T>, to: T, options: AnimateOptions = {}): Observable<T> {
    const duration = this.resolveDuration(options.duration ?? 'normal');
    const tween = createTween(cell, to, {
      duration,
      easing: this.resolveEasing(options.easing ?? 'standard'),
      stepMs: options.stepMs,
      repeat: options.repeat,
      reducedMotion: options.reducedMotion,
      delay: options.delay
    });
    if (tween === undefined) {
      // Not blendable: write it and say so. See `interpolatorFor`.
      cell.value = to;
      return EMPTY as Observable<T>;
    }
    const driver = this.driver;
    if (driver === null) {
      tween.snap();
      return tween.values;
    }
    return driver.start(tween);
  }

  /**
   * Pulls a number towards a value on a spring, with no duration.
   *
   * What a gesture wants: retargeting mid-flight keeps the velocity,
   * so a flick that changes direction bends rather than restarting.
   */
  spring(cell: AnimatedCell<number>, to: number, options: SpringOptions = {}): Observable<number> {
    const base =
      typeof options.spring === 'string' || options.spring === undefined
        ? this.motionVocabulary.springs[options.spring ?? 'snappy']
        : options.spring;
    const driver = this.driver;
    const previous = driver?.animationFor(cell);
    const animation = new UiSpring(cell, to, {
      spring: {
        stiffness: options.stiffness ?? base.stiffness,
        damping: options.damping ?? base.damping,
        mass: options.mass ?? base.mass
      },
      velocity: options.velocity ?? (previous instanceof UiSpring ? previous.currentVelocity : 0),
      restDelta: options.restDelta,
      reducedMotion: options.reducedMotion,
      delay: options.delay
    });
    if (driver === null) {
      animation.snap();
      return animation.values;
    }
    return driver.start(animation);
  }

  /** Stops whatever is driving a cell, leaving it where it stands. */
  stop<T>(cell: AnimatedCell<T>): boolean {
    return this.driver?.stop(cell) ?? false;
  }

  /**
   * What is driving a cell, if anything.
   *
   * For a caller that needs to know where a movement is *going* rather
   * than where it is — a scroll adding a wheel notch has to add it to
   * the destination, or every notch after the first travels less than
   * it asked for. `spring` uses the same lookup internally to carry
   * velocity across a retarget.
   */
  animationFor<T>(cell: AnimatedCell<T>): UiAnimation<T> | undefined {
    return this.driver?.animationFor(cell);
  }

  private resolveDuration(duration: UiDuration): number {
    return typeof duration === 'number' ? duration : this.motionVocabulary.durations[duration];
  }

  private resolveEasing(easing: UiEasingChoice): UiEasing {
    if (typeof easing === 'function') {
      return easing;
    }
    return this.motionVocabulary.easings[easing] ?? easings.standard;
  }
}
