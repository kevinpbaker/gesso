import type { UiNodeReport } from './NodeReport';

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
  readonly children: readonly UiTreeNode[];
}

/** The whole tree at one moment. */
export interface UiTreeSnapshot {
  readonly root: UiTreeNode;
  /** How many nodes the snapshot holds, so a panel can say so without counting. */
  readonly nodes: number;
}

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
  | { kind: 'console'; enabled: boolean };

/** What the application answers, and volunteers while something is watched. */
export type DevtoolsEvent =
  | { kind: 'tree'; tree: UiTreeSnapshot }
  | { kind: 'report'; id: string; report: UiNodeReport | null }
  | { kind: 'console'; entry: ConsoleEntry };

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
