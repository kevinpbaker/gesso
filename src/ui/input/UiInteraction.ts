import { UiNodeType } from '../graph/UiNodeType';
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
  return node.type === UiNodeType.Button;
}

/**
 * The cursor to show over a node: its own `cursor`, else the nearest
 * ancestor's, as CSS inherits it — so a button sets `cursor: 'pointer'`
 * once and its label inherits it. Null when nothing along the path
 * sets one, which the shell shows as the default arrow.
 */
export function resolveCursor(node: UiNode | null): string | null {
  for (let current = node; current !== null; current = current.parent) {
    const cursor = current.properties.get('cursor');
    if (typeof cursor === 'string' && cursor.length > 0) {
      return cursor;
    }
  }
  return null;
}
