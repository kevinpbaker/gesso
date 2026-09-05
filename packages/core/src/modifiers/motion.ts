import { isObservable, type Observable, type Subscription } from 'rxjs';

import { defaultMotion, type UiSpringSpec, type UiSpringToken } from '../environment/UiMotion';
import { easings, type UiEasing } from '../animation/UiEasing';
import type { AnimatedCell } from '../animation/UiAnimation';
import {
  MOTION_CHANNELS,
  MOTION_REST,
  isMotionRest,
  resolveMotionState,
  type MotionChannel,
  type MotionStateInput,
  type MotionTiming,
  type ResolvedMotionState
} from '../animation/UiMotionState';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { UiNode } from '../graph/UiNode';
import { defineModifier } from './UiModifier';
import type { UiModifierHost } from './UiModifierHost';

/**
 * Motion, as two modifiers over one mechanism.
 *
 * `motion` moves an element to a visual state, optionally in from
 * another; `sharedElement` makes an element that appears under a name
 * another element was using start from where that element stood.
 *
 * Both write the same two properties — `transform` and `opacity` —
 * through the same per-node composer below, and both drive their
 * numbers through `host.animate` / `host.spring`, so they are
 * cancelled with the node, honour reduced motion, and cost the runtime
 * exactly what one animation costs. Nothing here is a second animation
 * system beside `AnimationDriver`; it is a vocabulary in front of it.
 *
 * **Why none of it touches layout.** Every channel a motion state has
 * resolves in `PaintState`, so an element moving through them marks
 * Paint and the layout engine never runs for it. That is the whole
 * reason `UiTransform` gained `translateX`/`translateY`:
 * `decisions/0029` moved a node with a relative `left`/`top` because
 * there was no translation to use, and paid a relayout per tick for
 * it. The one exception is `morph: 'geometry'`, which asks for a
 * relayout deliberately and says why.
 *
 * **Exit lives above this file.** An element that has logically left
 * has to be kept somewhere, and that is a question about who owns the
 * children — the framework's `Presence`, not a modifier. What
 * `Presence` needs from here is `motion`, which it points at an exit
 * state and waits on.
 */

// ---------------------------------------------------------------------------
// The per-node composer
// ---------------------------------------------------------------------------

interface MotionLayerRecord {
  state: ResolvedMotionState;
  readonly host: UiModifierHost;
}

/**
 * Every motion layer on one node, composed into one write.
 *
 * More than one is normal: an element that is entering *and* morphing
 * from an element on the previous screen has two, and the two describe
 * different things about the same element. Composition is the obvious
 * arithmetic — translations and rotations add, scales and opacities
 * multiply — which is what makes "fade it out while it also slides"
 * mean what it looks like it means.
 *
 * The composed value is written through **every** participating host
 * rather than one. The override cascade resolves a conflict in favour
 * of whichever modifier is later in the element's list (see
 * `UiModifierSet`), so writing from a single host would make the
 * result depend on modifier order; writing the same value from all of
 * them makes last-wins land on the right answer whichever one is last,
 * and a layer detaching drops only its own override.
 */
class MotionComposer {
  private readonly layers = new Map<symbol, MotionLayerRecord>();
  /** The pivot: the node's own centre, so a scale grows from the middle. */
  private pivotX = 0;
  private pivotY = 0;

  add(key: symbol, host: UiModifierHost): void {
    this.layers.set(key, { state: MOTION_REST, host });
  }

  remove(key: symbol): void {
    const record = this.layers.get(key);
    if (record === undefined) {
      return;
    }
    this.layers.delete(key);
    // Its own overrides go with it; the rest re-state theirs, which is
    // how the element ends up with exactly what the remaining layers
    // say rather than with the last composite the departing one wrote.
    record.host.clear('transform');
    record.host.clear('opacity');
    this.flush();
  }

  set(key: symbol, state: ResolvedMotionState): void {
    const record = this.layers.get(key);
    if (record === undefined) {
      return;
    }
    record.state = state;
    this.flush();
  }

  /**
   * Re-reads the node's size and re-writes if the pivot moved.
   *
   * A pivot at the centre is what makes `scaleFrom(0.9)` grow from the
   * middle rather than out of the top-left corner, and the centre is a
   * function of the node's box — so a node that has not been laid out
   * yet, or that has just been resized, needs telling.
   */
  measure(box: LayoutBox | null): void {
    const pivotX = box === null ? 0 : box.width / 2;
    const pivotY = box === null ? 0 : box.height / 2;
    if (pivotX === this.pivotX && pivotY === this.pivotY) {
      return;
    }
    this.pivotX = pivotX;
    this.pivotY = pivotY;
    this.flush();
  }

