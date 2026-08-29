import { UiNodeType } from '../ui/graph/UiNodeType';
import type { UiNode } from '../ui/graph/UiNode';
import type { LayoutRecord } from '../ui/layout';
import { resolvePropertyByName } from '../ui/properties/UiPropertyResolver';
import { colorToRgba, normalizeColor } from '../ui/properties/UiColor';
import { normalizeBorderRadius } from '../ui/properties/UiBorderRadius';
import type { UiBoxShadow } from '../ui/properties/UiBoxShadow';

interface DebugNodeInfo {
  node: UiNode;
  record: LayoutRecord | undefined;
}

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
 * A debug visualization that renders both layout geometry and paint
 * properties so theme changes are visible in the DOM preview.
 */
export class ThemeDebugView {
  constructor(private readonly container: HTMLElement) {}

  render(info: readonly DebugNodeInfo[], maxNodes = 2000): void {
    this.container.innerHTML = '';
    if (info.length === 0) {
      return;
    }
    if (info.length > maxNodes) {
      const note = document.createElement('div');
      note.className = 'pg-note';
      note.textContent = `${info.length} nodes — rendering disabled (stress mode).`;
      this.container.appendChild(note);
      return;
    }
    const root = info[0];
    const byNode = new Map(info.map(entry => [entry.node, entry]));
    this.container.appendChild(this.renderNode(root, byNode, 0, 0));
  }

  private renderNode(
    info: DebugNodeInfo,
    byNode: ReadonlyMap<UiNode, DebugNodeInfo>,
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

    this.applyPaintStyles(node, el);

    const label = document.createElement('span');
    label.className = 'pg-label';
    label.textContent = `${shortId(node.id)} ${Math.round(rec.x)},${Math.round(rec.y)} ${Math.round(rec.width)}x${Math.round(rec.height)}`;
    el.appendChild(label);

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

  private applyPaintStyles(node: UiNode, el: HTMLElement): void {
    const backgroundColor = resolvePropertyByName(node, 'backgroundColor');
    if (backgroundColor !== undefined) {
      const color = normalizeColor(backgroundColor);
      if (color !== undefined) {
        el.style.backgroundColor = colorToRgba(color);
      }
    }

    const borderColor = resolvePropertyByName(node, 'borderColor');
    const borderWidth = resolvePropertyByName(node, 'borderWidth');
    if (borderColor !== undefined) {
      const color = normalizeColor(borderColor);
      if (color !== undefined) {
        el.style.borderColor = colorToRgba(color);
      }
    }
    if (typeof borderWidth === 'number' && borderWidth > 0) {
      el.style.borderWidth = `${borderWidth}px`;
      el.style.borderStyle = 'solid';
    } else {
      el.style.borderWidth = '0';
      el.style.borderStyle = 'none';
    }

    const borderRadius = resolvePropertyByName(node, 'borderRadius');
    if (borderRadius !== undefined) {
      const radius = normalizeBorderRadius(borderRadius);
      if (radius !== undefined) {
        el.style.borderRadius = `${radius.topLeft}px ${radius.topRight}px ${radius.bottomRight}px ${radius.bottomLeft}px`;
      }
    }

    const color = resolvePropertyByName(node, 'color');
    if (color !== undefined) {
      const textColor = normalizeColor(color);
      if (textColor !== undefined) {
        el.style.color = colorToRgba(textColor);
      }
    }

    const boxShadows = resolvePropertyByName<readonly UiBoxShadow[] | undefined>(node, 'boxShadows');
    if (boxShadows !== undefined && boxShadows.length > 0) {
      el.style.boxShadow = boxShadows.map(shadow => shadowToCss(shadow)).join(', ');
    }
  }
}

function shadowToCss(shadow: UiBoxShadow): string {
  const inset = shadow.inset ? 'inset ' : '';
  return `${inset}${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blurRadius}px ${shadow.spreadRadius}px ${colorToRgba(shadow.color)}`;
}

function shortId(id: string): string {
  return id.includes(':') ? id.slice(id.lastIndexOf(':') + 1) : id;
}

function emptyRecord(): LayoutRecord {
  return { width: 0, height: 0, scrollX: 0, scrollY: 0 } as LayoutRecord;
}
