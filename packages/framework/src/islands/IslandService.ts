import { BehaviorSubject, type Observable } from 'rxjs';
import type { UiNode } from 'gesso-core';

import { islandGeometry, type IslandGeometrySource } from './islandGeometry';
import type {
  IslandMount,
  IslandPlacement,
  IslandRect,
  IslandShellMessage,
  IslandStandIn,
  IslandUpdate
} from './IslandProtocol';

/**
 * How many frames the canvas keeps drawing a stand-in after the element
 * is told to show again.
 *
 * The element shows a frame or two after the canvas would have stopped,
 * because its placement goes through the main thread's next frame and
 * the canvas does not. Drawn in that gap, the stand-in and the element
 * overlap at one place with the same text, which nobody can see; not
 * drawn, the field would blink empty.
 */
const STAND_IN_TAIL = 3;

/** What an `Island` tells the service about itself. */
export interface IslandSpec {
  readonly kind: string;
  readonly standIn: IslandStandIn;
  /** Something the element emitted. */
  onEvent?(event: unknown): void;
  /** Its form was submitted from the page: Enter in a field of it. */
  onSubmit?(): void;
}

/** An island's side of the service, held by the `Island` that attached it. */
export interface IslandHandle {
  /** Sends new props on the next frame. */
  setProps(props: unknown): void;
  /** A message for the element's `receive`, on the next frame. */
  post(message: unknown): void;
  /**
   * Whether the canvas should draw the island's stand-in now: while the
   * element is hidden by its `standIn` rule, and a few frames after.
   */
  readonly standIn: Observable<boolean>;
  detach(): void;
}

/** The runtime's half: how the service reaches the graph and focus. */
export interface IslandRuntimeHooks {
  /** Asks for another frame, for an island whose state has to be sent or settled. */
  repaint(node: UiNode): void;
  /** DOM focus went into an island's element; the runtime's focus follows it there. */
  focus(node: UiNode): void;
}

interface IslandEntry {
  readonly node: UiNode;
  readonly spec: IslandSpec;
  props: unknown;
  mounted: boolean;
  propsDirty: boolean;
  /** The last event number handled from the element. */
  seen: number;
  /** The box last sent, to tell a still frame from a moving one. */
  lastBox: IslandRect | null;
  /** What was last sent, compared so a frame that changes nothing sends nothing. */
  lastSent: string;
  readonly standIn: BehaviorSubject<boolean>;
  tail: number;
}

/**
 * The render worker's side of DOM islands: which nodes are islands, and
 * what the shell must hear about them each frame.
 *
 * Every runtime has one. An `Island` attaches its node and its props;
 * the runtime calls `collect` once a frame, after layout has settled and
 * before paint, so a placement leaves for the main thread as early in
 * the frame as it can (the element lags the canvas by however late it
 * gets there). What the shell's elements say comes back through
 * `receive`.
 *
 * It is a service rather than runtime internals so that a component
 * can reach the one thing here that is the application's to call:
 * `submitForm`, which a canvas button uses to submit a form of native
 * fields in a way a password manager notices.
 */
export class IslandService {
  private readonly islands = new Map<string, IslandEntry>();
  private readonly unmounted: string[] = [];
  private readonly posts: { id: string; message: unknown }[] = [];
  private readonly submits: string[] = [];
  private readonly layers = new Set<UiNode>();
  private hooks: IslandRuntimeHooks | null = null;
  private lastFocused: string | null = null;

  /** Connects the runtime. Called once, by the runtime that owns this service. */
  setHooks(hooks: IslandRuntimeHooks | null): void {
    this.hooks = hooks;
  }

  /** Whether any island is attached; the runtime skips `collect` when none is and none was. */
  get active(): boolean {
    return this.islands.size > 0 || this.unmounted.length > 0;
  }

