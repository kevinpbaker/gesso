import type { UiNodeReport } from './NodeReport';
import type { FrameMetrics } from './GessoRuntime';
import type { Patch } from '../channel/StorePatch';
import type { RuntimeErrorSource } from './worker/RenderWorkerProtocol';

/**
 * What a devtools panel says to a running application and what it
 * hears back, as plain data (`ADOPTION_ROADMAP.md` A4).
 *
 * The node inspector answered "what is the thing under the pointer";
 * a panel docked outside the page asks the questions a DOM inspector
 * answers instead: what is the whole tree, what is this node I picked
 * from it, outline it for me, and what did the workers log. Every
 * answer here is built where the tree is and crosses a `postMessage`
 * as strings and numbers, for the same reason `UiNodeReport` does:
 * nothing in the render thread can be handed out, and a panel that
 * lives in an extension is two message hops away from it anyway.
 *
 * The same vocabulary serves both configurations. `WorkerApp` carries
 * it over the render worker protocol; `GessoApp`, with the runtime in
 * the same thread, answers the requests directly. A panel cannot tell
 * which it is talking to, which is what lets one panel serve both.
 */

/** One node of the tree, as a panel lists it. */
export interface UiTreeNode {
  readonly id: string;
  /** `UiNodeType`, as its string value. */
  readonly type: string;
  /**
   * The component this node is the anchor of, when it is one.
   *
   * Only the anchor carries the name. A panel wanting "which component
   * rendered this node" reads it off the nearest ancestor that has
   * one, which is the same walk `UiNodeReport.owners` makes and
   * costs the snapshot nothing per node.
   */
  readonly component?: string;
  /** A text node's text, shortened, so the tree reads like the screen. */
  readonly text?: string;
  /**
   * Live subscriptions the node holds: bound properties, reactive
   * children, event handlers. Absent when it holds none, which is most
   * nodes.
   *
   * On the tree rather than in a report of its own because the answer
   * a subscription view needs is per component, and the tree is what
   * says which component a node belongs to. A panel adds them up
   * towards the nearest ancestor carrying a `component`, and a leak is
   * the count that climbs while the shape stays still.
   */
  readonly subscriptions?: number;
  readonly children: readonly UiTreeNode[];
}

/** The whole tree at one moment. */
export interface UiTreeSnapshot {
  readonly root: UiTreeNode;
  /** How many nodes the snapshot holds, so a panel can say so without counting. */
  readonly nodes: number;
  /**
   * Live subscriptions across the whole graph, including the runtime's
   * own nodes that the snapshot does not list. The number to watch
   * while doing nothing.
   */
  readonly subscriptions: number;
}

/**
 * What was being answered when an action was recorded
 * (`EXCELLENCE_ROADMAP.md` X15).
 *
 * The barrier carries no request id: a command goes up, patches come
 * down, and nothing in the protocol ties the second to the first. So
 * the tie is made where both are seen, by the recorder, and it starts
 * from the one thing that is unambiguous — the input being dispatched
 * when the command was sent. Everything the input caused carries the
 * same id, and a panel groups by it instead of comparing timestamps
 * across three threads.
 */
export interface ActionCause {
  /** Rising from 1, within one recorder. */
  readonly id: number;
  /** The input that started it: `pointerUp (412, 233)`, `keyDown Enter`. */
  readonly label: string;
}

interface ActionEntryBase {
  /** Position on the timeline. Never reused, never renumbered. */
  readonly seq: number;
  /** `performance.now()` on the thread that recorded it. */
  readonly at: number;
  /** The input this entry belongs to, when it belongs to one. */
  readonly cause?: ActionCause;
}

/** A command a view sent across the barrier. */
export interface CommandEntry extends ActionEntryBase {
  readonly kind: 'command';
  readonly channel: string;
  readonly command: string;
  readonly payload: unknown;
}

/** A batch of patches the owning thread sent back. */
export interface PatchEntry extends ActionEntryBase {
  readonly kind: 'patch';
  readonly channel: string;
  readonly patches: readonly Patch[];
  /** The projections this batch touched, in the order first touched. */
  readonly keys: readonly string[];
}

/** A channel error, kept on the timeline so it has a position on it. */
export interface ChannelErrorEntry extends ActionEntryBase {
  readonly kind: 'error';
  readonly channel: string;
  readonly message: string;
}

/**
 * The frame that drew what came before it.
 *
 * The last link in the chain, and the reason it is an entry rather
 * than a field on the patches: a patch batch is recorded when it
 * arrives, which is before the frame that applies it exists. Stamping
 * it later would mean amending an entry a panel has already been sent.
 * A row on the timeline says the same thing by position, and says it
 * once.
 *
 * Recorded only for a frame that has something to close, so an idle
 * application's ticker does not fill the log with frames.
 */
