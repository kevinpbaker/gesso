import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { LayoutRecord } from '../layout/LayoutRecord';
import type { TextMeasurer } from '../layout/TextMeasurer';
import { createPaintState, resolvePaintState } from '../rendering/PaintState';
import { detectEditingPlatform, type EditingPlatform } from '../editing/EditingKeymap';
import { lineEndAt, lineStartAt } from '../editing/TextBoundaries';
import type { HitTester } from '../input/UiHitTester';
import type { UiModifiers } from '../input/UiInputEvent';
import {
  clearSelectionRange,
  selectableTextNodes,
  selectableTextOf,
  selectionRangeOf,
  setSelectionRange
} from './UiSelectable';
import {
  hasDrawnText,
  offsetAtPointIn,
  paragraphGeometry,
  wordRangeIn,
  type ParagraphGeometry
} from './TextSelectionGeometry';

/**
 * What the controller needs from the runtime around it: geometry,
 * measurement, and the three things it cannot do itself — mark a node
 * dirty, drop an editable's focus, and reach the clipboard.
 */
export interface SelectionHost {
  recordFor(node: UiNode): LayoutRecord | undefined;
  /** Where the node is seen, scroll offsets applied; for the nearest-node search. */
  visibleBox(node: UiNode): LayoutBox;
  readonly measurer: TextMeasurer;
  markDirty(node: UiNode, flags: DirtyFlags): void;
  /** The subtree a selection may range over: the layout root. */
  root(): UiNode;
  /** Hands text to the shell, which is the only thread with a clipboard. */
  copy(text: string): void;
  /**
   * Drops focus when it is on an editable. Pressing text outside a
   * field ends editing, as it does in a browser, so two selections are
   * never lit at once.
   */
  blurEditable(): void;
  now(): number;
}

export interface SelectionControllerOptions {
  /** Keyboard conventions; detected from the user agent by default. */
  platform?: EditingPlatform;
}

/** One end of a selection: a text node and an offset into its text. */
interface TextPoint {
  node: UiNode;
  offset: number;
}

/** How long two presses may be apart and still count as a double click. */
const MULTI_CLICK_MS = 500;
const MULTI_CLICK_SLOP = 4;

/**
 * Selecting text that nobody types into.
 *
 * `EditableText` carries its own selection in its model, because the
 * caret, the IME and undo all need it there. Everything else the
 * framework draws is glyphs on a canvas with no model at all, so this
 * controller is what lets a user drag across a heading and a paragraph
 * and copy what they highlighted — the thing a page of HTML gives for
 * free and a canvas gives not at all.
 *
 * Model: a selection is two `TextPoint`s, an anchor where the press
 * landed and a focus that follows the pointer. Ordering them needs
 * document order, so the selectable nodes under the root are collected
 * into a list when a drag starts; the range covers the tail of the
 * first node, all of every node between, and the head of the last. The
 * resolved per-node ranges are written onto the nodes themselves,
 * where both renderers read them (see `UiSelectable`).
 *
 * The pointer controller calls in here after the app's listeners have
 * run, and only when none of them called preventDefault().
 */
export class UiSelectionController {
  private readonly platform: EditingPlatform;
  private readonly paint = createPaintState();
  private anchor: TextPoint | null = null;
  private focus: TextPoint | null = null;
  private dragging = false;
  /** Document order for the drag in progress; rebuilt on each press. */
  private order: UiNode[] = [];
  /** The nodes currently carrying a range, so they can be cleared. */
  private painted: UiNode[] = [];
  private lastPress: { node: UiNode; x: number; y: number; at: number; count: number } | null = null;

  constructor(
    private readonly host: SelectionHost,
    private readonly hitTester: HitTester,
    options: SelectionControllerOptions = {}
  ) {
    this.platform = options.platform ?? detectEditingPlatform();
  }

  /** Whether anything is selected. */
  get hasSelection(): boolean {
    return this.painted.length > 0;
  }

  /** Whether a press on this node would start a selection. */
  isSelectable(node: UiNode): boolean {
    return selectableTextOf(node) !== undefined;
  }

  // ---------------------------------------------------------------------------
  // Pointer
  // ---------------------------------------------------------------------------