  /**
   * Declares a node an island. Its element is made on the next frame,
   * with `props` as they are then.
   */
  attach(node: UiNode, spec: IslandSpec, props: unknown): IslandHandle {
    const id = node.id;
    const removed = this.unmounted.indexOf(id);
    if (removed >= 0) {
      // Detached and attached again within one frame: a fresh element,
      // since the props and the kind may both be new.
      this.unmounted.splice(removed, 1);
      this.unmounted.push(id);
    }
    const entry: IslandEntry = {
      node,
      spec,
      props,
      mounted: false,
      propsDirty: false,
      seen: 0,
      lastBox: null,
      lastSent: '',
      standIn: new BehaviorSubject(spec.standIn === 'unfocused'),
      tail: 0
    };
    this.islands.set(id, entry);
    this.hooks?.repaint(node);
    return {
      setProps: next => {
        if (this.islands.get(id) !== entry) {
          return;
        }
        entry.props = next;
        entry.propsDirty = entry.mounted;
        this.hooks?.repaint(node);
      },
      post: message => {
        if (this.islands.get(id) !== entry) {
          return;
        }
        this.posts.push({ id, message });
        this.hooks?.repaint(node);
      },
      standIn: entry.standIn,
      detach: () => {
        if (this.islands.get(id) !== entry) {
          return;
        }
        this.islands.delete(id);
        entry.standIn.complete();
        if (entry.mounted) {
          this.unmounted.push(id);
          // The root: the island's own node is leaving the tree.
          const root = rootOf(node);
          if (root !== null) {
            this.hooks?.repaint(root);
          }
        }
      }
    };
  }

  /**
   * Submits the shell's form of that name with `requestSubmit()`, on the
   * next frame.
   *
   * For a form whose submit button is drawn on the canvas. The
   * submission is what a password manager watches for: a sign-in that
   * only ever called a channel command would sign the person in and
   * never offer to save the password. The form's `submit` event is
   * prevented, and its fields' `onSubmit` is not called, since the
   * button that asked has already done what submitting means.
   */
  submitForm(name: string): void {
    this.submits.push(name);
    const any = this.islands.values().next().value;
    if (any !== undefined) {
      this.hooks?.repaint(any.node);
    }
  }

  /** Marks an overlay layer, whose entries cut the islands under them. */
  markLayer(node: UiNode, on: boolean): void {
    if (on) {
      this.layers.add(node);
    } else {
      this.layers.delete(node);
    }
  }

  /**
   * This frame's change, or null when there is none. Called by the
   * runtime once per frame, after layout settles.
   */
  collect(source: IslandGeometrySource, viewport: IslandRect, focused: UiNode | null): IslandUpdate | null {
    const unmounts = this.unmounted.splice(0);
    const mounts: IslandMount[] = [];
    const props: { id: string; props: unknown; seen: number }[] = [];
    const places: IslandPlacement[] = [];
    let focusedIsland: string | null = null;
    for (const [id, entry] of this.islands) {
      if (!entry.mounted) {
        mounts.push({ id, kind: entry.spec.kind, props: entry.props, standIn: entry.spec.standIn });
        entry.mounted = true;
        entry.propsDirty = false;
      } else if (entry.propsDirty) {
        props.push({ id, props: entry.props, seen: entry.seen });
        entry.propsDirty = false;
      }
      const geometry = islandGeometry(entry.node, source, viewport, this.layers);
      const last = entry.lastBox;
      const box = geometry.box;
      const moving =
        geometry.visible &&
        last !== null &&
        (last.x !== box.x || last.y !== box.y || last.width !== box.width || last.height !== box.height);
      entry.lastBox = geometry.visible ? box : null;
      const isFocused = focused === entry.node;
      if (isFocused) {
        focusedIsland = id;
      }
      const placement: IslandPlacement = {
        id,
        visible: geometry.visible,
        box,
        clip: geometry.clip,
        cuts: geometry.cuts,
        opacity: geometry.opacity,
        moving,
        focused: isFocused,
        inert: geometry.inert
      };
      const key = placementKey(placement);
      if (key !== entry.lastSent) {
        entry.lastSent = key;
        places.push(placement);
      }
      if (moving) {
        // A frame has to follow the last one that moved, or the shell
        // would hold the element hidden as "moving" once the box stops.
        this.hooks?.repaint(entry.node);
      }
      // Covered in part, the canvas draws the field under what covers
      // it, so the part the element is cut away from is not left blank.
      this.settleStandIn(entry, moving || geometry.cuts.length > 0 || !geometry.visible, isFocused);
    }
    const update: {
      -readonly [K in keyof IslandUpdate]: IslandUpdate[K];
    } = {};
    if (unmounts.length > 0) update.unmounts = unmounts;
    if (mounts.length > 0) update.mounts = mounts;
    if (props.length > 0) update.props = props;
    if (places.length > 0) update.places = places;
    if (focusedIsland !== this.lastFocused) {
      this.lastFocused = focusedIsland;
      update.focused = focusedIsland;
    }
    if (this.posts.length > 0) update.posts = this.posts.splice(0);
    if (this.submits.length > 0) update.submits = this.submits.splice(0);
    return Object.keys(update).length === 0 ? null : update;
  }

