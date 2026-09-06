import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from '../layout/LayoutTypes';

/**
 * What is being carried, and what it is.
 *
 * `type` is the application's own vocabulary (`'queue/track'`,
 * `'board/card'`), and a drop target says which types it accepts.
 * Matching by a string rather than by a class keeps the payload plain
 * data, which is what it has to be: an OS file drop arrives as a shell
 * message and becomes a payload of exactly this shape, and a message
 * that crossed the barrier cannot carry a prototype.
 */
export interface UiDragPayload {
  readonly type: string;
  readonly data: unknown;
}

/**
 * What a drop would do, in the vocabulary of the platform drag APIs.
 *
 * The framework does none of it: the effect is what a zone reports so
 * the source and the cursor can say what will happen, and `'none'` is
 * a zone refusing the payload it is being offered.
 */
export type UiDropEffect = 'move' | 'copy' | 'link' | 'none';

/** Where the drag is now, and what it is carrying. */
export interface UiDragState {
  readonly payload: UiDragPayload;
  readonly x: number;
  readonly y: number;
  /** The node the drag started from, or null for one from outside. */
  readonly source: UiNode | null;
  /** True for a drag that began outside the application, an OS file drop. */
  readonly external: boolean;
}

/**
 * A registered drop target.
 *
 * The zone answers where it is rather than being asked to hold a box,
 * because a list scrolls and a card moves and the answer is only ever
 * correct at the moment it is asked. `null` from `boxOf` (a node with
 * no layout record yet) takes the zone out of consideration for that
 * move rather than being an error.
 */
export interface UiDropZone {
  readonly node: UiNode;
  boxOf(): LayoutBox | null;
  accepts(payload: UiDragPayload): boolean;
  /** The pointer entered the zone with a payload it accepts. */
  enter(state: UiDragState): void;
  /** The pointer moved inside the zone. */
  over(state: UiDragState): void;
  /** The pointer left, or the drag ended somewhere else. */
  leave(): void;
  /** The drag was released over the zone. What it did, for the source. */
  drop(state: UiDragState): UiDropEffect;
}

/** The result a completed drag reports back to whatever started it. */
export interface UiDragResult {
  readonly node: UiNode;
  readonly effect: UiDropEffect;
}

/**
 * One file that arrived from outside the application.
 *
 * Plain data, every field of it, because this crosses the barrier:
 * `decisions/0030` puts recognition in the render worker and leaves the
 * shell holding a `File` object it cannot send. The bytes are an
 * `ArrayBuffer` so a large file is transferred rather than copied, and
 * they are optional because the shell reads them only for a drop that
 * something accepted, not for every move of the pointer over the
 * window.
 */
export interface UiDroppedFile {
  readonly name: string;
  /** The MIME type the platform reported, or '' when it had none. */
  readonly mediaType: string;
  readonly size: number;
  readonly lastModified: number;
  readonly bytes?: ArrayBuffer;
}

/**
 * The shell's message for a drag that started outside the window.
 *
 * The same four phases a drop target sees from a drag inside it, so a
 * zone that accepts `EXTERNAL_FILES` needs no second code path: the
 * session turns this into an ordinary drag and every zone answers it
 * the way it answers any other. The phases mirror the DOM's
 * `dragenter`, `dragover`, `dragleave` and `drop`.
 *
 * Position is in the same canvas-space coordinates as a pointer event,
 * so the shell subtracts the surface's bounding rect exactly as it does
 * for a press.
 */
export interface UiFileDropMessage {
  readonly type: 'fileDrop';
  readonly phase: 'enter' | 'over' | 'leave' | 'drop';
  readonly x: number;
  readonly y: number;
  /**
   * What is being carried. On `enter` and `over` the platform allows
   * only the names and types to be read, so `bytes` is absent there
   * and present on `drop`.
   */
  readonly files: readonly UiDroppedFile[];
}

/** The payload type an OS file drop arrives under. */
export const EXTERNAL_FILES = 'gesso/files';

/**
 * The drag in flight, and everywhere it could be put down.
 *
 * `draggable` moves a node's transform and stops, which is enough for a
 * card that goes back where it was and nothing at all for a card that
 * goes somewhere. What was missing is the other half: somewhere to
 * drop it, a way to say what it is, and an answer to "is this over
 * anything that would take it".
 *
 * The session is that answer and deliberately nothing more. It holds
 * no geometry of its own, subscribes to nothing and paints nothing: a
 * `dropTarget` modifier registers a zone, a `dragSource` modifier opens
 * a drag and moves it, and the session's whole job is to work out which
 * registered zone is under the point and to tell it so. Both halves are
 * modifiers because both are behaviour attached to an element, which is
 * `MODIFIERS_ROADMAP.md`'s test for what belongs here.
 *
 * There is one session per graph root rather than one per process, so
 * two applications in one worker, and a test suite renders dozens,
 * cannot see each other's drops.
 *
 * ## Which zone the point is in
 *
 * The deepest zone whose box contains the point and that accepts the
 * payload, breaking a tie by registration order. Depth rather than
 * paint order because a drop target is a region rather than a drawing:
 * a row inside a list is inside the list, and dropping on the row is
 * unambiguously the more specific answer. A zone that does not accept
 * the payload is passed over rather than blocking the one behind it,
 * so a list of mixed rows behaves the way a person expects.
 */
