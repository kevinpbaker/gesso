/**
 * What a node is, as plain data (`ROADMAP.md` F7's inspector).
 *
 * The inspector shows a node's props, its resolved environment, its
 * bindings and their sources, its layout explanation and which
 * component owns it. Every one of those lives in the render thread,
 * and none of them can cross a `postMessage`: a `UiNode` is a live
 * object, an `Observable` is a subscription, a component instance is a
 * class. So the report is built where the tree is and only strings
 * cross, which is the same rule the existing `inspect` message follows
 * with `formatExplanation`'s text, and the same reason.
 *
 * That makes the report lossy on purpose. It is a description of a
 * node for a person to read, not a handle on one: nothing in it can be
 * clicked back to the object it came from, and nothing in it is worth
 * asserting on beyond the fact that it says what the tree says.
 */
export interface UiNodeReport {
  readonly id: string;
  /** `UiNodeType`, as its string value. */
  readonly type: string;
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /**
   * The components that rendered this node, nearest first.
   *
   * A node has no backpointer to a component: the builder gives every
   * component slot a Fragment anchor whose id carries `:component:`,
   * and the resolver keeps one host per anchor id. Walking up the
   * ancestors for those anchors is therefore the only way to answer
   * "who rendered this", and it answers it exactly, because that
   * anchor *is* the component's identity.
   */
  readonly owners: readonly UiOwnerReport[];
  readonly props: readonly UiPropReport[];
  readonly environment: readonly UiEnvironmentReport[];
  /** Attached modifier kinds, in the order the element listed them. */
  readonly modifiers: readonly string[];
  /** The event types this node has listeners for, e.g. `click`. */
  readonly listens: readonly string[];
  /**
   * What lies under the pointer beneath this node, topmost first: the
   * nodes this one is painted over and would take a press from. The
   * answer to "I clicked the button and nothing happened": the node the
   * inspector shows is the one that took the press, and this is the
   * button it covered. Empty when the pointer is not over the node.
   */
  readonly beneath: readonly UiBeneathReport[];
  readonly semantics?: UiSemanticsReport;
  /** `formatExplanation` of the node's layout, which is L8's answer. */
  readonly explanation: string;
}

/** A node under the inspected one at the pointer. */
export interface UiBeneathReport {
  readonly id: string;
  readonly type: string;
  /** The component that rendered it, if one did. */
  readonly owner?: string;
  /** The event types it listens for, so a covered button reads as one. */
  readonly listens: readonly string[];
}

export interface UiOwnerReport {
  /** The `@Define` tag, else the class or function name. */
  readonly name: string;
  readonly anchorId: string;
}

/** Where a property's current value came from. */
export type UiPropOrigin = 'element' | 'binding' | 'modifier';

export interface UiPropReport {
  readonly name: string;
  readonly value: string;
  readonly origin: UiPropOrigin;
  /**
   * For a modifier write, the modifiers writing it and what the
   * element declared; for a binding, that it is bound. Absent for a
   * plain element value.
   */
  readonly source?: string;
}

export interface UiEnvironmentReport {
  readonly key: string;
  readonly value: string;
  /** Whether this node provides the value rather than inheriting it. */
  readonly provided: boolean;
}

export interface UiSemanticsReport {
  readonly role?: string;
  readonly label?: string;
  readonly value?: string;
  readonly states?: readonly string[];
}

/**
 * A value as one line a person can read.
 *
 * `JSON.stringify` alone is not enough: the two values a canvas UI
 * puts in a property that it cannot handle are a `Set` (a node's
 * visual states) and a function (an event handler), and it prints both
 * as `{}`, which in an inspector reads as a bug in the application
 * rather than one in the inspector.
 */
export function printPropValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'function') {
    return `ƒ ${value.name === '' ? '(anonymous)' : value.name}`;
  }
  if (typeof value === 'symbol') {
    return value.toString();
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Set) {
    return `Set { ${[...value].map(printPropValue).join(', ')} }`;
  }
  if (value instanceof Map) {
    return `Map { ${[...value].map(([key, entry]) => `${printPropValue(key)}: ${printPropValue(entry)}`).join(', ')} }`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(printPropValue).join(', ')}]`;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // A cyclic value, or one with a throwing getter. The inspector
    // must not be the thing that breaks while explaining a break.
    return String(value);
  }
}

/** The report as text, for a console or a test failure. */
export function formatNodeReport(report: UiNodeReport): string {
  const lines: string[] = [`${report.type} '${report.id}'`];
  if (report.owners.length > 0) {
    lines.push(`rendered by ${report.owners.map(owner => owner.name).join(' inside ')}`);
  }
  if (report.modifiers.length > 0) {
    lines.push(`modifiers: ${report.modifiers.join(', ')}`);
  }
  if (report.listens.length > 0) {
    lines.push(`listens: ${report.listens.join(', ')}`);
  }
  if (report.beneath.length > 0) {
    lines.push('beneath, at the pointer:');
    for (const under of report.beneath) {
      const owner = under.owner === undefined ? '' : ` (${under.owner})`;
      const listens = under.listens.length === 0 ? '' : `, listens: ${under.listens.join(', ')}`;
      lines.push(`  ${under.type} ${under.id}${owner}${listens}`);
    }
  }
  if (report.props.length > 0) {
    lines.push('props:');
    for (const prop of report.props) {
      lines.push(`  ${prop.name} = ${prop.value}${prop.source === undefined ? '' : ` (${prop.source})`}`);
    }
  }
  if (report.environment.length > 0) {
    lines.push('environment:');
    for (const entry of report.environment) {
      lines.push(`  ${entry.key} = ${entry.value}${entry.provided ? ' (provided here)' : ''}`);
    }
  }
  if (report.semantics !== undefined) {
    const parts = [
      report.semantics.role === undefined ? undefined : `role ${report.semantics.role}`,
      report.semantics.label === undefined ? undefined : `label ${report.semantics.label}`,
      report.semantics.value === undefined ? undefined : `value ${report.semantics.value}`,
      report.semantics.states === undefined || report.semantics.states.length === 0
        ? undefined
        : `states ${report.semantics.states.join(', ')}`
    ].filter(part => part !== undefined);
    if (parts.length > 0) {
      lines.push(`semantics: ${parts.join(' · ')}`);
    }
  }
  lines.push(report.explanation);
  return lines.join('\n');
}