  private flush(): void {
    let opacity = 1;
    let x = 0;
    let y = 0;
    let scaleX = 1;
    let scaleY = 1;
    let rotate = 0;
    for (const { state } of this.layers.values()) {
      opacity *= state.opacity;
      x += state.x;
      y += state.y;
      scaleX *= state.scaleX;
      scaleY *= state.scaleY;
      rotate += state.rotate;
    }
    const rest = isMotionRest({ opacity, x, y, scaleX, scaleY, rotate });
    for (const { host } of this.layers.values()) {
      if (rest) {
        // Back at rest, the overrides are dropped rather than written
        // as identity, so the element ends up with exactly what it
        // declared — which for nearly every element is no transform at
        // all, and therefore no `hasTransform` in its paint state and
        // no matrix multiply per frame.
        host.clear('transform');
        host.clear('opacity');
        continue;
      }
      host.set('transform', {
        x: this.pivotX,
        y: this.pivotY,
        translateX: x,
        translateY: y,
        scaleX,
        scaleY,
        rotation: rotate
      });
      host.set('opacity', opacity);
    }
  }
}

/** Keyed weakly, so a node that has gone takes its composer with it. */
const composers = new WeakMap<UiNode, MotionComposer>();

function composerFor(node: UiNode): MotionComposer {
  let composer = composers.get(node);
  if (composer === undefined) {
    composer = new MotionComposer();
    composers.set(node, composer);
  }
  return composer;
}

// ---------------------------------------------------------------------------
// One layer: six cells, driven by the runtime's driver
// ---------------------------------------------------------------------------

/**
 * One motion layer's six numbers, each an `AnimatedCell` the driver
 * owns.
 *
 * Six cells rather than one cell holding a state object, because the
 * driver's rule is one animation per cell — so six cells is six
 * independently retargetable channels, which is what lets an element
 * finish sliding while its fade is re-aimed, and is what makes a
 * spring per channel possible at all (`UiSpring` integrates a scalar
 * position and velocity, and there is no honest velocity for a whole
 * state taken together).
 */
class MotionLayer {
  private readonly key = Symbol('motion');
  private readonly cells: Record<MotionChannel, AnimatedCell<number>>;
  /**
   * Held in a box rather than in a field, because the six cells below
   * are property pairs on object literals — inside them `this` is the
   * literal, so they need somewhere to read and write that is not the
   * layer's own `this`.
   */
  private readonly holder: { state: ResolvedMotionState } = { state: MOTION_REST };
  /** Bumped on every retarget, so a superseded run does not report done. */
  private generation = 0;
  private outstanding = 0;
  private onSettled: (() => void) | null = null;

  constructor(private readonly host: UiModifierHost) {
    const composer = composerFor(host.node);
    const holder = this.holder;
    const key = this.key;
    const cellFor = (channel: MotionChannel): AnimatedCell<number> => ({
      get value(): number {
        return holder.state[channel];
      },
      set value(next: number) {
        holder.state = { ...holder.state, [channel]: next };
        composer.set(key, holder.state);
      }
    });
    this.cells = {
      opacity: cellFor('opacity'),
      x: cellFor('x'),
      y: cellFor('y'),
      scaleX: cellFor('scaleX'),
      scaleY: cellFor('scaleY'),
      rotate: cellFor('rotate')
    };
    composer.add(this.key, host);
  }

  get state(): ResolvedMotionState {
    return this.holder.state;
  }

  /** Puts the layer somewhere at once, cancelling whatever was driving it. */
  snapTo(state: ResolvedMotionState): void {
    this.generation++;
    this.onSettled = null;
    this.outstanding = 0;
    for (const channel of MOTION_CHANNELS) {
      this.host.stopAnimation(this.cells[channel]);
    }
    this.holder.state = state;
    composerFor(this.host.node).set(this.key, state);
  }