export class UiDragSession {
  private readonly zones: UiDropZone[] = [];
  private current: UiDragState | null = null;
  private inside: UiDropZone | null = null;

  /** Registers a drop target. The returned function unregisters it. */
  addZone(zone: UiDropZone): () => void {
    this.zones.push(zone);
    return () => {
      const index = this.zones.indexOf(zone);
      if (index !== -1) {
        this.zones.splice(index, 1);
      }
      if (this.inside === zone) {
        this.inside = null;
      }
    };
  }

  /** The drag in flight, or null when nothing is being carried. */
  get state(): UiDragState | null {
    return this.current;
  }

  /** The zone the pointer is over, or null. */
  get overNode(): UiNode | null {
    return this.inside?.node ?? null;
  }

  /**
   * Whether a zone would take what is being carried, for a source that
   * wants to show the person that letting go will do something.
   */
  get accepted(): boolean {
    return this.inside !== null;
  }

  /** Starts a drag. Any drag already in flight is cancelled first. */
  begin(payload: UiDragPayload, x: number, y: number, source: UiNode | null, external = false): void {
    if (this.current !== null) {
      this.cancel();
    }
    this.current = { payload, x, y, source, external };
    this.resolve();
  }

  /** Moves the drag, entering and leaving zones as it crosses them. */
  move(x: number, y: number): void {
    if (this.current === null) {
      return;
    }
    this.current = { ...this.current, x, y };
    this.resolve();
  }

  /**
   * Releases the drag over whatever it is on, and reports what that did.
   *
   * Null when it was let go over nothing that would take it, which is
   * the case a source has to handle by putting the node back.
   */
  end(): UiDragResult | null {
    const state = this.current;
    const zone = this.inside;
    this.current = null;
    this.inside = null;
    if (state === null || zone === null) {
      zone?.leave();
      return null;
    }
    const effect = zone.drop(state);
    zone.leave();
    return { node: zone.node, effect };
  }

  /** Abandons the drag: the zone under it is told, and nothing is dropped. */
  cancel(): void {
    this.inside?.leave();
    this.inside = null;
    this.current = null;
  }

  /**
   * Turns a shell's file-drop message into an ordinary drag.
   *
   * Everything downstream of here cannot tell the difference, which is
   * the point: a zone written for `EXTERNAL_FILES` is a zone like any
   * other, and the four phases map onto the four things a drag does.
   */
  applyFileDrop(message: UiFileDropMessage): UiDragResult | null {
    const payload: UiDragPayload = { type: EXTERNAL_FILES, data: message.files };
    switch (message.phase) {
      case 'enter':
        this.begin(payload, message.x, message.y, null, true);
        return null;
      case 'over':
        if (this.current === null) {
          this.begin(payload, message.x, message.y, null, true);
        } else {
          this.move(message.x, message.y);
        }
        return null;
      case 'leave':
        this.cancel();
        return null;
      case 'drop':
        if (this.current === null) {
          this.begin(payload, message.x, message.y, null, true);
        } else {
          this.move(message.x, message.y);
        }
        return this.end();
    }
  }

  /**
   * Works out which zone the point is in and reports the crossings.
   *
   * Walks the registered zones once per move. There are as many of them
   * as the page has drop targets, which is a handful, so this is a
   * linear scan on purpose: an index would have to be invalidated by
   * every layout, and the layout engine already answers "where is this
   * node" in constant time.
   */
  private resolve(): void {
    const state = this.current;
    if (state === null) {
      return;
    }
    let best: UiDropZone | null = null;
    let bestDepth = -1;
    for (const zone of this.zones) {
      if (!zone.accepts(state.payload)) {
        continue;
      }
      const box = zone.boxOf();
      if (box === null || !contains(box, state.x, state.y)) {
        continue;
      }
      const depth = depthOf(zone.node);
      if (depth > bestDepth) {
        best = zone;
        bestDepth = depth;
      }
    }
    if (best !== this.inside) {
      this.inside?.leave();
      this.inside = best;
      best?.enter(state);
      return;
    }
    best?.over(state);
  }
}

function contains(box: LayoutBox, x: number, y: number): boolean {
  return x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
}

function depthOf(node: UiNode): number {
  let depth = 0;
  for (let current: UiNode | null = node.parent; current !== null; current = current.parent) {
    depth += 1;
  }
  return depth;
}

const sessions = new WeakMap<UiNode, UiDragSession>();

/**
 * The session for the graph a node belongs to, created on first ask.
 *
 * Keyed by the root rather than held in a module variable so that two
 * applications in one worker keep their drags apart; a spec that
 * renders several trees would otherwise have one drag visible in all
 * of them.
 */
export function dragSessionFor(node: UiNode): UiDragSession {
  let root = node;
  while (root.parent !== null) {
    root = root.parent;
  }
  let session = sessions.get(root);
  if (session === undefined) {
    session = new UiDragSession();
    sessions.set(root, session);
  }
  return session;
}
