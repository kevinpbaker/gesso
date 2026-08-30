import type { UiChild } from '../../ui/composition/UiElement';
import type { UiNode } from '../../ui/graph/UiNode';
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

/**
 * One thing floating above the app: a menu, a tooltip, a dialog.
 *
 * Anchored entries are placed beside `anchor` (a UiNode obtained from a
 * `ref` prop) by the layout engine, which flips them to the other side
 * when they would overflow and shifts them to stay on screen; they
 * follow the anchor when it scrolls. Unanchored entries use the edge
 * offsets, all relative to the viewport.
 */
export interface OverlayEntry {
  /** Stable identity: opening an id that is already open replaces it. */
  readonly id: string;
  readonly content: UiChild;
  readonly anchor?: UiNode | null;
  /** Default 'bottom'. */
  readonly placement?: OverlayPlacement;
  /** Gap between content and anchor. */
  readonly offset?: number;
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
  /**
   * Close the entry when the pointer goes down, or the wheel turns,
   * anywhere outside it. A backdrop takes those events, so nothing
   * underneath scrolls while the entry is open. Without it the entry
   * stays open and follows its anchor through scrolling.
   */
  readonly dismissOnOutsidePress?: boolean;
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
