import type { UiNodeReport, UiPropReport } from '@gesso/framework';

/**
 * A `UiNodeReport` as DOM: the node inspector's body, shared with the
 * devtools panel so a node read in a corner of the canvas and a node
 * picked from a tree are described in the same words.
 */
export function renderNodeReport(doc: Document, report: UiNodeReport): HTMLElement[] {
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
    out.push(section(doc, 'props'), propList(doc, report.props));
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
.note { color: var(--gd-faint, #6e7681); }
.explanation { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--gd-text-strong, #c9d1d9); }
`;
