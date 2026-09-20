import {
  defineModifier,
  defineThemeExtension,
  themeExtension,
  UiEnvironmentKeys,
  UiEventType,
  type AnimatedCell,
  type DecorationShape,
  type UiColorValue,
  type UiModifierHost
} from '@gesso/core';

/**
 * A modifier written from outside the framework.
 *
 * the exit criterion: a modifier in its own
 * file, against the package entry points and nothing else, running in
 * the playground. This file imports `@gesso/core` and no path inside
 * it; the lint configuration at the repository root holds it to that,
 * so a deep import here fails `pnpm lint` rather than passing quietly.
 *
 * What it does: a press held for long enough confirms. A destructive
 * action a person could hit by accident, "delete this", "hang up", is
 * the usual reason to want one. The element fills from left to right
 * while the pointer is down, and lets go of the fill if the pointer
 * lifts or leaves before the time is up.
 *
 * It exercises the host surfaces a third party reaches for: events on
 * the node, a property written through the override cascade and given
 * back, a decoration for the fill, the environment for its tokens, and
 * an animation as the timer, so that the hold is cancelled with the
 * node if the node goes while a finger is on it.
 */

// #region tokens
/**
 * The tokens the modifier reads from the theme.
 *
 * A modifier that needs configuration a property does not carry has
 * two routes, and the property registry is not one of them: an unknown
 * property name throws, and that error is load-bearing for everyone.
 * The routes are an argument, for a value that belongs to one element,
 * and the environment, for a value that belongs to a subtree or an
 * application. The environment route from outside the framework is a
 * theme extension: it rides on the theme every node already inherits,
 * a provider anywhere above changes it for everything beneath, and the
 * appearance toggle reaches it because it is part of the theme.
 */
export interface HoldToConfirmTokens {
  /** How long the pointer has to stay down, in milliseconds. */
  readonly duration: number;
  /** What the element fills with as the hold progresses. A palette name resolves against the theme at paint. */
  readonly fill: UiColorValue;
}

export const holdToConfirmTokens = defineThemeExtension<HoldToConfirmTokens>({
  name: 'holdToConfirm',
  defaults: { duration: 600, fill: 'danger' }
});
// #endregion tokens

// #region args
export interface HoldToConfirmArgs {
  /** Called once, when the pointer has stayed down for the whole duration. */
  readonly onConfirm: () => void;
  /** Called when a hold that had begun is let go of early. */
  readonly onCancel?: () => void;
  /** This element's own duration, over the theme's. */
  readonly duration?: number;
}
// #endregion args

// #region kind
/**
 * The kind: one per behaviour, holding the lifecycle. `defineModifier`
 * mints its identity, and the type parameter is what makes
 * `holdToConfirm({ onConfrim })` a compile error rather than a
 * modifier that never fires.
 *
 * There is an `update`, so a change of arguments is answered in place.
 * Without it the change would be a detach and an attach, and a hold in
 * progress would be dropped by the re-render that swapped a callback.
 * Per-attachment state lives in a map keyed by the host, which is one
 * object for the life of the attachment; the kind itself is shared by
 * every element that carries it and holds nothing.
 */
export const holdToConfirm = defineModifier<HoldToConfirmArgs>({
  name: 'holdToConfirm',
  attach(host, args) {
    holds.set(host, new Hold(host, args));
  },
  update(host, args) {
    holds.get(host)?.setArgs(args);
  }
  // No detach. The host removes the listeners, restores the property,
  // drops the decoration and cancels the animation; the map is weak.
});

const holds = new WeakMap<UiModifierHost, Hold>();
// #endregion kind

// #region hold
/** One element's hold. */
class Hold {
  /** The fraction of the duration held so far, driven by the animation. */
  private readonly progress: AnimatedCell<number> = { value: 0 };
  private holding = false;

  constructor(
    private readonly host: UiModifierHost,
    private args: HoldToConfirmArgs
  ) {
    // The element's own `onPointerDown` runs before this one, because
    // the element's handlers are registered first. A
    // `stopImmediatePropagation()` there would keep the hold from
    // starting, which is the element's right.
    host.on(UiEventType.PointerDown, () => this.begin());
    host.on(UiEventType.PointerUp, () => this.release());
    host.on(UiEventType.PointerCancel, () => this.release());
    // A pointer that leaves during a press never sends the up.
    host.on(UiEventType.PointerLeave, () => this.release());
  }

  setArgs(args: HoldToConfirmArgs): void {
    this.args = args;
  }

  private begin(): void {
    if (this.holding) {
      return;
    }
    this.holding = true;
    // Read at the press rather than held from attach: the theme above
    // may have changed since, and a value read when it is needed has
    // no need of `onEnvironment`.
    const tokens = themeExtension(this.host.environment(UiEnvironmentKeys.theme), holdToConfirmTokens);
    const duration = this.args.duration ?? tokens.duration;

    // Through the cascade: whatever `borderColor` the element declared,
    // or a modifier before this one wrote, comes back on release. A
    // modifier after this one in the list writing the same property
    // would win instead, and development warns about the pair.
    this.host.set('borderColor', tokens.fill);

    // The animation is the timer. It is cancelled by the host when the
    // node goes, which a `setTimeout` would not be, and it runs under
    // reduced motion because the movement here is the information: a
    // hold that snapped to done would be a click.
    this.host.animate(this.progress, 1, { duration, reducedMotion: 'keep' }).subscribe({
      next: fraction => this.host.decorate(fillTo(this.host, fraction, tokens.fill)),
      // Completion means the animation stopped driving the cell,
      // whether it arrived, was superseded or was stopped. Which of
      // the three is read from the cell.
      complete: () => this.finish(this.progress.value >= 1)
    });
  }

  private release(): void {
    if (!this.holding) {
      return;
    }
    // Leaves the cell where it stands and completes the observable,
    // which is what runs `finish` with the cell short of one.
    this.host.stopAnimation(this.progress);
  }

  private finish(confirmed: boolean): void {
    this.holding = false;
    this.progress.value = 0;
    this.host.decorate(null);
    this.host.clear('borderColor');
    if (confirmed) {
      this.args.onConfirm();
    } else {
      this.args.onCancel?.();
    }
  }
}

/**
 * The fill so far, in the node's own coordinates: the whole height,
 * and the fraction of the width the hold has reached. Painted before
 * the children, so the element's label stays readable on top of it.
 */
function fillTo(host: UiModifierHost, fraction: number, color: UiColorValue): readonly DecorationShape[] | null {
  const box = host.layoutBox();
  if (box === null || fraction <= 0) {
    return null;
  }
  return [{ kind: 'fill', x: 0, y: 0, width: box.width * fraction, color }];
}
// #endregion hold
