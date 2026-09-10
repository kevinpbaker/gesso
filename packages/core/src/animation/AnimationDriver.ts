import type { Observable } from 'rxjs';

import type { UiAnimation, AnimatedCell } from './UiAnimation';

/** An animation of some value, with the value's type erased. */
type AnyAnimation = UiAnimation<unknown>;

function erase<T>(animation: UiAnimation<T>): AnyAnimation {
  return animation as unknown as AnyAnimation;
}

/**
 * The running animations of one runtime, and the thing the `ticks`
 * phase advances.
 *
 * **One animation per cell.** Starting a second one on a cell
 * supersedes the first, which completes without reaching its target.
 * That rule is not a simplification: it is what makes a gesture work
 * — every retarget while a finger moves is a new animation on the same
 * cell — and it removes the whole question of what two animations
 * writing one value would mean.
 *
 * The driver is per runtime for the reason `MediaService` is: the
 * playground runs several runtimes in one worker, and a module-level
 * set of animations would tick a disposed runtime's cells.
 */
export class AnimationDriver {
  private readonly running = new Map<object, AnyAnimation>();
  private reducedMotion = false;
  private hidden = false;
  private wake: (() => void) | null = null;

  /**
   * Called when an animation enters the running set on an idle driver.
   *
   * The runtime arms a frame here. Without it an animation started
   * from a click handler that changes nothing else would never get a
   * first frame: the scheduler arms only on dirt, the animation's dirt
   * is made inside a frame, and no frame would ever come. Re-arming
   * *between* frames is `scheduleAnimationTick`'s job; this is only
   * the first one.
   */
  setWakeListener(listener: (() => void) | null): void {
    this.wake = listener;
  }

  /** Whether anything is running, so the `ticks` phase can report 0. */
  get isRunning(): boolean {
    return this.running.size > 0;
  }

  get size(): number {
    return this.running.size;
  }

  /** Whether a person has asked for less motion; see `UiReducedMotionPolicy`. */
  get isReducedMotion(): boolean {
    return this.reducedMotion;
  }

  /**
   * Whether an animation should be put where it is going instead of
   * being run there.
   *
   * Two questions with one answer: a person who has asked for less
   * motion and a page nobody is looking at both want the end state and
   * not the journey to it, and in both cases `keep` is the way an
   * animation says its movement is the information rather than the
   * decoration.
   */
  private lands(policy: AnyAnimation['reducedMotionPolicy']): boolean {
    return policy === 'snap' && (this.reducedMotion || this.hidden);
  }

  /**
   * Starts an animation, replacing whatever was driving its cell.
   *
   * Returns the values it will write. Under reduced motion, or while
   * the document is hidden, an animation whose policy is `snap` never
   * enters the set at all: the cell takes its target here, in the
   * caller's turn, and the returned observable has already completed.
   * So a reduced-motion app runs no animation frames, rather than
   * running them and drawing the same thing sixty times.
   */
  start<T>(animation: UiAnimation<T>): Observable<T> {
    const cell = animation.cell as object;
    this.running.get(cell)?.cancel();
    this.running.delete(cell);
    if (this.lands(animation.reducedMotionPolicy)) {
      animation.snap();
      return animation.values;
    }
    const wasIdle = this.running.size === 0;
    this.running.set(cell, erase(animation));
    if (wasIdle) {
      this.wake?.();
    }
    return animation.values;
  }

  /** The animation currently driving a cell, if any. */
  animationFor<T>(cell: AnimatedCell<T>): UiAnimation<T> | undefined {
    return this.running.get(cell as object) as unknown as UiAnimation<T> | undefined;
  }

  /**
   * Stops whatever is driving a cell, leaving it where it stands.
   *
   * This is how a node leaving the tree releases its animations, which
   * is the leak `decisions/0028` names for image bitmaps and which
   * matters here too: a driver holding a cell holds every closure the
   * component that made it captured.
   */
  stop<T>(cell: AnimatedCell<T>): boolean {
    const animation = this.running.get(cell as object);
    if (animation === undefined) {
      return false;
    }
    this.running.delete(cell as object);
    animation.cancel();
    return true;
  }

  stopAll(): void {
    const animations = [...this.running.values()];
    this.running.clear();
    for (const animation of animations) {
      animation.cancel();
    }
  }

