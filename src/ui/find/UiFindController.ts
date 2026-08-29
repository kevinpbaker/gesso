import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { LayoutRecord } from '../layout/LayoutRecord';
import type { TextMeasurer } from '../layout/TextMeasurer';
import { createPaintState, resolvePaintState } from '../rendering/PaintState';
import { selectableTextNodes, selectableTextOf, type TextRange } from '../selection/UiSelectable';
import { paragraphGeometry, selectionRectsIn } from '../selection/TextSelectionGeometry';
import type { UiSelectionController } from '../selection/UiSelectionController';
import type { UiModifiers } from '../input/UiInputEvent';
import { detectEditingPlatform, type EditingPlatform } from '../editing/EditingKeymap';
import { findMatchesIn, type FindMatch, type FindOptions } from './TextFind';
import { clearMatchRanges, setMatchRanges } from './UiTextMatches';

/**
 * What the controller needs from the runtime around it: geometry,
 * measurement, and the two things it cannot do itself — mark a node
 * dirty and scroll a rectangle into view.
 */
export interface FindHost {
  recordFor(node: UiNode): LayoutRecord | undefined;
  readonly measurer: TextMeasurer;
  markDirty(node: UiNode, flags: DirtyFlags): void;
  /** Scrolls ancestors so a node-local box is visible. */
  reveal(node: UiNode, box: LayoutBox): void;
  /** The subtree a search runs over: the layout root. */
  root(): UiNode;
  /** Gives a node keyboard focus; used to put the caret in the app's query field. */
  focus(node: UiNode): void;
}

export interface FindControllerOptions {
  /** Keyboard conventions; detected from the user agent by default. */
  platform?: EditingPlatform;
}

/** Room kept around the active match when scrolling it into view. */
const MATCH_REVEAL_PADDING = 8;

/**
 * Finding text in the app's own content.
 *
 * The browser's find bar searches the DOM, and a canvas has none, so
 * Ctrl+F over a Nodal app has to be the app's.
 *
 * The corpus is the node tree — every string `selectableTextNodes`
 * finds, in reading order. That is the same reach a DOM mirror would
 * have and no more: a `LazyColumn` materialises only its visible
 * window, so rows that are not nodes are not searched. Closing that
 * gap means searching the data behind the list rather than the nodes
 * over it, which only the app can do; the engine is here, and a
 * supplementary source is the next thing to add to it.
 *
 * The active match is a real selection, through the selection
 * controller — so it looks like every other selection, copy takes it,
 * and revealing it uses the same scrolling. Every other match carries a
 * softer highlight on its node (see `UiTextMatches`). Both renderers
 * draw the matches under the selection, so the active one reads as the
 * strongest thing on the page.
 *
 * The UI is the app's: this is the engine a find bar drives, and
 * `isOpen` is the only thing it says about that UI — that a find
 * session is running, so Ctrl/Cmd+F and Escape mean find rather than
 * whatever they would otherwise. Whether the browser's own find bar is
 * left alone is the shell's call (`WorkerApp`'s `interceptFind`),
 * because the worker's answer cannot come back in time to cancel it.
 */
export class UiFindController {
  private readonly platform: EditingPlatform;
  private readonly paint = createPaintState();
  private readonly listeners = new Set<() => void>();
  private opened = false;
  private field: UiNode | null = null;
  private currentQuery = '';
  private options: FindOptions = {};
  private found: FindMatch[] = [];
  private active = -1;
  /** The nodes currently carrying match ranges, so they can be cleared. */
  private highlighted: UiNode[] = [];

  constructor(
    private readonly host: FindHost,
    private readonly selection: UiSelectionController,
    options: FindControllerOptions = {}
  ) {
    this.platform = options.platform ?? detectEditingPlatform();
  }

  // ---------------------------------------------------------------------------
  // The session
  // ---------------------------------------------------------------------------

  /** Whether a find session is running. */
  get isOpen(): boolean {
    return this.opened;
  }

  /** Notified whenever the query, the matches or `isOpen` change. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * The app's query field, so opening a session can put the caret in
   * it. The app registers it through a `ref`; without one a session
   * still opens and the user clicks into the field themselves.
   */
  setField(node: UiNode | null): void {
    this.field = node;
  }

  /** Starts a find session; the app shows its bar for this. */
  open(): void {
    if (!this.opened) {
      this.opened = true;
      this.notify();
    }
    // After the notify, so the field the app renders for an open
    // session exists by the time it is focused.
    if (this.field !== null) {
      this.host.focus(this.field);
    }
  }

  /** Ends the session and drops the matches. */
  close(): void {
    if (!this.opened && this.currentQuery.length === 0) {
      return;
    }
    this.opened = false;
    this.clear();
  }

