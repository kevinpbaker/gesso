import { UiNodeType, type UiNode, type LayoutRecord } from '@gesso/core';
import type { PlaygroundNodeInfo } from './LayoutPlayground';

const TYPE_CLASS: Record<string, string> = {
  [UiNodeType.Row]: 'row',
  [UiNodeType.Column]: 'column',
  [UiNodeType.Box]: 'box',
  [UiNodeType.Text]: 'text',
  [UiNodeType.Button]: 'button',
  [UiNodeType.ScrollView]: 'scroll',
  [UiNodeType.Grid]: 'grid'
};

/**
 * Temporary DOM debug visualization of layout geometry.
 *
 * Renders each node's LayoutRecord as an absolutely-positioned
 * rectangle. Records are in absolute layout-root coordinates,
 * pre-scroll; children are offset relative to their parent's
 * record, and a scroll container translates its children by
 * (-scrollX, -scrollY), matching how a real renderer maps them.
 *
 * This is a debug tool, not a renderer: it reads records the
 * layout engine already produced and never computes geometry.
 */
export class LayoutDebugView {
  constructor(
    private readonly container: HTMLElement,
    private readonly onSelect: (node: UiNode) => void
  ) {}

  render(info: readonly PlaygroundNodeInfo[], maxNodes = 2000): void {
    this.container.innerHTML = '';
    if (info.length === 0) {
      return;
    }
    if (info.length > maxNodes) {
      const note = document.createElement('div');
      note.className = 'pg-note';
      note.textContent = `${info.length} nodes — box rendering disabled (stress mode).`;
      this.container.appendChild(note);
      return;
    }
    const root = info[0];
    const byNode = new Map(info.map(entry => [entry.node, entry]));
    this.container.appendChild(this.renderNode(root, byNode, 0, 0));
  }

  private renderNode(
    info: PlaygroundNodeInfo,
    byNode: ReadonlyMap<UiNode, PlaygroundNodeInfo>,
    relX: number,
    relY: number
  ): HTMLElement {
    const { node, record } = info;
    const el = document.createElement('div');
    el.className = `pg-box ${TYPE_CLASS[node.type] ?? ''}`;
    el.dataset.nodeId = node.id;

    const rec = record ?? emptyRecord();
    el.style.left = `${relX}px`;
    el.style.top = `${relY}px`;
    el.style.width = `${Math.max(0, rec.width)}px`;
    el.style.height = `${Math.max(0, rec.height)}px`;

    const label = document.createElement('span');
    label.className = 'pg-label';
    label.textContent = `${shortId(node.id)} ${Math.round(rec.x)},${Math.round(rec.y)} ${Math.round(rec.width)}x${Math.round(rec.height)}`;
    el.appendChild(label);

    el.addEventListener('click', event => {
      event.stopPropagation();
      this.onSelect(node);
    });

    const isScroll = node.type === UiNodeType.ScrollView;
    if (isScroll) {
      el.style.overflow = 'hidden';
    }

    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      const childInfo = byNode.get(child);
      if (childInfo === undefined || childInfo.record === undefined) {
        continue;
      }
      const childRec = childInfo.record;
      const childX = isScroll ? childRec.x - rec.scrollX - rec.x : childRec.x - rec.x;
      const childY = isScroll ? childRec.y - rec.scrollY - rec.y : childRec.y - rec.y;
      el.appendChild(this.renderNode(childInfo, byNode, childX, childY));
    }

    return el;
  }
}

function shortId(id: string): string {
  return id.includes(':') ? id.slice(id.lastIndexOf(':') + 1) : id;
}

function emptyRecord(): LayoutRecord {
  return { width: 0, height: 0, scrollX: 0, scrollY: 0 } as LayoutRecord;
}
