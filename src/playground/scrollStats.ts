import { UiNodeType } from '../ui/graph/UiNodeType';
import type { PlaygroundNodeInfo } from './LayoutPlayground';

/**
 * Formats the scroll-view reading for the status bar.
 *
 * Kept in its own DOM-free module because the render worker reports
 * this line too, and it previously reached for it inside the control
 * panel — dragging the whole sidebar, and every DOM API it touches,
 * into a worker bundle that has no document to use them on.
 */
export function scrollStatsText(info: readonly PlaygroundNodeInfo[]): string {
  const scroll = info.find(entry => entry.node.type === UiNodeType.ScrollView);
  if (scroll === undefined || scroll.record === undefined) {
    return 'No scroll view in this scene.';
  }
  const record = scroll.record;
  return (
    `viewport ${Math.round(record.width)}×${Math.round(record.height)} · ` +
    `content ${Math.round(record.contentWidth)}×${Math.round(record.contentHeight)} · ` +
    `offset ${Math.round(record.scrollX)},${Math.round(record.scrollY)}`
  );
}