  /** What an element said, or what happened to it, on the shell. */
  receive(message: IslandShellMessage): void {
    const entry = this.islands.get(message.type === 'islandSubmit' ? (message.id ?? '') : message.id);
    if (entry === undefined) {
      return;
    }
    if (message.type === 'islandEvent') {
      entry.seen = Math.max(entry.seen, message.seq);
      entry.spec.onEvent?.(message.event);
    } else if (message.type === 'islandFocus') {
      this.hooks?.focus(entry.node);
    } else {
      entry.spec.onSubmit?.();
    }
  }

  /** Drops every island, for a runtime being disposed. */
  dispose(): void {
    for (const entry of this.islands.values()) {
      entry.standIn.complete();
    }
    this.islands.clear();
    this.unmounted.length = 0;
    this.posts.length = 0;
    this.submits.length = 0;
    this.layers.clear();
    this.hooks = null;
  }

  /**
   * Whether the canvas draws this island's stand-in, by the island's
   * rule, held on for `STAND_IN_TAIL` frames once the rule lets go.
   * `away` is anything that keeps the element from showing whole: its
   * box moving, something covering it, or the element being hidden.
   */
  private settleStandIn(entry: IslandEntry, away: boolean, focused: boolean): void {
    const rule = entry.spec.standIn;
    const wanted = rule !== 'never' && (away || (rule === 'unfocused' && !focused));
    if (wanted) {
      entry.tail = STAND_IN_TAIL;
      if (!entry.standIn.value) {
        entry.standIn.next(true);
      }
      return;
    }
    if (entry.tail > 0) {
      entry.tail -= 1;
      this.hooks?.repaint(entry.node);
      return;
    }
    if (entry.standIn.value) {
      entry.standIn.next(false);
    }
  }
}

function rootOf(node: UiNode): UiNode | null {
  let current: UiNode | null = node;
  while (current?.parent !== null && current?.parent !== undefined) {
    current = current.parent;
  }
  return current === node ? null : current;
}

/** A placement as a string, rounded to a hundredth of a pixel, for telling one frame's from the last. */
function placementKey(placement: IslandPlacement): string {
  const rect = (r: IslandRect): string =>
    `${Math.round(r.x * 100)},${Math.round(r.y * 100)},${Math.round(r.width * 100)},${Math.round(r.height * 100)}`;
  return [
    placement.visible ? 1 : 0,
    placement.moving ? 1 : 0,
    placement.focused ? 1 : 0,
    placement.inert ? 1 : 0,
    Math.round(placement.opacity * 1000),
    rect(placement.box),
    rect(placement.clip),
    ...placement.cuts.map(rect)
  ].join('|');
}