  /**
   * Moves every channel that is not already there, and calls back once
   * they have all arrived.
   *
   * `onDone` is what an exit waits on, so it must fire exactly once and
   * only for the run that is still current: a retarget mid-flight
   * completes the animations it supersedes, and reporting those as
   * "arrived" would drop an element off the screen halfway through its
   * replacement.
   */
  animateTo(target: ResolvedMotionState, timing: MotionTiming, onDone?: () => void): void {
    const generation = ++this.generation;
    this.onSettled = onDone ?? null;
    this.outstanding = 0;
    // Counted in two passes because an animation with no driver behind
    // it, or one that reduced motion snapped, completes synchronously
    // inside `subscribe` — before the loop has finished counting how
    // many there will be.
    let started = 0;
    let settled = 0;
    for (const channel of MOTION_CHANNELS) {
      if (Math.abs(this.holder.state[channel] - target[channel]) < channelEpsilon(channel)) {
        continue;
      }
      started++;
      this.drive(this.cells[channel], target[channel], timing).subscribe({
        complete: () => {
          if (generation !== this.generation) {
            return;
          }
          settled++;
          if (this.outstanding > 0 && settled === started) {
            this.report();
          }
        }
      });
    }
    this.outstanding = started - settled;
    if (this.outstanding <= 0) {
      // Either nothing had to move, or nothing could — no driver, or a
      // reduced-motion preference, both of which land on the target
      // without a frame passing.
      this.report();
    }
  }

  /** Drops the layer's contribution and its overrides. */
  release(): void {
    this.generation++;
    this.onSettled = null;
    for (const channel of MOTION_CHANNELS) {
      this.host.stopAnimation(this.cells[channel]);
    }
    composerFor(this.host.node).remove(this.key);
  }

  measure(box: LayoutBox | null): void {
    composerFor(this.host.node).measure(box);
  }

  private report(): void {
    this.outstanding = 0;
    const settled = this.onSettled;
    this.onSettled = null;
    settled?.();
  }

  private drive(cell: AnimatedCell<number>, to: number, timing: MotionTiming): Observable<number> {
    if (timing.spring !== undefined) {
      return this.host.spring(cell, to, {
        spring: springSpec(timing.spring),
        delay: timing.delay,
        reducedMotion: timing.reducedMotion,
        // These channels are opacities and scales as often as pixels,
        // so the default 0.01 would leave a scale visibly short.
        restDelta: 0.002
      });
    }
    return this.host.animate(cell, to, {
      duration: resolveDuration(timing.duration),
      easing: resolveEasing(timing.easing),
      delay: timing.delay,
      reducedMotion: timing.reducedMotion
    });
  }
}

/**
 * How close counts as "already there", per channel.
 *
 * A scale and an opacity live in [0, 1]-ish and a translation lives in
 * pixels, so one epsilon for all six would either animate a channel
 * that has not moved or refuse to animate one that has.
 */
function channelEpsilon(channel: MotionChannel): number {
  return channel === 'x' || channel === 'y' ? 0.01 : 1e-4;
}

function springSpec(spring: UiSpringToken | UiSpringSpec): UiSpringSpec {
  return typeof spring === 'string' ? defaultMotion.springs[spring] : spring;
}

function resolveDuration(duration: MotionTiming['duration']): number {
  if (duration === undefined) {
    return defaultMotion.durations.normal;
  }
  return typeof duration === 'number' ? duration : defaultMotion.durations[duration];
}

function resolveEasing(easing: MotionTiming['easing']): UiEasing {
  if (easing === undefined) {
    return easings.standard;
  }
  return typeof easing === 'function' ? easing : (easings[easing] ?? easings.standard);
}

// ---------------------------------------------------------------------------
// motion()
// ---------------------------------------------------------------------------

export interface MotionArgs extends MotionTiming {
  /**
   * Where the element should be, now.
   *
   * A state, a stack of states, or an Observable of either. Null and
   * undefined both mean rest, so the common shape —
   * `hovered$.pipe(map(h => (h ? scaleFrom(0.97) : null)))` — needs no
   * ceremony to say "and back to normal".
   */
  readonly state?: MotionStateInput | Observable<MotionStateInput | null> | null;
  /**
   * Where it starts on the frame it appears, before moving to `state`.
   *
   * This is the enter animation, and it is a field on `motion` rather
   * than a modifier of its own because an element that enters and then
   * responds to a state is one element with one motion; two modifiers
   * writing the same six channels would be two layers arguing about
   * them.
   */
  readonly initial?: MotionStateInput;
  /**
   * Told when the element has finished arriving at `state`.
   *
   * `Presence` waits on this to know when an exit is over and the
   * element may finally be dropped. It fires once per target, and not
   * at all for a target that was superseded before it was reached.
   */
  readonly onSettled?: () => void;
}

