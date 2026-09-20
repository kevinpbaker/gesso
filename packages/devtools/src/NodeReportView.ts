import { formatAge, type UiNodeReport, type UiPropReport } from 'gesso-framework';

export interface NodeReportViewOptions {
  /**
   * Makes the props editable, calling this with the new value when one
   * is committed; `null` means "remove it", which puts an inherited
   * value back.
   *
   * Absent for a read-only view. The corner inspector passes nothing,
   * because it sets `pointer-events: none` and could not be typed into
   * anyway.
   */
  onEditProp?(name: string, value: unknown): void;
}

/**
 * A `UiNodeReport` as DOM: the node inspector's body, shared with the
 * devtools panel so a node read in a corner of the canvas and a node
 * picked from a tree are described in the same words.
 */
export function renderNodeReport(
  doc: Document,
  report: UiNodeReport,
  options: NodeReportViewOptions = {}
): HTMLElement[] {
  const out: HTMLElement[] = [
    heading(doc, `${report.type} ${report.id}`),
    line(
      doc,
      'box',
      `${round(report.box.width)} × ${round(report.box.height)} at (${round(report.box.x)}, ${round(report.box.y)})`
    )
  ];
  if (report.owners.length > 0) {
    out.push(line(doc, 'rendered by', report.owners.map(owner => owner.name).join(' inside ')));
  }
  if (report.modifiers.length > 0) {
    out.push(line(doc, 'modifiers', report.modifiers.join(', ')));
  }
  if (report.listens.length > 0) {
    out.push(line(doc, 'listens', report.listens.join(', ')));
  }
  if (report.beneath.length > 0) {
    // The answer to a dead click: this node took the press, and these
    // are the nodes it covers at the pointer, topmost first.
    out.push(
      line(
        doc,
        'beneath',
        report.beneath
          .map(under => {
            const owner = under.owner === undefined ? '' : ` (${under.owner})`;
            const listens = under.listens.length === 0 ? '' : ` · ${under.listens.join(', ')}`;
            return `${under.type}${owner}${listens}`;
          })
          .join('; ')
      )
    );
  }
  if (report.semantics !== undefined) {
    const parts = [
      report.semantics.role,
      report.semantics.label === undefined ? undefined : `"${report.semantics.label}"`,
      report.semantics.value,
      report.semantics.states?.join(', ')
    ].filter(part => part !== undefined && part !== '');
    if (parts.length > 0) {
      out.push(line(doc, 'semantics', parts.join(' · ')));
    }
  }
  if (report.props.length > 0) {
    out.push(section(doc, 'props'), propList(doc, report.props, options));
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
    out.push(section(doc, 'environment'), list);
  }
  const explanation = doc.createElement('pre');
  explanation.className = 'explanation';
  explanation.textContent = report.explanation;
  out.push(section(doc, 'layout'), explanation);
  return out;
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
function propList(doc: Document, props: readonly UiPropReport[], options: NodeReportViewOptions): HTMLElement {
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
    if (prop.stream !== undefined) {
      // The three things a "bound" mark never said: what the stream
      // last produced, how many values it has produced, and how long
      // ago. A prop that is not updating and a prop whose stream has
      // said nothing since the screen was built look identical
      // without them.
      const stream = doc.createElement('span');
      stream.className = 'stream';
      const emittedAt = prop.stream.emittedAt;
      const age = emittedAt === null ? 'no value yet' : `${formatAge(Math.max(0, Date.now() - emittedAt))} ago`;
      const count = `${prop.stream.emissions}×`;
      stream.textContent = `${count} · ${age}${prop.stream.connected ? '' : ' · disconnected'}`;
      stream.title = `${prop.stream.source} last emitted ${prop.stream.value}`;
      value.append(stream);
    }
    if (options.onEditProp !== undefined) {
      makeEditable(doc, value, prop, options.onEditProp);
    }
    list.append(term, value);
  }
  return list;
}

/**
 * Turns a prop's value into a field on a click, and writes it back on
 * Enter.
 *
 * Typed rather than stepped, because the values are of every kind a
 * property can hold and a spinner would only serve the numbers. The
 * text is read as JSON when it parses and as a plain string when it
 * does not, so `12`, `"#ff0000"`, `#ff0000` and `[8, 4]` all mean what
 * they look like. Empty removes the property.
 *
 * Escape and blur both cancel: this writes into a running application,
 * and a value committed by looking away is not what anyone meant.
 */
function makeEditable(
  doc: Document,
  cell: HTMLElement,
  prop: UiPropReport,
  commit: (name: string, value: unknown) => void
): void {
  cell.classList.add('editable');
  cell.title = 'Click to edit';
  cell.addEventListener('click', () => {
    if (cell.querySelector('input') !== null) {
      return;
    }
    const field = doc.createElement('input');
    field.type = 'text';
    field.className = 'edit';
    field.value = prop.value;
    cell.textContent = '';
    cell.append(field);
    field.focus();
    field.select();
    const cancel = (): void => {
      cell.textContent = prop.value;
    };
    field.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        cancel();
        return;
      }
      if (event.key !== 'Enter') {
        return;
      }
      const text = field.value.trim();
      commit(prop.name, text === '' ? null : parseValue(text));
    });
    field.addEventListener('blur', cancel);
  });
}

/** JSON where it parses, the text itself where it does not. */
function parseValue(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * The rules the report's elements use, for any stylesheet that shows one.
 *
 * Colours are the devtools panel's custom properties with the dark
 * palette as fallback, so the corner inspector, which defines none of
 * them, is unchanged, and the panel recolours the same report by
 * defining them.
 */
export const NODE_REPORT_STYLES = `
h1 { margin: 0 0 6px; font-size: 12px; color: var(--gd-accent, #79c0ff); overflow-wrap: anywhere; }
h2 {
  margin: 10px 0 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--gd-muted, #8b949e);
}
p { margin: 0 0 2px; }
.label { color: var(--gd-muted, #8b949e); }
.rows { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; margin: 0; }
dt { color: var(--gd-muted, #8b949e); overflow-wrap: anywhere; }
dt.modifier { color: var(--gd-purple, #d2a8ff); }
dt.binding { color: var(--gd-green, #7ee787); }
dt.provided { color: var(--gd-orange, #ffa657); }
dd { margin: 0; overflow-wrap: anywhere; }
dd.editable { cursor: pointer; border-radius: 3px; }
dd.editable:hover { background: var(--gd-bg-hover, #21262d); }
.edit {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--gd-accent, #79c0ff);
  border-radius: 3px;
  padding: 0 3px;
  background: var(--gd-bg, #0d1117);
  color: var(--gd-text, #e6edf3);
  font: inherit;
}
.note { color: var(--gd-faint, #6e7681); }
.stream { display: block; color: var(--gd-green, #7ee787); }
.explanation { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--gd-text-strong, #c9d1d9); }
`;