  /**
   * A person's motion preference changed.
   *
   * Turning it on finishes everything already in flight that is
   * willing to be finished, rather than leaving a dialog stuck
   * half-faded until the animation it was told not to run runs out.
   */
  setReducedMotion(reduced: boolean): void {
    if (this.reducedMotion === reduced) {
      return;
    }
    this.reducedMotion = reduced;
    if (!reduced) {
      return;
    }
    this.landRunning();
  }

  /**
   * The document went out of sight, or came back.
   *
   * A hidden page still paints. The runtime deliberately keeps giving
   * frames to a change that genuinely happened, so the canvas holds a
   * correct picture rather than whatever was on it when the tab went
   * away, and a route loaded hidden is drawn once its images have
   * decoded rather than being left half empty. What it does not do is
   * advance animations, because frames spent watching something move
   * that nobody can see are frames spent for nothing.
   *
   * Those two together leave an animation frozen at whatever value it
   * had reached, and painted there. For most animations that is
   * harmless: a colour halfway between two colours is still a colour.
   * For an **entrance** it is not, because an entrance begins at
   * `opacity: 0` and its frozen first value is an element that is not
   * there. Segue's track page, opened in a background tab, held sixty
   * two pixels of empty page where its play button belonged, and every
   * screen built from `motion({ initial })` did the same. It came back
   * the moment the tab did, which is exactly why it reads as a
   * rendering bug rather than as a tab that is not being drawn.
   *
   * So a hidden page lands its animations instead of freezing them, in
   * the same way and for the same reason a reduced-motion preference
   * does: what an animation has to say to nobody is nothing, and the
   * state it was going to end at is the one the page should be holding
   * while it waits to be looked at. An animation whose movement is the
   * information (`keep`) is left alone either way, so a spinner is
   * still a spinner when the tab comes back.
   */
  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) {
      return;
    }
    this.hidden = hidden;
    if (!hidden) {
      return;
    }
    this.landRunning();
  }

  /** Puts everything that may be landed where it was going. */
  private landRunning(): void {
    // Deleting the current entry while iterating a Map is defined and
    // does not skip the next one.
    for (const [cell, animation] of this.running) {
      if (this.lands(animation.reducedMotionPolicy)) {
        this.running.delete(cell);
        animation.snap();
      }
    }
  }

  /**
   * When the earliest animation next wants a frame, or undefined when
   * nothing is running.
   *
   * This is the whole answer to "how does an animation keep frames
   * coming on an idle app". The runtime asks after every frame: an
   * answer at or before `now` means arm the next frame, a later one
   * means a timer, and undefined means arm nothing — which is why an
   * idle app's profile reads `ticks 0.00` for the strong reason (no
   * frames at all) rather than the weak one (frames that did nothing).
   */
  nextTickAt(now: number): number | undefined {
    let earliest: number | undefined;
    for (const animation of this.running.values()) {
      // Minus its slack, because this is the earliest moment a frame
      // would be *useful*, not the exact moment it is owed. Frames
      // arrive on the display's refreshes: a caller that waits for the
      // exact due time asks after the refresh that could have served
      // it and waits for the next one, which is how 59.94fps video on
      // a 60Hz display ends up playing at thirty. Asking a slack early
      // means the refresh at or just before due is the one that
      // serves it, and `advance` accepts it for the same reason.
      const due = animation.dueAt(now) - animation.dueSlackMs;
      if (earliest === undefined || due < earliest) {
        earliest = due;
      }
    }
    return earliest;
  }

  /**
   * Advances every animation whose next sample is due, writing each
   * one's cell. This is the `ticks` phase.
   *
   * It runs before the dirty set is snapshotted for exactly the reason
   * `patches` and `environment` do: the writes it makes have to belong
   * to the frame about to be collected, or a frame would draw the
   * previous tick's values and every animation would run one frame
   * behind.
   */
  advance(now: number): void {
    for (const [cell, animation] of this.running) {
      // Early by less than its own slack counts as on time — the same
      // allowance `nextTickAt` asks the scheduler for, and for the
      // same reason. See `UiAnimation.dueSlackMs`.
      if (animation.dueAt(now) - animation.dueSlackMs > now) {
        continue;
      }
      animation.advance(now);
      if (animation.isFinished && this.running.get(cell) === animation) {
        this.running.delete(cell);
      }
    }
  }
}