/**
 * Moves an element to a visual state, and optionally in from another.
 *
 * ```tsx
 * <Box modifiers={[motion({ initial: [fade, slideUp(16)] })]} />
 * <Box modifiers={[motion({ state: pressed$, duration: 'fast' })]} />
 * ```
 *
 * `initial` is applied without animation when the modifier attaches —
 * during reconciliation, before the frame lays out or paints — so the
 * element is never seen at rest first, and released on the same frame,
 * which is what makes it an entrance rather than a jump.
 */
export const motion = defineModifier<MotionArgs>({
  name: 'motion',
  attach(host, args) {
    const controller = new MotionController(host, args);
    controllers.set(host, controller);
    controller.attach();
    host.own(() => {
      controllers.delete(host);
      controller.detach();
    });
  },
  update(host, args) {
    // Re-aimed rather than re-attached, because `initial` describes an
    // arrival and an element that is already here has already arrived.
    // Rebuilding the modifier when a duration changed would replay the
    // entrance, which is a bug you can see.
    controllers.get(host)?.update(args);
  }
});

const controllers = new WeakMap<UiModifierHost, MotionController>();

class MotionController {
  private readonly layer: MotionLayer;
  private subscription: Subscription | null = null;

  constructor(
    private readonly host: UiModifierHost,
    private args: MotionArgs
  ) {
    this.layer = new MotionLayer(host);
  }

  attach(): void {
    this.layer.measure(this.host.layoutBox());
    if (this.args.initial !== undefined) {
      this.layer.snapTo(resolveMotionState(this.args.initial));
    }
    // The pivot is half the node's size, and the size is not known
    // until the first layout; until then a scale would grow out of the
    // corner. This also keeps the pivot right when the element resizes.
    this.host.onLayout(box => this.layer.measure(box));
    this.aim();
  }

  update(args: MotionArgs): void {
    const previousState = this.args.state;
    this.args = args;
    if (Object.is(previousState, args.state) && this.subscription !== null) {
      return;
    }
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.aim();
  }

  detach(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.layer.release();
  }

  private aim(): void {
    const state = this.args.state;
    if (isObservable(state)) {
      this.subscription = state.subscribe(next => this.animate(next));
      return;
    }
    this.animate(state ?? null);
  }

  private animate(state: MotionStateInput | null | undefined): void {
    this.layer.animateTo(resolveMotionState(state), this.args, this.args.onSettled);
  }
}

// ---------------------------------------------------------------------------
// sharedElement()
// ---------------------------------------------------------------------------