  /**
   * A press. On selectable text it places the anchor (Shift extends
   * from the existing one), and a second or third press within the
   * double-click window takes the word or the line. Anywhere else it
   * clears the selection, as pressing outside text does in a browser.
   *
   * Returns true when a selection is now in progress, so the caller
   * knows the press was consumed.
   */
  pointerDown(node: UiNode | null, x: number, y: number, modifiers: UiModifiers): boolean {
    if (node === null || !this.isSelectable(node)) {
      this.clear();
      return false;
    }
    const geometry = this.geometryOf(node);
    if (!hasDrawnText(geometry)) {
      this.clear();
      return false;
    }
    const local = this.hitTester.toLocal(node, x, y);
    const offset = offsetAtPointIn(geometry, local.x, local.y);
    const now = this.host.now();
    const last = this.lastPress;
    const count =
      !modifiers.shift &&
      last !== null &&
      last.node === node &&
      now - last.at <= MULTI_CLICK_MS &&
      Math.abs(last.x - x) <= MULTI_CLICK_SLOP &&
      Math.abs(last.y - y) <= MULTI_CLICK_SLOP
        ? last.count + 1
        : 1;
    this.lastPress = { node, x, y, at: now, count };

    // Pressing text ends editing, so an editable's selection does not
    // stay lit beside this one.
    this.host.blurEditable();
    this.order = selectableTextNodes(this.host.root());
    this.dragging = true;

    if (modifiers.shift && this.anchor !== null) {
      this.focus = { node, offset };
    } else if (count === 2) {
      const word = wordRangeIn(geometry, offset);
      this.anchor = { node, offset: word.start };
      this.focus = { node, offset: word.end };
    } else if (count >= 3) {
      this.anchor = { node, offset: lineStartAt(geometry.text, offset) };
      this.focus = { node, offset: lineEndAt(geometry.text, offset) };
    } else {
      this.anchor = { node, offset };
      this.focus = { node, offset };
    }
    this.apply();
    return true;
  }

  /**
   * A drag. The focus follows the pointer across node boundaries, which
   * is why this hit-tests rather than using the pressed node: the
   * pointer controller captures a press to its target, and a selection
   * is the one gesture that has to leave it.
   */
  pointerMove(x: number, y: number): void {
    if (!this.dragging || this.anchor === null) {
      return;
    }
    const point = this.pointAt(x, y);
    if (point === null) {
      return;
    }
    if (this.focus !== null && this.focus.node === point.node && this.focus.offset === point.offset) {
      return;
    }
    this.focus = point;
    this.apply();
  }