export interface FrameEntry extends ActionEntryBase {
  readonly kind: 'frame';
  /** `UiFrame.id`, the same number `FrameMetrics.frame` carries. */
  readonly frame: number;
}

/** One line of a store action log. */
export type ActionEntry = CommandEntry | PatchEntry | ChannelErrorEntry | FrameEntry;

/** One `console.*` call made in a worker, forwarded with its thread named. */
export interface ConsoleEntry {
  readonly thread: 'render' | 'app';
  readonly level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  /** Each argument printed as one string; an Error carries its stack. */
  readonly args: readonly string[];
  /** `Date.now()` in the thread that logged. */
  readonly at: number;
}

/** What a panel asks. */
export type DevtoolsRequest =
  /** One tree snapshot, now. */
  | { kind: 'tree' }
  /**
   * A snapshot after every frame that changed the shape or the text
   * of the tree, until turned off. Frames that only moved boxes send
   * nothing, because the tree a panel lists did not change.
   */
  | { kind: 'watchTree'; enabled: boolean }
  /** A report on one node, now; `null` comes back for an id the tree no longer has. */
  | { kind: 'inspect'; id: string }
  /**
   * Keep one node's report fresh: a report now, and another after any
   * frame that changed it, until a different node (or null) is
   * selected. This is the panel's selection.
   */
  | { kind: 'select'; id: string | null }
  /**
   * Outline a node on the canvas, the way the DOM inspector outlines an
   * element hovered in its tree. Independent of the layout inspector's
   * own toggle, so a panel can point at a node without turning on the
   * heatmap.
   */
  | { kind: 'highlight'; id: string | null }
  /** Forward `console.*` from the workers, with the thread named. */
  | { kind: 'console'; enabled: boolean }
  /** A `frame` event per frame, until turned off: the profiler's feed. */
  | { kind: 'watchFrames'; enabled: boolean }
  /**
   * The layout inspector's own toggle: hover boxes and the measure
   * heatmap on the canvas, and a `hover` event for the node under the
   * pointer. The panel's "pick from the canvas".
   */
  | { kind: 'inspector'; enabled: boolean }
  /**
   * Writes a property on a node the panel picked, which is the half of
   * the addressed channel `decisions/0045` deferred: `select` names a
   * node to read, this one names a node to change.
   *
   * The write goes through the graph like any other, so the override
   * cascade, the equality check and the dirty marking all apply, and
   * the frame that follows is an ordinary frame. Two consequences to
   * be honest about: a bound property is overwritten by its stream's
   * next emission, and a value the element declares again on the next
   * rebuild comes back. This edits the tree, not the code.
   *
   * `value` is plain data. `null` removes the property, which is what
   * lets a value put back an inherited one.
   */
  | { kind: 'setProp'; id: string; name: string; value: unknown }
  /** Frame and channel spans in the browser's own profiler, until turned off. */
  | { kind: 'marks'; enabled: boolean };

/** What the application answers, and volunteers while something is watched. */
export type DevtoolsEvent =
  | { kind: 'tree'; tree: UiTreeSnapshot }
  | { kind: 'report'; id: string; report: UiNodeReport | null }
  | { kind: 'console'; entry: ConsoleEntry }
  | { kind: 'frame'; metrics: FrameMetrics }
  /**
   * One line of a store action log recorded on the thread the ports
   * are on.
   *
   * A log in the page reaches a panel through the devtools hook, which
   * has the log itself to read. A log in the render worker has no such
   * route: the shell holds neither end of a channel there, by design
   * (`decisions/0047`), so the entries come out the way every other
   * answer from that thread does, as plain data on the devtools
   * channel.
   */
  | { kind: 'action'; entry: ActionEntry }
  /** The node under the pointer while the inspector is on; null when none, or when it was turned off. */
  | { kind: 'hover'; report: UiNodeReport | null }
  /**
   * An error the render worker reported to its shell. Only a worker
   * shell sends these: with the runtime in the page, an error is an
   * ordinary page error and the page's console already has it.
   */
  | { kind: 'error'; message: string; stack?: string; source: RuntimeErrorSource };

/** Longer text than this is cut in a tree snapshot; the report has the whole of it. */
export const TREE_TEXT_LIMIT = 40;

/** A text node's text as the tree shows it. */
export function treeText(text: unknown): string | undefined {
  if (typeof text !== 'string' || text === '') {
    return undefined;
  }
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > TREE_TEXT_LIMIT ? `${flat.slice(0, TREE_TEXT_LIMIT - 1)}…` : flat;
}
