import type { LayoutRecord } from './LayoutRecord';
import type { UiNode } from '../graph/UiNode';

export interface Transform {
  x: number;
  y: number;
}

/**
 * Maps a container's content space into its own outer
 * coordinate space.
 *
 * Content starts at the box origin plus padding, then scroll
 * shifts it, so the mapping is a pure translation. Descendant
 * layout boxes never change when scroll does.
 */
export function contentOffset(record: LayoutRecord): Transform {
  return {
    x: record.paddingLeft - record.scrollX,
    y: record.paddingTop - record.scrollY
  };
}

/**
 * Reads the world position of a node in layout coordinates.
 *
 * LayoutRecords store x/y already in absolute layout-root
 * space: placers compute child positions as
 * `parent.x + parent.padding + offset`, so every box is
 * expressed relative to the layout root with no chain walk
 * required. Scroll translation is intentionally excluded —
 * it is applied separately per scroll container via
 * contentOffset.
 *
 * Writes into out (a mutable x/y holder) to avoid allocation in
 * hot paths.
 */
export function accumulatedOffsetTo(
  node: UiNode,
  records: ReadonlyMap<UiNode, LayoutRecord>,
  out: { x: number; y: number }
): void {
  const record = records.get(node);
  if (record === undefined) {
    out.x = 0;
    out.y = 0;
    return;
  }
  out.x = record.x;
  out.y = record.y;
}