export interface SharedElementArgs extends MotionTiming {
  /**
   * The name both elements answer to.
   *
   * Two elements on two screens sharing a name is the whole
   * declaration: whichever appears second morphs from where the first
   * one stood. The name is global to the runtime, so it names a thing
   * — `'playlist-title'` — rather than a place.
   */
  readonly name: string;
  /**
   * How the morph is performed.
   *
   * `transform` — translate and scale the arriving element from the
   * departing one's box onto its own. Paint-only, and the right answer
   * for a picture, a line of text, a row of controls: anything whose
   * content should travel and stretch as one piece.
   *
   * `geometry` — animate the element's own `left`, `top`, `width` and
   * `height` instead. It costs a relayout per tick, and it is worth
   * paying for exactly one shape: a rounded rectangle whose aspect
   * ratio changes, because scaling one stretches its corners into
   * ellipses. A card expanding into a page is that shape, which is why
   * the CSS View Transitions version of this effect needs bespoke
   * `object-fit` rules for its card background and for nothing else.
   */
  readonly morph?: 'transform' | 'geometry';
  /** Fade the arriving element up from this opacity as it morphs. */
  readonly fadeFrom?: number;
  /**
   * How the two boxes' sizes become a scale.
   *
   * `'free'`, the default, takes each axis from its own ratio, which is
   * what a picture wants: a 4:3 thumbnail opening into a 16:9 banner
   * genuinely changes shape, and the morph should show that.
   *
   * `'uniform'` takes one scale for both axes, and is what **text**
   * wants. A line of text has no shape of its own to preserve — its box
   * is whatever the line breaks made it — while the type inside only
   * ever grows by its font size. Left free, a title that fits on one
   * line in a card and wraps to two on the page it opens into is scaled
   * 0.73 across and 0.34 down, and the letters are visibly squashed on
   * the way up. Measured exactly that, at a window width where the page
   * title wrapped and the card's did not.
   *
   * The width ratio is the one kept, because for a line of text it
   * tracks the font size closely — 0.73 against the 0.68 the font sizes
   * actually imply, in that same measurement — while the height ratio
   * is a count of lines and can be out by a whole multiple.
   */
  readonly scale?: 'free' | 'uniform';
  /**
   * Told `true` when this element starts morphing and `false` when it
   * has arrived — or when it leaves mid-flight, so nothing is left
   * holding a state that will never be cleared.
   *
   * The `true` comes the moment the element takes a name something
   * else held, which is during reconciliation and before the frame
   * that first draws it. That is deliberately earlier than the FLIP,
   * which needs the first layout: paint order is sorted during layout,
   * so a `zIndex` written in answer to this has to be in place before
   * that layout runs, or the first frame of the morph is drawn in the
   * old order.
   *
   * It exists for one thing, and stacking is the reason. A morphing
   * element is bigger than its resting self for most of the way, so it
   * overlaps whatever sits beside it, and it has to be drawn *over*
   * that rather than under it. Raising the element itself is rarely the
   * answer: what usually has to rise is an ancestor — the card the
   * morphing background belongs to, not the background — and a modifier
   * cannot reach an ancestor, nor should it, because which ancestor and
   * how far are questions about a layout that only the layout knows.
   *
   *   const morphing = internalState(false);
   *   <button zIndex={morphing.pipe(map(m => (m ? 1 : 0)))}>
   *     <box modifiers={[sharedElement({ name, onMorph: at => (morphing.value = at) })]} />
   *
   * A browser has no equivalent because it does not need one: its
   * named elements are lifted out of the page into a layer above
   * everything, so nothing they might overlap is even in the picture.
   * Gesso morphs the real node, which stays exactly where it is in the
   * tree — the same trade that makes the morph interruptible and free
   * of a raster.
   */
  readonly onMorph?: (morphing: boolean) => void;
}

/**
 * Makes an element that appears under a name continue from wherever
 * the element that had that name was standing.
 *
 * ```tsx
 * <Image modifiers={[sharedElement({ name: 'playlist-image' })]} />
 * ```
 *
 * The departing element is hidden the moment the name changes hands,
 * because the arriving one is about to be drawn exactly over it, and
 * two copies of one thing reads as a double image rather than as a
 * transition.
 */
export const sharedElement = defineModifier<SharedElementArgs>({
  name: 'sharedElement',
  attach(host, args) {
    const controller = new SharedElementController(host, args);
    controller.attach();
    host.own(() => controller.detach());
  }
});

class SharedElementController {
  private readonly layer: MotionLayer;
  /** Where the previous holder of the name stood, until it is used. */
  private claimed: LayoutBox | null = null;
  /**
   * Hides the element this one is replacing.
   *
   * Held rather than called on arrival: see `UiSharedElements.claim`.
   * Between claiming a name and taking the departing element's place
   * there is at least one layout, and for a geometry morph a whole
   * frame — and hiding it up front makes that a frame with neither
   * element on screen, which reads as a flash of the page behind them.
   */
  private yieldPrevious: (() => void) | null = null;
  private yielded = false;
  /** Whether a morph is running, so `onMorph` is never told twice. */
  private morphing = false;
  /** Set for the one frame a geometry morph spends being measured. */
  private geometryTarget: LayoutBox | null = null;

  constructor(
    private readonly host: UiModifierHost,
    private readonly args: SharedElementArgs
  ) {
    this.layer = new MotionLayer(host);
  }

  attach(): void {
    const registry = this.host.shared;
    if (registry === null) {
      return;
    }
    const claim = registry.claim(
      this.args.name,
      this.host.node,
      () => this.yieldName(),
      () => this.unyield()
    );
    this.claimed = claim.box;
    this.yieldPrevious = claim.yieldPrevious;
    if (claim.box !== null) {
      // Said now, during reconciliation, and not from the first layout
      // as the FLIP itself is. `onMorph` exists so an ancestor can lift
      // the morphing element over its neighbours with a `zIndex`, and
      // paint order is sorted *during* layout from that property: a
      // write made from the `onLayout` callback lands after the sort
      // and is not seen until the next frame lays out. Measured in the
      // transitions example on the frame after Back: the card whose
      // background was shrinking from the page still had `zIndex` 0
      // and painted at its tree position, so the card below it, painted
      // later, covered the background for that one frame while the FLIP
      // transform drew it over the whole page. The claim already says a
      // morph is coming, so this is the earliest it can be said, and it
      // gives the raise the same frame the FLIP has.
      this.beginMorph();
    }
    const box = this.host.layoutBox();
    if (box !== null) {
      registry.report(this.args.name, this.host.node, box);
    }
    this.host.onLayout(() => this.handleLayout());
  }

