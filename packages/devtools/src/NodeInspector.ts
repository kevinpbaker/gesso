import type { UiNodeReport } from '@gesso/framework';
import { NODE_REPORT_STYLES, renderNodeReport } from './NodeReportView';

/**
 * The node inspector (`ROADMAP.md` F7): what the thing under the
 * pointer is, and where every part of it came from.
 *
 * L8 already answered "why is this box that size" and printed it as
 * text. This is the rest of the question a person actually has, which
 * turned out to be four more: what did the element declare, what is a
 * modifier writing over it, what is it inheriting, and which component
 * rendered it. The layout explanation is still here, at the bottom,
 * because it is still the answer to the first one.
 *
 * It is DOM, in a shadow root, over the canvas, for the same reasons
 * the error overlay is: the application it is inspecting owns the
 * canvas, and a panel drawn inside the scene would be part of the
 * scene it is describing. It takes no pointer events at all, because
 * the person is hovering the canvas underneath it and a panel that
 * swallowed the pointer would erase the very thing it is showing.
 */
export interface NodeInspector {
  /** Shows the report, or hides the panel when null. */
  set(report: UiNodeReport | null): void;
  dispose(): void;
}

export interface NodeInspectorOptions {
  /**
   * Which corner it floats in. Default `'bottom-left'`.
   *
   * A corner rather than a docked side, because the panel must not
   * change the size of the element the application is mounted in: a
   * readout that resized the canvas would relayout the scene it is
   * describing, and the boxes it is pointing at would move.
   */
  readonly corner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export function mountNodeInspector(host: HTMLElement, options: NodeInspectorOptions = {}): NodeInspector {
  const doc = host.ownerDocument;
  const view = doc.defaultView;
  const position = view?.getComputedStyle(host).position ?? 'static';
  const restore = position === 'static' ? host.style.position : null;
  if (position === 'static') {
    host.style.position = 'relative';
  }

  const container = doc.createElement('div');
  const root = container.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = STYLES;
  const panel = doc.createElement('div');
  panel.className = `panel ${options.corner ?? 'bottom-left'}`;
  panel.hidden = true;
  root.append(style, panel);
  host.appendChild(container);

  const render = (report: UiNodeReport): void => {
    panel.textContent = '';
    panel.append(...renderNodeReport(doc, report));
  };

  return {
    set(report) {
      if (report === null) {
        panel.hidden = true;
        panel.textContent = '';
        return;
      }
      render(report);
      panel.hidden = false;
    },
    dispose() {
      container.remove();
      if (restore !== null) {
        host.style.position = restore;
      }
    }
  };
}

const STYLES = `
:host { all: initial; }
.panel {
  position: absolute;
  z-index: 2147482000;
  max-width: 380px;
  max-height: 70%;
  overflow: auto;
  /* The person is hovering the canvas underneath: the panel showing
     what is under the pointer must never be what is under the pointer. */
  pointer-events: none;
  margin: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(13, 17, 23, 0.94);
  color: #e6edf3;
  font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.panel[hidden] { display: none; }
.top-left { top: 0; left: 0; }
.top-right { top: 0; right: 0; }
.bottom-left { bottom: 0; left: 0; }
.bottom-right { bottom: 0; right: 0; }
${NODE_REPORT_STYLES}
`;