  /**
   * Default keyboard behaviour: Ctrl/Cmd+F starts a session, Escape
   * ends one. Returns true when the key was consumed — Escape only
   * while a session is running, so it still clears a selection
   * otherwise.
   */
  handleKey(key: string, modifiers: UiModifiers): boolean {
    const primary = this.platform === 'mac' ? modifiers.meta : modifiers.ctrl;
    if (primary && !modifiers.alt && (key === 'f' || key === 'F')) {
      this.open();
      return true;
    }
    if (key === 'Escape' && this.opened) {
      this.close();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Matches
  // ---------------------------------------------------------------------------

  /** The query the matches are for; empty when nothing is being searched. */
  get query(): string {
    return this.currentQuery;
  }

  /** Every match, in document order. */
  get matches(): readonly FindMatch[] {
    return this.found;
  }

  get matchCount(): number {
    return this.found.length;
  }

  /** The index of the active match, or -1 when there is none. */
  get activeIndex(): number {
    return this.active;
  }

  /**
   * Runs a query over the app's text and activates the first match.
   * Returns how many there are; an empty query clears everything.
   */
  search(query: string, options: FindOptions = {}): number {
    this.currentQuery = query;
    this.options = options;
    if (query.length === 0) {
      this.clear();
      return 0;
    }
    this.found = this.collect(query, options);
    this.highlight();
    this.activate(this.found.length > 0 ? 0 : -1);
    this.notify();
    return this.found.length;
  }

  /**
   * Re-runs the current query. The tree changed under it — content was
   * edited, a list scrolled new rows in — so the matches did too.
   */
  refresh(): void {
    if (this.currentQuery.length === 0) {
      return;
    }
    const previous = this.found[this.active];
    this.found = this.collect(this.currentQuery, this.options);
    this.highlight();
    // Stay on the same match when it survived, so refreshing under the
    // user does not send them back to the top of the page.
    const same =
      previous === undefined
        ? -1
        : this.found.findIndex(
            match => match.node === previous.node && match.start === previous.start && match.end === previous.end
          );
    this.activate(same >= 0 ? same : this.found.length > 0 ? 0 : -1);
    this.notify();
  }

  /** Moves to the next match, wrapping around. */
  next(): boolean {
    return this.step(1);
  }

  /** Moves to the previous match, wrapping around. */
  previous(): boolean {
    return this.step(-1);
  }

  /** Drops the query, the matches and their highlights. */
  clear(): void {
    this.currentQuery = '';
    this.found = [];
    this.active = -1;
    for (const node of this.highlighted) {
      if (clearMatchRanges(node)) {
        this.host.markDirty(node, DirtyFlags.Paint);
      }
    }
    this.highlighted = [];
    this.notify();
  }

  /**
   * A node left the tree. Its matches went with it, so the search is
   * re-run rather than left pointing at something that is gone.
   */
  handleNodeRemoved(node: UiNode): void {
    if (this.currentQuery.length === 0) {
      return;
    }
    if (this.highlighted.includes(node) || this.found.some(match => match.node === node)) {
      this.clear();
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private step(direction: 1 | -1): boolean {
    if (this.found.length === 0) {
      return false;
    }
    const from = this.active < 0 ? (direction > 0 ? -1 : 0) : this.active;
    const next = (from + direction + this.found.length) % this.found.length;
    this.activate(next);
    this.notify();
    return true;
  }

  /**
   * The matches of a query, dropped where the text they are in is not
   * drawn: a paragraph capped by `maxLines` shows part of itself, and a
   * match the user cannot see must not be counted or stepped through.
   * Geometry is only measured for the nodes that matched at all.
   */
  private collect(query: string, options: FindOptions): FindMatch[] {
    const nodes = selectableTextNodes(this.host.root());
    const matches = findMatchesIn(nodes, selectableTextOf, query, options);
    const drawnEnd = new Map<UiNode, number>();
    return matches.filter(match => {
      let end = drawnEnd.get(match.node);
      if (end === undefined) {
        end = this.geometryEndOf(match.node);
        drawnEnd.set(match.node, end);
      }
      return match.end <= end;
    });
  }

  /** Writes the match ranges onto the nodes that hold them. */
  private highlight(): void {
    const byNode = new Map<UiNode, TextRange[]>();
    for (const match of this.found) {
      const ranges = byNode.get(match.node);
      if (ranges === undefined) {
        byNode.set(match.node, [{ start: match.start, end: match.end }]);
      } else {
        ranges.push({ start: match.start, end: match.end });
      }
    }
    for (const [node, ranges] of byNode) {
      if (setMatchRanges(node, ranges)) {
        this.host.markDirty(node, DirtyFlags.Paint);
      }
    }
    for (const node of this.highlighted) {
      if (!byNode.has(node) && clearMatchRanges(node)) {
        this.host.markDirty(node, DirtyFlags.Paint);
      }
    }
    this.highlighted = Array.from(byNode.keys());
  }

  /** Selects the match at `index` and scrolls it into view. */
  private activate(index: number): void {
    this.active = index;
    if (index < 0) {
      this.selection.clear();
      return;
    }
    const match = this.found[index];
    this.selection.selectRange(match.node, match.start, match.end);
    this.revealMatch(match);
  }

  private revealMatch(match: FindMatch): void {
    const geometry = this.geometryOf(match.node);
    const rects = selectionRectsIn(geometry, match.start, match.end);
    if (rects.length === 0) {
      return;
    }
    const first = rects[0];
    this.host.reveal(match.node, {
      x: first.x - MATCH_REVEAL_PADDING,
      y: first.y - MATCH_REVEAL_PADDING,
      width: first.width + 2 * MATCH_REVEAL_PADDING,
      height: first.height + 2 * MATCH_REVEAL_PADDING
    });
  }

  private geometryEndOf(node: UiNode): number {
    return this.geometryOf(node).end;
  }

  /** The node's text laid out in its own coordinates; see UiSelectionController. */
  private geometryOf(node: UiNode) {
    const rec = this.host.recordFor(node);
    const state = resolvePaintState(node, this.paint);
    const box: LayoutBox =
      rec === undefined
        ? { x: 0, y: 0, width: 0, height: 0 }
        : {
            x: rec.paddingLeft,
            y: rec.paddingTop,
            width: Math.max(0, rec.width - rec.paddingLeft - rec.paddingRight),
            height: Math.max(0, rec.height - rec.paddingTop - rec.paddingBottom)
          };
    return paragraphGeometry(state.text ?? '', box, state, this.host.measurer);
  }
}