  detach(): void {
    // Whatever this element was replacing must not be left hidden
    // because this one went away before it ever took its place — and
    // whatever was raised for this morph must not be left raised
    // because the morph never finished.
    this.endMorph();
    this.takeOver();
    this.host.shared?.release(this.args.name, this.host.node);
    this.layer.release();
  }

  private beginMorph(): void {
    if (this.morphing) {
      return;
    }
    this.morphing = true;
    this.args.onMorph?.(true);
  }

  private endMorph(): void {
    if (!this.morphing) {
      return;
    }
    this.morphing = false;
    this.args.onMorph?.(false);
  }

  /**
   * This element is now standing where the one it replaces was, so
   * that one may finally disappear.
   */
  private takeOver(): void {
    const yieldPrevious = this.yieldPrevious;
    this.yieldPrevious = null;
    yieldPrevious?.();
  }

  /**
   * Another node has taken the name. Get out of the way at once.
   *
   * Not an animation: the arriving element is about to be drawn from
   * this element's box, and anything but an instant disappearance puts
   * two of the same thing on screen at the same time.
   */
  private yieldName(): void {
    if (this.yielded) {
      return;
    }
    this.yielded = true;
    this.layer.snapTo({ ...MOTION_REST, opacity: 0 });
  }

  /**
   * The name has come back, so this element does too.
   *
   * Stepping aside used to be a one-way door, and an interrupted
   * transition walked straight into it. A route change keeps the
   * departing screen alive for the length of its exit, so pressing Back
   * part-way through returns to a screen whose element has already
   * yielded; the arriving element then leaves without anything
   * replacing it, and the only copy left is the invisible one. The
   * picture simply disappeared.
   *
   * A snap rather than a fade, for the reason the yield is a snap: the
   * element it was standing aside for is going away this frame, and
   * anything gradual puts a gap between the two where the picture is
   * half there.
   */
  private unyield(): void {
    if (!this.yielded) {
      return;
    }
    this.yielded = false;
    this.layer.snapTo(MOTION_REST);
  }

  private handleLayout(): void {
    // The **visible** box, not the flow box — the opposite of what
    // `animateLayout` reads, and for the opposite reason. A layout
    // animation must not mistake a scroll for a move, so it watches
    // where a node sits in the flow. A morph is a visual continuation
    // of what a person is looking at: an element halfway down a
    // scrolled list should be picked up from where it appears on
    // screen, not from where it would be if the list were at the top.
    // With an unscrolled list the two are the same, which is exactly
    // why reading the wrong one looked correct for a while.
    const box = this.host.layoutBox();
    if (box === null) {
      return;
    }
    this.host.shared?.report(this.args.name, this.host.node, box);
    this.layer.measure(this.host.layoutBox());
    if (this.geometryTarget !== null) {
      // The frame after the geometry override landed: the element is
      // genuinely laid out at the departing element's box now, so the
      // transform that was standing in for it comes off. Both draw the
      // same rectangle, so there is nothing to see at the changeover.
      this.geometryTarget = null;
      this.layer.snapTo(MOTION_REST);
      return;
    }
    const from = this.claimed;
    if (from === null) {
      return;
    }
    // The first layout after arriving: both boxes are known now, so the
    // delta is known, and this is the only frame on which it is worth
    // computing.
    this.claimed = null;
    if (box.width <= 0 || box.height <= 0 || from.width <= 0 || from.height <= 0) {
      // Nothing to morph from or into, so whatever was raised at the
      // claim comes down again.
      this.layer.snapTo(MOTION_REST);
      this.takeOver();
      this.endMorph();
      return;
    }
    const timing = this.timing();
    // FLIP, with the pivot at the node's own centre — which is why the
    // offset is between centres and the scale is a plain ratio of
    // sizes, with nothing else to correct for.
    const scaleX = from.width / box.width;
    const scaleY = from.height / box.height;
    const uniform = this.args.scale === 'uniform';
    const flip: ResolvedMotionState = {
      opacity: this.args.fadeFrom ?? MOTION_REST.opacity,
      x: from.x + from.width / 2 - (box.x + box.width / 2),
      y: from.y + from.height / 2 - (box.y + box.height / 2),
      scaleX,
      scaleY: uniform ? scaleX : scaleY,
      rotate: 0
    };
    // The transform lands *this* frame — `onLayout` runs after the boxes
    // are final and before anything paints from them — so the element is
    // drawn over the departing one straight away and that one can step
    // aside with nothing in between. The morph itself was announced at
    // the claim (see `attach`), because a raise made in answer to it has
    // to be in this frame's layout, which has already run by now.
    this.layer.snapTo(flip);
    this.takeOver();
    if (this.args.morph === 'geometry') {
      // A geometry morph cannot land until the next frame, because it
      // writes `left`/`top`/`width`/`height` and this frame's layout has
      // already run. The transform above is what covers that frame: it
      // draws the element at exactly the box the geometry is about to
      // give it, and comes off as soon as it has. Hiding the element for
      // that frame instead — which is what this did first — is a frame
      // with neither the departing element nor the arriving one on
      // screen, and it reads as the page flashing through.
      this.morphGeometry(from, box, timing);
      return;
    }
    this.layer.animateTo(MOTION_REST, timing, () => this.endMorph());
  }

