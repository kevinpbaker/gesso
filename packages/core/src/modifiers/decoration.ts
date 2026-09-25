import { isObservable, type Observable, type Subscription } from 'rxjs';

import type { DecorationShape } from '../rendering/Decorations';
import type { UiColorValue } from '../properties/UiPropertyValues';
import { defineModifier, type UiModifier } from './UiModifier';
import type { UiModifierHost } from './UiModifierHost';

/** What `decorated` takes: a list, or one that changes over time. */
export type Decorations = readonly DecorationShape[] | Observable<readonly DecorationShape[]>;

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
 *
 * **An Observable of shapes is also accepted**, and is the only way to
 * draw something whose shape changes while it is on screen. A
 * modifier list is static per element, so a component that recomputed
 * its shapes could not hand them over; it subscribes here instead, and
 * the subscription is released on detach. What this buys is a picture
 * made of many rectangles that would otherwise have to be many nodes:
 * Segue's waveform is four hundred columns on one node, redrawn as the
 * track's peaks arrive, with nothing to lay out and nothing to hit
 * test. Hoist the Observable for the same reason you would hoist the
 * array.
 */
export const decorated = defineModifier<Decorations>({
  name: 'decorated',
  attach(host, shapes) {
    draw(host, shapes);
  },
  update(host, shapes) {
    draw(host, shapes);
  }
});

/**
 * The live subscription per host, so a second `update` replaces the
 * first rather than drawing from both.
 *
 * `host.own` releases on detach, which is right for the last one and
 * not enough for the one before it. Keyed by the host, which is one
 * per node per modifier, so two decorations on the same node keep
 * their own.
 */
const live = new WeakMap<UiModifierHost, Subscription>();

function draw(host: UiModifierHost, shapes: Decorations): void {
  live.get(host)?.unsubscribe();
  live.delete(host);
  if (isObservable(shapes)) {
    const subscription = shapes.subscribe(next => host.decorate(next));
    live.set(host, subscription);
    host.own(subscription);
    return;
  }
  host.decorate(shapes);
}

/**
 * A ring outside whatever holds keyboard focus.
 *
 * Visible focus is an accessibility requirement and, until this
 * existed, the library had no way to meet it: a control could only
 * bind its own `borderColor` to a focus observable, which recolours
 * the control rather than marking it, and which every one of
 * twenty-odd components had to repeat.
 *
 * Two things make this a decoration rather than an overlay, and they
 * are the reasons decorations exist at all:
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

/** One edge's border: a thickness, and a colour if it is not the shared one. */
export interface BorderEdge {
  readonly width: number;
  readonly color?: UiColorValue;
}

/** What `borders()` takes. An omitted edge is not drawn. */
export interface BordersOptions {
  readonly top?: number | BorderEdge;
  readonly right?: number | BorderEdge;
  readonly bottom?: number | BorderEdge;
  readonly left?: number | BorderEdge;
  /** The colour for any edge that does not name its own. Defaults to `border`. */
  readonly color?: UiColorValue;
}

/**
 * A border per edge, as paint rather than as layout.
 *
 * `borderWidth` is one number and `borderColor` one colour, so a node
 * cannot have a heavy bottom edge and a hairline top. This is the gap
 * closed from the cheap side. A border in Gesso is paint-only —
 * `paintBorder` strokes inside the box and touches no layout — so four
 * edges are four filled rectangles in the node's own paint pass, with
 * nothing to lay out and nothing to hit test. A bordered cell costs
 * four draw instances and no extra nodes.
 *
 *   Box({ modifiers: [borders({ bottom: 2, right: 1, color: 'border' })] })
 *
 * They lie *inside* the box, where `borderWidth` puts them, so a border
 * never changes where anything sits and never overlaps a neighbour.
 *
 * **Why this is a modifier and not four props.** First-class
 * `borderTopWidth` is a much larger change, and the cost is not where
 * it looks: the property, the paint state and the Canvas2D stroke are
 * easy, but the WebGPU instance packs `radius, opacity, borderWidth` as
 * one `float32x3`, the fragment shader draws the border as an
 * isotropic SDF band, and one instance carries one colour — so four
 * widths need a wider vertex format, an anisotropic inner rect in the
 * shader, and up to four instances when the colours differ. This needs
 * none of that, because a decoration is already a rectangle with its
 * own colour that both backends already draw.
 *
 * What it does not do is round its corners. Four rectangles meeting at
 * a square corner is right for a grid, a table and a rule, which is
 * what per-edge borders are for; a rounded box wants the single
 * `borderWidth`, which the renderers draw as one band and get right.
 */
export function borders(options: BordersOptions): UiModifier<Decorations> {
  return decorated(borderShapes(options));
}

/**
 * The rectangles `borders()` draws, without the modifier around them.
 *
 * For a surface that cannot afford a modifier per node and pushes its
 * decorations in instead. A spreadsheet is the case: ten thousand
 * mounted cells, each with its own border, fed from one writer into a
 * subject per cell — a modifier per cell would be ten thousand
 * attachments to do what ten thousand array writes already do. The
 * arithmetic is the same either way, and sharing it is the point:
 * an application that rolled its own would be the second place a
 * corner could be painted twice.
 */
export function borderShapes(options: BordersOptions): readonly DecorationShape[] {
  const shared = options.color ?? 'border';
  const edge = (side: number | BorderEdge | undefined): BorderEdge | undefined => {
    if (side === undefined) {
      return undefined;
    }
    const resolved = typeof side === 'number' ? { width: side } : side;
    return resolved.width > 0 ? resolved : undefined;
  };
  const top = edge(options.top);
  const bottom = edge(options.bottom);
  const left = edge(options.left);
  const right = edge(options.right);

  // The corners belong to the horizontal edges, as a table's do: the
  // top and bottom run the full width, and the sides run between them.
  // Four full-length rectangles would paint each corner twice, which a
  // translucent colour shows and an opaque one hides until somebody
  // uses a translucent one.
  const between = { y: top?.width ?? 0, bottom: bottom?.width ?? 0 };
  const shapes: DecorationShape[] = [];
  if (top !== undefined) {
    shapes.push({ kind: 'fill', color: top.color ?? shared, y: 0, height: top.width, radius: 0 });
  }
  if (bottom !== undefined) {
    shapes.push({ kind: 'fill', color: bottom.color ?? shared, bottom: 0, height: bottom.width, radius: 0 });
  }
  if (left !== undefined) {
    shapes.push({ kind: 'fill', color: left.color ?? shared, x: 0, width: left.width, radius: 0, ...between });
  }
  if (right !== undefined) {
    shapes.push({ kind: 'fill', color: right.color ?? shared, right: 0, width: right.width, radius: 0, ...between });
  }
  return shapes;
}
