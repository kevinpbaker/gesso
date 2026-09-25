import { UiNodeType } from '../graph/UiNodeType';
import { linkHoverOf } from '../selection/UiTextLinks';
import type { UiNode } from '../graph/UiNode';

/**
 * Central definition of a node's participation in input.
 *
 * The hit tester, pointer controller, focus manager and keyboard
 * routing all read the same predicates, so "what is interactive"
 * has exactly one meaning across the system.
 *
 * Model:
 *   disabled       — the node AND its subtree are inert: no pointer
 *                    events, no focus, no keyboard, skipped by hit
 *                    testing. This is the same shape as the CSS
 *                    `inert` attribute: a disabled Button stays
 *                    inert even when it wraps Text children.
 *   pointerEvents  — 'none' makes the node AND its subtree skipped
 *                    by hit testing (CSS-like). Use it to block a
 *                    whole region.
 *   hitTestable    — false skips only the node itself; children are
 *                    still tested. Use it for decorative containers
 *                    that must not swallow clicks.
 *   visible/opacity — false/0 hides the subtree (matching the
 *                    renderer, which returns before painting
 *                    children), so the subtree is skipped too.
 *   focusable      — true opts any node into focus; false opts out.
 *                    Buttons are focusable by default.
 */

/** The node and its whole subtree are excluded from pointer input. */
export function isNodeInert(node: UiNode): boolean {
  if (node.properties.get('disabled') === true) {
    return true;
  }
  if (node.properties.get('pointerEvents') === 'none') {
    return true;
  }
  if (node.properties.get('visible') === false) {
    return true;
  }
  const opacity = node.properties.get('opacity');
  if (typeof opacity === 'number' && Number.isFinite(opacity) && opacity <= 0) {
    return true;
  }
  return false;
}

/** The node itself cannot be the target of a hit, but children can. */
export function isNodeHitTestable(node: UiNode): boolean {
  return node.properties.get('hitTestable') !== false;
}

/**
 * Whether the node may hold logical focus.
 *
 * Disabled/inert nodes can never be focused. `focusable` explicitly
 * opts in (true) or opts out (false); without an explicit value,
 * interactive controls (Button) are focusable and everything else is
 * not. The graph Root never participates in tab order.
 */
export function isNodeFocusable(node: UiNode): boolean {
  if (isNodeInert(node) || node.type === UiNodeType.Root) {
    return false;
  }
  const focusable = node.properties.get('focusable');
  if (focusable === true) {
    return true;
  }
  if (focusable === false) {
    return false;
  }
  return node.type === UiNodeType.Button || node.type === UiNodeType.EditableText;
}

/**
 * Whether Tab should stop here.
 *
 * Every tab stop is focusable and not every focusable node is a tab
 * stop, which is the distinction `tabindex="-1"` draws in the DOM and
 * the one this engine was missing. `focusable` answers "may this node
 * hold focus at all", and that is the wrong question for a container:
 * a dialog's body must be able to *take* the keyboard, so that opening
 * a dialog whose content is a sentence does not hand it to nothing, and
 * must not be a place Tab *lands*, or every dialog gains a stop that
 * announces nothing and does nothing.
 *
 * So `tabStop: false` means focusable, reachable by a press and by
 * `focus()`, and skipped by the cycle. It says nothing on a node that
 * is not focusable in the first place, because there is no order to be
 * out of.
 */
export function isNodeTabStop(node: UiNode): boolean {
  return isNodeFocusable(node) && node.properties.get('tabStop') !== false;
}

/**
 * Whether the user may select this node's text with the pointer.
 *
 * `selectable` inherits down the tree the way CSS `user-select` does:
 * the nearest ancestor that sets it decides, and text is selectable
 * when nothing along the path says otherwise. A `Button` opts its
 * subtree out, as browsers' default stylesheets do — dragging across a
 * control should press it, not highlight its label.
 */
export function isNodeSelectable(node: UiNode): boolean {
  for (let current: UiNode | null = node; current !== null; current = current.parent) {
    const value = current.properties.get('selectable');
    if (value === true) {
      return true;
    }
    if (value === false) {
      return false;
    }
    if (current.type === UiNodeType.Button) {
      return false;
    }
  }
  return true;
}

/**
 * The cursor to show over a node: its own `cursor`, else the nearest
 * ancestor's, as CSS inherits it — so a button sets `cursor: 'pointer'`
 * once and its label inherits it. Null when nothing along the path
 * sets one, which the shell shows as the default arrow.
 */
export function resolveCursor(node: UiNode | null): string | null {
  if (node !== null && linkHoverOf(node) >= 0) {
    // An inline link is a run rather than a node, so it cannot set a
    // `cursor` property of its own; the run the pointer is on is
    // written onto the paragraph and read back here.
    return 'pointer';
  }
  for (let current = node; current !== null; current = current.parent) {
    const cursor = current.properties.get('cursor');
    if (typeof cursor === 'string' && cursor.length > 0) {
      return cursor;
    }
    if (current.type === UiNodeType.EditableText) {
      // An editable shows the I-beam unless told otherwise, as a
      // textarea does.
      return 'text';
    }
  }
  return null;
}