  /**
   * A duration by default, not a spring — which is the opposite of what
   * this started as, and a measurement is why.
   *
   * A spring's shape does not change with distance: it covers the same
   * *proportion* of the move in the same time whatever the move is. A
   * `snappy` morph over 676px was measured stepping 14, 44, 62, 69, 71,
   * 68 pixels a frame — half the distance in about 165ms, then the last
   * third at a crawl. A card near the middle of a list has a hundred
   * pixels to travel and that reads as a gentle expansion; the same
   * card near the edge of the screen has six hundred, and the identical
   * curve reads as a jump to the middle followed by a slow settle.
   *
   * A fixed duration spends the same time on the move however far it
   * goes, so the whole path is visible and the eye can follow it. It is
   * also what the browser's own View Transitions do, and why a morph
   * there looks like travel rather than a cut.
   *
   * A spring is still right for a movement that follows a gesture,
   * where the distance is whatever the finger did and there is a real
   * velocity to carry — so `spring` remains available per call site,
   * and naming one still turns the duration off.
   */
  private timing(): MotionTiming {
    const timed = this.args.spring === undefined;
    return {
      spring: this.args.spring,
      duration: timed ? (this.args.duration ?? 'slow') : this.args.duration,
      easing: timed ? (this.args.easing ?? 'standard') : this.args.easing,
      delay: this.args.delay,
      reducedMotion: this.args.reducedMotion
    };
  }

