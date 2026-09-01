import type { UiNodeReport, UiPropReport } from '@gesso/framework';

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
    panel.append(
      heading(doc, `${report.type} ${report.id}`),
      line(
        doc,
        'box',
        `${round(report.box.width)} × ${round(report.box.height)} at (${round(report.box.x)}, ${round(report.box.y)})`
      )
    );
    if (report.owners.length > 0) {
      panel.append(line(doc, 'rendered by', report.owners.map(owner => owner.name).join(' inside ')));
    }
    if (report.modifiers.length > 0) {
      panel.append(line(doc, 'modifiers', report.modifiers.join(', ')));
    }
    if (report.semantics !== undefined) {
      const parts = [
        report.semantics.role,
        report.semantics.label === undefined ? undefined : `"${report.semantics.label}"`,
        report.semantics.value,
        report.semantics.states?.join(', ')
      ].filter(part => part !== undefined && part !== '');
      if (parts.length > 0) {
        panel.append(line(doc, 'semantics', parts.join(' · ')));
      }
    }
    if (report.props.length > 0) {
      panel.append(section(doc, 'props'), propList(doc, report.props));
    }
    if (report.environment.length > 0) {
      const list = doc.createElement('dl');
      list.className = 'rows';
      for (const entry of report.environment) {
        const term = doc.createElement('dt');
        term.textContent = entry.key;
        term.className = entry.provided ? 'provided' : '';
        const value = doc.createElement('dd');
        value.textContent = entry.value;
        if (entry.provided) {
          value.append(note(doc, 'provided here'));
        }
        list.append(term, value);
      }
      panel.append(section(doc, 'environment'), list);
    }
    const explanation = doc.createElement('pre');
    explanation.className = 'explanation';
    explanation.textContent = report.explanation;
    panel.append(section(doc, 'layout'), explanation);
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

function heading(doc: Document, text: string): HTMLElement {
  const element = doc.createElement('h1');
  element.textContent = text;
  return element;
}

function section(doc: Document, text: string): HTMLElement {
  const element = doc.createElement('h2');
  element.textContent = text;
  return element;
}

function line(doc: Document, label: string, value: string): HTMLElement {
  const element = doc.createElement('p');
  const name = doc.createElement('span');
  name.className = 'label';
  name.textContent = `${label} `;
  element.append(name, doc.createTextNode(value));
  return element;
}

function note(doc: Document, text: string): HTMLElement {
  const element = doc.createElement('span');
  element.className = 'note';
  element.textContent = ` ${text}`;
  return element;
}

/**
 * The props, with the ones a modifier or a binding is driving marked.
 *
 * The mark is the point of the list. A declared value and a value a
 * modifier wrote over it look identical on the node, and the second is
 * the one that surprises people: B1's cascade is invisible until
 * something says which of the two is on screen.
 */
function propList(doc: Document, props: readonly UiPropReport[]): HTMLElement {
  const list = doc.createElement('dl');
  list.className = 'rows';
  for (const prop of props) {
    const term = doc.createElement('dt');
    term.textContent = prop.name;
    term.className = prop.origin;
    const value = doc.createElement('dd');
    value.textContent = prop.value;
    if (prop.source !== undefined) {
      value.append(note(doc, prop.source));
    }
    list.append(term, value);
  }
  return list;
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
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
h1 { margin: 0 0 6px; font-size: 12px; color: #79c0ff; overflow-wrap: anywhere; }
h2 {
  margin: 10px 0 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #8b949e;
}
p { margin: 0 0 2px; }
.label { color: #8b949e; }
.rows { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; margin: 0; }
dt { color: #8b949e; overflow-wrap: anywhere; }
dt.modifier { color: #d2a8ff; }
dt.binding { color: #7ee787; }
dt.provided { color: #ffa657; }
dd { margin: 0; overflow-wrap: anywhere; }
.note { color: #6e7681; }
.explanation { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; color: #c9d1d9; }
`;
