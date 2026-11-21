import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiKeyModifiers } from './UiInputEvent';
import { isScrollContainer, type ScrollContainerState, type ScrollSink } from './UiWheelController';

/**
 * How far an arrow key moves a container, in pixels. Chrome's figure:
 * three lines of body text, near enough.
 */
export const KEY_SCROLL_STEP = 40;

/**
 * How much of a page a Page key or Space keeps in view. Chrome and
 * Firefox both move by the viewport less a strip, so the line that was
 * at the bottom is still on screen at the top to read on from.
 */
const PAGE_OVERLAP = 0.125;

/** A page for a container whose sink does not report its extent. */
const FALLBACK_PAGE = 400;

/** What a key asks of a container: a distance, or an edge. */
type KeyScroll =
  | {
      readonly kind: 'by';
      readonly axis: 'x' | 'y';
      readonly sign: 1 | -1;
      readonly amount: (state: ScrollContainerState) => number;
    }
  | { readonly kind: 'edge'; readonly sign: 1 | -1 };

const step = (): number => KEY_SCROLL_STEP;
const page = (state: ScrollContainerState): number =>
  Math.max(KEY_SCROLL_STEP, (state.viewportHeight ?? FALLBACK_PAGE) * (1 - PAGE_OVERLAP));

/**
 * The key, read as a scroll, or null when it is not one. Any of Ctrl,
 * Alt or Meta held makes it a shortcut rather than a scroll, as it does
 * in a browser.
 */
function readKey(key: string, modifiers: UiKeyModifiers): KeyScroll | null {
  if (modifiers.ctrl || modifiers.alt || modifiers.meta) {
    return null;
  }
  switch (key) {
    case 'ArrowDown':
      return { kind: 'by', axis: 'y', sign: 1, amount: step };
    case 'ArrowUp':
      return { kind: 'by', axis: 'y', sign: -1, amount: step };
    case 'ArrowRight':
      return { kind: 'by', axis: 'x', sign: 1, amount: step };
    case 'ArrowLeft':
      return { kind: 'by', axis: 'x', sign: -1, amount: step };
    case 'PageDown':
      return { kind: 'by', axis: 'y', sign: 1, amount: page };
    case 'PageUp':
      return { kind: 'by', axis: 'y', sign: -1, amount: page };
    case ' ':
      return { kind: 'by', axis: 'y', sign: modifiers.shift ? -1 : 1, amount: page };
    case 'Home':
      return { kind: 'edge', sign: -1 };
    case 'End':
      return { kind: 'edge', sign: 1 };
    default:
      return null;
  }
}

function hasRoom(state: ScrollContainerState, scroll: KeyScroll): boolean {
  const axis = scroll.kind === 'edge' ? 'y' : scroll.axis;
  const offset = axis === 'x' ? state.scrollX : state.scrollY;
  const max = axis === 'x' ? state.maxScrollX : state.maxScrollY;
  return scroll.sign > 0 ? offset < max - 0.5 : offset > 0.5;
}

/**
 * Scrolls a container from the keyboard: the arrows by a step, Page Up
 * and Page Down and Space (Shift+Space back) by most of a page, and
 * Home and End to the top and bottom.
 *
 * A browser does this for any scrolling box, and a canvas has to do it
 * itself or a keyboard-only reader cannot get past the first screen of
 * a long pane. It is the last default a key gets: a component that
 * binds the same keys (a list moving its selection, a slider stepping)
 * cancels the key in its own listener and is never second-guessed, and
 * a focused editable or button has already had its turn.
 *
 * The container is the nearest one around the focused node with room
 * to move that way, so a nested list at its end hands the key to the
 * pane around it, as a wheel does. With nothing focused it is the
 * largest container on screen with room, which is the document a
 * browser would scroll.
 */
export class UiKeyboardScroller {
  constructor(private readonly sink: ScrollSink) {}

  handleKey(focused: UiNode | null, key: string, modifiers: UiKeyModifiers): boolean {
    const scroll = readKey(key, modifiers);
    if (scroll === null || (focused !== null && focused.type === UiNodeType.EditableText)) {
      return false;
    }
    const target = focused === null ? this.largest(scroll) : this.around(focused, scroll);
    if (target === null) {
      return false;
    }
    const { node, state } = target;
    if (scroll.kind === 'edge') {
      this.sink.scrollBy(node, 0, scroll.sign > 0 ? state.maxScrollY - state.scrollY : -state.scrollY, 'smooth');
    } else {
      const distance = scroll.sign * scroll.amount(state);
      this.sink.scrollBy(node, scroll.axis === 'x' ? distance : 0, scroll.axis === 'y' ? distance : 0, 'smooth');
    }
    this.sink.revealScrollbars?.(node);
    return true;
  }

  /**
   * Whether `handleKey` would scroll something for the key, without
   * scrolling it: what the shell is told ahead of the key, so it cancels
   * the page's own scroll only when a pane here will move instead.
   */
  wouldScroll(focused: UiNode | null, key: string, modifiers: UiKeyModifiers): boolean {
    const scroll = readKey(key, modifiers);
    if (scroll === null || (focused !== null && focused.type === UiNodeType.EditableText)) {
      return false;
    }
    return (focused === null ? this.largest(scroll) : this.around(focused, scroll)) !== null;
  }

  private around(start: UiNode, scroll: KeyScroll): { node: UiNode; state: ScrollContainerState } | null {
    for (let node: UiNode | null = start; node !== null; node = node.parent) {
      if (!isScrollContainer(node)) {
        continue;
      }
      const state = this.sink.containerState(node);
      if (state !== undefined && hasRoom(state, scroll)) {
        return { node, state };
      }
    }
    return null;
  }

  private largest(scroll: KeyScroll): { node: UiNode; state: ScrollContainerState } | null {
    let best: { node: UiNode; state: ScrollContainerState } | null = null;
    let bestArea = -1;
    for (const node of this.sink.scrollContainers?.() ?? []) {
      const state = this.sink.containerState(node);
      if (state === undefined || !hasRoom(state, scroll)) {
        continue;
      }
      const area = (state.viewportWidth ?? 0) * (state.viewportHeight ?? 0);
      if (area > bestArea) {
        best = { node, state };
        bestArea = area;
      }
    }
    return best;
  }
}
