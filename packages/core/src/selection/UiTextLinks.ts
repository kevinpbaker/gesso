import type { UiNode } from '../graph/UiNode';
import type { UiTextLink } from '../properties/UiTextStyle';
import { resolvedSpansOf } from '../properties/UiTextStyle';
import type { ParagraphGeometry } from './TextSelectionGeometry';

/**
 * Which run of a paragraph the pointer is on, kept on the node.
 *
 * The same shape as `textSelection` and `textMatches`, and for the
 * same reason: paint has a node and a `PaintState` and nothing else,
 * so anything paint must know about a paragraph beyond its properties
 * has to be written onto the node. Here it decides three things — the
 * wash behind the run, the underline that appears under it, and the
 * cursor the shell shows — which is exactly the hover affordance a
 * link owes the person using it.
 */
const TEXT_LINK_HOVER_PROP = 'textLinkHover';

/** Index into the node's runs of the link the pointer is on, or -1. */
export function linkHoverOf(node: UiNode): number {
  const value = node.properties.get(TEXT_LINK_HOVER_PROP);
  return typeof value === 'number' ? value : -1;
}

/** Records the hovered run. Returns whether it changed. */
export function setLinkHover(node: UiNode, index: number): boolean {
  if (linkHoverOf(node) === index) {
    return false;
  }
  if (index < 0) {
    node.properties.delete(TEXT_LINK_HOVER_PROP);
  } else {
    node.properties.set(TEXT_LINK_HOVER_PROP, index);
  }
  return true;
}

/** Forgets the hovered run. Returns whether there was one. */
export function clearLinkHover(node: UiNode): boolean {
  return setLinkHover(node, -1);
}

/** Whether any run of this node's paragraph is a link. */
export function hasTextLinks(node: UiNode): boolean {
  for (const span of resolvedSpansOf(node)) {
    if (span.link !== undefined) {
      return true;
    }
  }
  return false;
}

/** The link of one of a node's runs, or undefined when that run is not one. */
export function linkOf(node: UiNode, index: number): UiTextLink | undefined {
  const spans = resolvedSpansOf(node);
  return index >= 0 && index < spans.length ? spans[index].link : undefined;
}

/**
 * The run under a point, as an index into the node's runs, or -1.
 *
 * Hit-tested against the runs the paragraph was laid out into rather
 * than against character offsets, so a click lands on the run it looks
 * like it landed on: a run's box is its own advance, and the gap
 * between two runs belongs to neither.
 *
 * `y` picks the line by its box, so a point in the leading above the
 * glyphs still hits the line, as it does when selecting.
 */
export function linkRunAtPointIn(geometry: ParagraphGeometry, x: number, y: number): number {
  for (const line of geometry.lines) {
    if (line.runs === undefined || y < line.y || y >= line.y + line.height) {
      continue;
    }
    for (const run of line.runs) {
      if (run.span >= 0 && x >= run.x && x < run.x + run.width) {
        return run.span;
      }
    }
    return -1;
  }
  return -1;
}
