import type { DecorationShape } from '../rendering/Decorations';
import type { UiColorValue } from '../properties/UiPropertyValues';
import { defineModifier, type UiModifier } from './UiModifier';

/**
 * Shapes on a node, for as long as the modifier is attached.
 *
 * The plain form of `host.decorate`: everything else in this file is a
 * behaviour that decides *when* to draw. Useful on its own for a
 * static mark — a drop target's outline, a fixture the renderer parity
 * check can diff — and it is the smallest thing that exercises the
 * decoration path end to end.
 *
 * The argument is compared by identity, as every modifier's arguments
 * are, so hoist the array rather than building it in a render body.
 */
export const decorated = defineModifier<readonly DecorationShape[]>({
  name: 'decorated',
  attach(host, shapes) {
    host.decorate(shapes);
  },
  update(host, shapes) {
    host.decorate(shapes);
  }
});

/**
 * A ring outside whatever holds keyboard focus.
 *
 * Visible focus is an `ROADMAP.md` F6 requirement and, until this
 * existed, the library had no way to meet it: a control could only
 * bind its own `borderColor` to a focus observable, which recolours
 * the control rather than marking it, and which every one of
 * twenty-odd components had to repeat.
 *
 * Two things make this a decoration rather than an overlay, and they
 * are the reasons `MODIFIERS_ROADMAP.md` B3 exists at all:
 *
 * - **It is clipped with the node.** A ring on a row scrolled half out
 *   of a `ScrollView` is cut off at the same edge the row is, because
 *   it is painted inside the node's own paint pass under its
 *   ancestors' clips. An overlay drawn over the finished scene would
 *   float over the scroller's edge.
 * - **It is outside the node's own box.** The ring sits `offset`
 *   pixels clear of the control, so it never covers the control's
 *   border or its content, which is exactly what a bound
 *   `borderColor` could not avoid doing.
 *
 * The colour names a palette entry and is resolved at paint against
 * whatever theme the node inherits, so a ring inside a dark card is
 * the dark palette's without this modifier reading the environment.
 *
 * The ring is `:focus-visible`, not `:focus`: `attach` draws it only
 * while the host reports the focus as visible, so a control a pointer
 * press focused stays unmarked until a key is pressed. A control that
 * also recoloured its border on focus would say the same thing twice,
 * and say it for the wrong focus, which is why no component does.
 */
export interface FocusRingOptions {
  /** A palette name or a literal colour. Defaults to the `focusRing` token. */
  readonly color?: UiColorValue;
  /** Thickness of the band. */
  readonly width?: number;
  /** Clear space between the node's box and the ring. */
  readonly offset?: number;
  /**
   * Ring radius. Omitted means the node's own corner radius grown by
   * the ring's distance from it, so the ring is concentric with the
   * control without the caller knowing its radius.
   */
  readonly radius?: number;
  /** Paints the ring over the node's content instead of under it. */
  readonly after?: 'children';
}

const DEFAULT_WIDTH = 2;
const DEFAULT_OFFSET = 2;

/** The ring as a single stroke, placed by `decorationRect`. */
function ringShapes(options: FocusRingOptions): readonly DecorationShape[] {
  const width = options.width ?? DEFAULT_WIDTH;
  const offset = options.offset ?? DEFAULT_OFFSET;
  return [
    {
      kind: 'stroke',
      color: options.color ?? 'focusRing',
      lineWidth: width,
      // The band lies inside the outset box, so an outset of
      // offset + width puts it between `offset` and `offset + width`
      // pixels outside the node.
      outset: offset + width,
      radius: options.radius,
      after: options.after
    }
  ];
}

/**
 * No `update`: the shapes are computed in `attach` from the options,
 * and a change of options is a detach followed by an attach — which is
 * the honest behaviour for a kind that cannot describe a change, and
 * costs nothing here because the options of a focus ring do not
 * change while it is attached.
 */
const kind = defineModifier<FocusRingOptions>({
  name: 'focusRing',
  attach(host, options) {
    const shapes = ringShapes(options);
    // Drawn for focus the keyboard can see, not for every focus: a mouse
    // press focuses the control it lands on, and a ring there would mark
    // something nobody is about to drive with the keys. The host reports
    // the change when a key makes that focus visible, so the ring
    // appears then. This is `:focus-visible`, done where the focus is.
    const sync = (): void => {
      host.decorate(host.isFocused() && host.isFocusVisible() ? shapes : null);
    };
    // A node may already hold focus when its ring attaches: a dialog
    // that auto-focused its first field re-renders, and the modifier
    // that lands on the focused node would otherwise wait for a focus
    // change that has already happened.
    sync();
    host.onFocusChange(sync);
  }
});

const DEFAULT_RING: UiModifier<FocusRingOptions> = kind(Object.freeze({}));

/**
 * The ring, with the theme's own colour and spacing.
 *
 * Called with no options it returns one shared value, which `sameArgs`
 * matches without walking anything. Options are plain data and are
 * compared by what they hold, so a ring built inline in a render
 * survives it; hoisting saves the allocation and the walk, not the
 * attachment.
 */
export function focusRing(options?: FocusRingOptions): UiModifier<FocusRingOptions> {
  return options === undefined ? DEFAULT_RING : kind(options);
}
