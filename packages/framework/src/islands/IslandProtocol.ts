/**
 * What crosses between the render worker and the shell for DOM islands.
 *
 * One `IslandUpdate` per frame that changed anything, outbound; three
 * small messages inbound. Plain data both ways, as everything on the
 * render protocol is: the element never leaves the shell and the node
 * never leaves the worker, and the island's id (its node's id) is the
 * only thing both sides hold.
 */

/** A rectangle in canvas CSS pixels, as layout boxes are. */
export interface IslandRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * When the canvas draws a stand-in in place of the element.
 *
 *   - `never`: the element is always shown, and trails its box by the
 *     frame a placement takes to reach the main thread while it moves.
 *   - `moving`: hidden while its box moves, shown on the first still
 *     frame. For an element whose look the canvas can draw.
 *   - `unfocused`: as `moving`, and hidden whenever it does not hold the
 *     focus as well. A text field: only the field being typed into
 *     shows its DOM text, so no other field can trail its border.
 */
export type IslandStandIn = 'never' | 'moving' | 'unfocused';

/** A new island: what to make and how it stands in. */
export interface IslandMount {
  readonly id: string;
  readonly kind: string;
  readonly props: unknown;
  readonly standIn: IslandStandIn;
}

/**
 * Where an island is this frame, and how much of it shows.
 *
 * `box` is the node's box on the canvas; `clip` the part of the canvas
 * its scroll and clipping ancestors let it paint in; `cuts` the boxes of
 * canvas content drawn over it (overlay entries, sticky headers), which
 * the element is cut away under so that content shows and takes the
 * pointer. `visible` false when it is off screen, clipped away, inside
 * something hidden, or not laid out.
 */
export interface IslandPlacement {
  readonly id: string;
  readonly visible: boolean;
  readonly box: IslandRect;
  readonly clip: IslandRect;
  readonly cuts: readonly IslandRect[];
  readonly opacity: number;
  /** The box moved since the last frame. */
  readonly moving: boolean;
  /** The runtime's focus is on this island. */
  readonly focused: boolean;
  /** A transparent backdrop lies over it: shown, and taking no pointer. */
  readonly inert: boolean;
}

/**
 * One frame's change to the islands, in the order the shell applies it:
 * unmounts, mounts, props, placements, focus, posts, submissions.
 */
export interface IslandUpdate {
  readonly unmounts?: readonly string[];
  readonly mounts?: readonly IslandMount[];
  /** `seen`: the last event number the worker had handled from that island; see `IslandUpdateInfo`. */
  readonly props?: readonly { readonly id: string; readonly props: unknown; readonly seen: number }[];
  readonly places?: readonly IslandPlacement[];
  /** The island holding the runtime's focus, or null; present only when it changed. */
  readonly focused?: string | null;
  readonly posts?: readonly { readonly id: string; readonly message: unknown }[];
  /** Form names to submit with `requestSubmit()`. */
  readonly submits?: readonly string[];
}

/** What the shell tells the render worker about its islands. */
export type IslandShellMessage =
  /** Something the element emitted, numbered per island from 1. */
  | { type: 'islandEvent'; id: string; event: unknown; seq: number }
  /** DOM focus went into the element: a click, an autofill, a screen reader. */
  | { type: 'islandFocus'; id: string }
  /** A form was submitted from the page (Enter in one of its fields), not by `submitForm`. */
  | { type: 'islandSubmit'; form: string; id: string | null };