  pointerUp(): void {
    this.dragging = false;
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  /**
   * Default keyboard behaviour when no editable has focus: copy the
   * selection, select everything, or clear it. Returns true when the
   * key was consumed.
   */
  handleKey(key: string, modifiers: UiModifiers): boolean {
    const primary = this.platform === 'mac' ? modifiers.meta : modifiers.ctrl;
    if (primary && (key === 'c' || key === 'C')) {
      const text = this.selectedText();
      if (text.length === 0) {
        return false;
      }
      this.host.copy(text);
      return true;
    }
    if (primary && (key === 'a' || key === 'A')) {
      return this.selectAll();
    }
    if (key === 'Escape' && this.hasSelection) {
      this.clear();
      return true;
    }
    return false;
  }

  /** Selects every selectable text node under the root, in document order. */
  selectAll(): boolean {
    const order = selectableTextNodes(this.host.root());
    if (order.length === 0) {
      return false;
    }
    const first = order[0];
    const last = order[order.length - 1];
    this.order = order;
    this.anchor = { node: first, offset: 0 };
    this.focus = { node: last, offset: this.geometryOf(last).end };
    this.apply();
    return true;
  }

  /**
   * Selects a range of one node's text, as if it had been dragged.
   * Used by find to light the active match: it is a real selection, so
   * copy takes it and it looks like every other one.
   */
  selectRange(node: UiNode, start: number, end: number): boolean {
    if (selectableTextOf(node) === undefined) {
      return false;
    }
    this.order = selectableTextNodes(this.host.root());
    if (!this.order.includes(node)) {
      return false;
    }
    this.anchor = { node, offset: start };
    this.focus = { node, offset: end };
    this.lastPress = null;
    this.apply();
    return this.hasSelection;
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /**
   * The selected text, node by node in document order, one newline
   * between nodes — the paragraph breaks a reader would expect when
   * pasting a heading and the text under it.
   */
  selectedText(): string {
    const parts: string[] = [];
    for (const node of this.painted) {
      const range = selectionRangeOf(node);
      const text = selectableTextOf(node);
      if (range === undefined || text === undefined) {
        continue;
      }
      parts.push(text.slice(range.start, range.end));
    }
    return parts.join('\n');
  }

  /** Drops the selection and repaints whatever was carrying it. */
  clear(): void {
    this.anchor = null;
    this.focus = null;
    this.dragging = false;
    if (this.painted.length === 0) {
      return;
    }
    for (const node of this.painted) {
      if (clearSelectionRange(node)) {
        this.host.markDirty(node, DirtyFlags.Paint);
      }
    }
    this.painted = [];
  }

  /**
   * A node left the tree. Its range went with it, so the rest of the
   * selection no longer means anything: virtualization and route
   * changes both take nodes out from under a live selection.
   */
  handleNodeRemoved(node: UiNode): void {
    if (this.painted.includes(node) || this.anchor?.node === node || this.focus?.node === node) {
      this.clear();
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * The text position under a canvas point: the offset in the node hit,
   * or — when the pointer is over a gap, a margin or another widget —
   * the nearest position in the node whose visible box is closest. A
   * drag that leaves the text it started in keeps selecting, as it does
   * everywhere else.
   */
  private pointAt(x: number, y: number): TextPoint | null {
    const hit = this.hitTester.hitTest(x, y);
    if (hit !== null && this.isSelectable(hit.node)) {
      const geometry = this.geometryOf(hit.node);
      if (hasDrawnText(geometry)) {
        const local = this.hitTester.toLocal(hit.node, x, y);
        return { node: hit.node, offset: offsetAtPointIn(geometry, local.x, local.y) };
      }
    }
    const nearest = this.nearestNode(x, y);
    if (nearest === null) {
      return null;
    }
    const geometry = this.geometryOf(nearest);
    if (!hasDrawnText(geometry)) {
      return null;
    }
    const local = this.hitTester.toLocal(nearest, x, y);
    return { node: nearest, offset: offsetAtPointIn(geometry, local.x, local.y) };
  }

  /** The selectable node whose visible box is closest to a canvas point. */
  private nearestNode(x: number, y: number): UiNode | null {
    let best: UiNode | null = null;
    let bestDistance = Infinity;
    for (const node of this.order) {
      if (this.host.recordFor(node) === undefined) {
        continue;
      }
      const box = this.host.visibleBox(node);
      const dx = Math.max(box.x - x, 0, x - (box.x + box.width));
      const dy = Math.max(box.y - y, 0, y - (box.y + box.height));
      // Vertical distance dominates: a point beside a line belongs to
      // that line, not to a nearer one on the row above.
      const distance = dy * dy * 4 + dx * dx;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = node;
      }
    }
    return best;
  }

  /**
   * Resolves the two ends into a range per node and writes them where
   * paint will find them.
   */
  private apply(): void {
    const anchor = this.anchor;
    const focus = this.focus;
    if (anchor === null || focus === null) {
      this.clear();
      return;
    }
    const anchorIndex = this.order.indexOf(anchor.node);
    const focusIndex = this.order.indexOf(focus.node);
    if (anchorIndex < 0 || focusIndex < 0) {
      // One end is no longer in the tree; nothing sensible spans them.
      this.clear();
      return;
    }
    const forward = anchorIndex < focusIndex || (anchorIndex === focusIndex && anchor.offset <= focus.offset);
    const from = forward ? anchor : focus;
    const to = forward ? focus : anchor;
    const first = Math.min(anchorIndex, focusIndex);
    const last = Math.max(anchorIndex, focusIndex);

    const next: UiNode[] = [];
    for (let i = first; i <= last; i++) {
      const node = this.order[i];
      const end = this.geometryOf(node).end;
      const start = i === first ? Math.min(from.offset, end) : 0;
      const stop = i === last ? Math.min(to.offset, end) : end;
      if (stop <= start) {
        continue;
      }
      if (setSelectionRange(node, start, stop)) {
        this.host.markDirty(node, DirtyFlags.Paint);
      }
      next.push(node);
    }
    for (const node of this.painted) {
      if (!next.includes(node) && clearSelectionRange(node)) {
        this.host.markDirty(node, DirtyFlags.Paint);
      }
    }
    this.painted = next;
  }

  /**
   * The node's text laid out in its own coordinates: the content box
   * starts at the padding, as it does for the renderers in the parent's
   * space. Before the first layout the record is empty and there is
   * nothing drawn to select.
   */
  private geometryOf(node: UiNode): ParagraphGeometry {
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
