import type { Reactive, UiChild, UiNode } from 'gesso-core';
import { internalState } from '../InternalState';

export type OverlayPlacement =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end'
  | 'right'
  | 'right-start'
  | 'right-end';

/** A rectangle inside an anchor, from its border box's top left. */
export interface OverlayRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * One thing floating above the app: a menu, a tooltip, a dialog.
 *
 * Anchored entries are placed beside `anchor` (a UiNode obtained from a
 * `ref` prop) by the layout engine, which flips them to the other side
 * when they would overflow and shifts them to stay on screen; they
 * follow the anchor when it scrolls. Unanchored entries use the edge
 * offsets, all relative to the viewport, or `center` for the axes that
 * should stay in the middle of it instead.
 */
export interface OverlayEntry {
  /** Stable identity: opening an id that is already open replaces it. */
  readonly id: string;
  readonly content: UiChild;
  readonly anchor?: UiNode | null;
  /**
   * The part of `anchor` to open beside, in the anchor's own
   * coordinates: a character in a field, from
   * `EditingService.caretRectOf(field, offset)`. The entry follows the
   * anchor as it would without it, through scrolling and layout. It can
   * be a stream, so a list under a word being typed moves with the word
   * when it wraps to the next line, without being opened again.
   */
  readonly anchorRect?: Reactive<OverlayRect | undefined>;
  /** Default 'bottom'. */
  readonly placement?: OverlayPlacement;
  /** Gap between content and anchor. */
  readonly offset?: number;
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
  /**
   * A point to open beside, relative to the viewport: where a context
   * menu was asked for. Placed as an anchor of no size would be, with
   * `placement`, so an entry that would run off an edge flips or shifts
   * to stay on screen — which `top` and `left` do not do.
   */
  readonly point?: { readonly x: number; readonly y: number };
  /**
   * Centre an unanchored entry in the viewport along an axis.
   *
   * The edges of that axis stop being a position and become the region
   * to centre within — unset they are the whole viewport, so a dialog
   * asking for `'x'` sits in the middle however wide the window is, and
   * one asking for `'both'` sits in the middle of the screen. The other
   * axis is untouched: `center: 'x'` with `bottom: 24` is a toast
   * centred along the bottom edge.
   *
   * Ignored on an anchored entry, which is placed beside its anchor.
   */
  readonly center?: 'x' | 'y' | 'both';
  /**
   * Close the entry when the pointer goes down, or the wheel turns,
   * anywhere outside it. A backdrop takes those events, so nothing
   * underneath scrolls while the entry is open. Without it the entry
   * stays open and follows its anchor through scrolling.
   */
  readonly dismissOnOutsidePress?: boolean;
  /**
   * Put the backdrop underneath even when a press outside doesn't close
   * the entry, as a modal does: everything beneath it, positioned
   * panels with a zIndex included, is drawn under the backdrop and takes
   * no press or wheel through it, as the page under a browser's modal
   * `<dialog>` is inert. Without it, an entry that doesn't close on an
   * outside press has no backdrop, and a press beside it reaches the
   * page.
   */
  readonly modal?: boolean;
  /** Order among open entries; later entries paint on top by default. */
  readonly zIndex?: number;
  /**
   * A node whose environment the content should inherit.
   *
   * The layer is mounted above the app root, so an entry's content is
   * nowhere near the tree that opened it and inherits none of its
   * scoped values: a menu opened inside a dark-themed panel would come
   * out light. Passing a node from that tree — a trigger, or the
   * placeholder the component left where it was declared — carries the
   * theme across.
   */
  readonly environment?: UiNode | null;
  readonly onClose?: () => void;
}

/**
 * The open overlays, as a local store.
 *
 * Every runtime registers one. Components inject it and open or close
 * entries through actions; the OverlayLayer the runtime mounts above
 * the app root renders whatever is open. Being a store keeps the
 * framework's one rule intact — components never mutate shared state
 * directly — and gives devtools a log of what opened when.
 *
 * It must stay on the render thread: entries hold UiElements and
 * UiNodes, which never cross a worker boundary.
 */
export class OverlayService {
  readonly entries = internalState<readonly OverlayEntry[]>([]);
  open(entry: OverlayEntry): void {
    const others = this.entries.value.filter(existing => existing.id !== entry.id);
    this.entries.value = [...others, entry];
  }
  close(id: string): void {
    const closing = this.entries.value.find(entry => entry.id === id);
    if (closing === undefined) {
      return;
    }
    this.entries.value = this.entries.value.filter(entry => entry !== closing);
    closing.onClose?.();
  }
  closeAll(): void {
    const closing = this.entries.value;
    if (closing.length === 0) {
      return;
    }
    this.entries.value = [];
    for (const entry of closing) {
      entry.onClose?.();
    }
  }

  isOpen(id: string): boolean {
    return this.entries.value.some(entry => entry.id === id);
  }
}