  /**
   * The exact morph: the element's own box animates, so its corners,
   * its border and everything laid out inside it are re-resolved every
   * frame rather than stretched.
   *
   * **It is offsets, not coordinates.** The measured boxes are in the
   * *world*, and `left`/`top` place an element inside its containing
   * block; writing one into the other puts the element wherever its
   * containing block happens to start, which is a bug that looks like a
   * layout bug. So what is animated is the difference between the two
   * boxes, added to whatever the element declared — the same arithmetic
   * `animateLayout` does, and correct whatever the containing block is.
   *
   * The difference is measured in *visible* coordinates while
   * `left`/`top` are pre-scroll, and those agree because a scroll is a
   * constant translation: a delta is the same number in either frame,
   * as long as the arriving element's own scroll offset does not change
   * while the morph runs. It does not — a screen arrives at whatever
   * offset it was restored to and stays there.
   *
   * **The element must place itself with `left`/`top` and size itself
   * with `width`/`height`.** An absolutely positioned element pinned
   * by insets (`left` *and* `right`) has no width of its own to
   * animate, and writing one on top of both is over-constrained: the
   * result depends on which of the three the engine chooses to ignore.
   * That is refused rather than guessed at.
   */
  private morphGeometry(from: LayoutBox, to: LayoutBox, timing: MotionTiming): void {
    const position = this.host.get<string | undefined>('position');
    if (position !== 'absolute' && position !== 'fixed') {
      warnGeometryNeedsPositioning(this.args.name, position, 'position');
      this.layer.snapTo(MOTION_REST);
      this.takeOver();
      this.endMorph();
      return;
    }
    const baseLeft = numberOrZero(this.host.get<unknown>('left'));
    const baseTop = numberOrZero(this.host.get<unknown>('top'));
    if (baseLeft === null || baseTop === null) {
      warnGeometryNeedsPositioning(this.args.name, position, 'offsets');
      this.layer.snapTo(MOTION_REST);
      this.takeOver();
      this.endMorph();
      return;
    }
    this.geometryTarget = to;
    const geometry = new GeometryMorph(this.host, {
      left: baseLeft + from.x - to.x,
      top: baseTop + from.y - to.y,
      width: from.width,
      height: from.height
    });
    const targets = { left: baseLeft, top: baseTop, width: to.width, height: to.height };
    let outstanding = 0;
    let settled = 0;
    const done = (): void => {
      settled++;
      if (settled === outstanding) {
        // Back where it belongs: the overrides are dropped rather than
        // left holding the values they arrived at, so the element goes
        // on being laid out by what it declared. Leaving them behind
        // would freeze a card at the size the window happened to be.
        geometry.release();
        this.endMorph();
      }
    };
    for (const field of GEOMETRY_FIELDS) {
      outstanding++;
      const cell = geometry.cell(field);
      const to = targets[field];
      const values =
        timing.spring !== undefined
          ? this.host.spring(cell, to, {
              spring: springSpec(timing.spring),
              delay: timing.delay,
              reducedMotion: timing.reducedMotion,
              // Half a pixel is the same pixel on a 1x screen;
              // scheduling frames past it buys a movement nobody can
              // see.
              restDelta: 0.5
            })
          : this.host.animate(cell, to, {
              duration: resolveDuration(timing.duration),
              easing: resolveEasing(timing.easing),
              delay: timing.delay,
              reducedMotion: timing.reducedMotion
            });
      values.subscribe({ complete: done });
    }
  }
}

const GEOMETRY_FIELDS = ['left', 'top', 'width', 'height'] as const;

type GeometryField = (typeof GEOMETRY_FIELDS)[number];

/**
 * The four numbers a geometry morph drives, written as one override
 * set.
 *
 * Written through `host.set` like every other modifier write, so
 * `release` — and detaching, and the node leaving — all hand the
 * element back exactly what it declared. That matters more here than
 * anywhere else, because what it declared is where the element
 * actually belongs.
 */
class GeometryMorph {
  constructor(
    private readonly host: UiModifierHost,
    private readonly state: Record<GeometryField, number>
  ) {
    this.write();
  }

  cell(field: GeometryField): AnimatedCell<number> {
    // Read and written through closures rather than through `this`,
    // because a cell is a property pair on an object literal and an
    // object literal's `this` is the literal.
    const read = (): number => this.state[field];
    const write = (next: number): void => {
      this.state[field] = next;
      this.write();
    };
    return {
      get value(): number {
        return read();
      },
      set value(next: number) {
        write(next);
      }
    };
  }

  release(): void {
    for (const field of GEOMETRY_FIELDS) {
      this.host.clear(field);
    }
  }

  private write(): void {
    for (const field of GEOMETRY_FIELDS) {
      this.host.set(field, this.state[field]);
    }
  }
}

/** A plain number, or null for a typed length this cannot add pixels to. */
function numberOrZero(value: unknown): number | null {
  if (value === undefined || value === null) {
    return 0;
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const warnedGeometry = new Set<string>();

function warnGeometryNeedsPositioning(
  name: string,
  position: string | undefined,
  reason: 'position' | 'offsets'
): void {
  if (warnedGeometry.has(reason)) {
    return;
  }
  warnedGeometry.add(reason);
  if (reason === 'position') {
    console.warn(
      `sharedElement('${name}') asked for morph: 'geometry' on a '${position ?? 'static'}' element, and did ` +
        `nothing. A geometry morph animates left, top, width and height, which place an absolutely positioned ` +
        `element but only offset one in the flow. Position the element, or use the default morph: 'transform'.`
    );
    return;
  }
  console.warn(
    `sharedElement('${name}') asked for morph: 'geometry' on an element whose 'left' or 'top' is a typed length ` +
      `(percent, fr, auto), and did nothing. The morph adds pixels to what the element declared, and there is no ` +
      `pixel value to add to. Give it numeric offsets and a width and height, or use morph: 'transform'.`
  );
}
