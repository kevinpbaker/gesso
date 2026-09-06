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

/** As much of a node as a one-line path needs. */
export interface NodePathTarget {
  /** `UiNodeType`, as its string value. */
  readonly type: string;
  readonly id: string;
  /** The node's accessible name, when it has one. */
  readonly label?: string;
}

/**
 * A node as a path somebody can read: `App > TrackScreen > ActionRow >
 * Button "Like"`.
 *
 * Written for error messages rather than for the inspector, and the
 * difference decides the shape. A report is read beside the tree it
 * came from, so an id is a handle; an error is read in a console or an
 * overlay with no tree beside it, and `node-4821` there is a fact
 * about nothing. The owner chain is what a person recognises, because
 * it is the components they wrote.
 *
 * Owners arrive nearest-first, as `UiNodeReport.owners` computes them,
 * and read outermost-first, as a path does. The accessible name is the
 * leaf when there is one: two `Button`s in the same row are only told
 * apart by what they say.
 */
export function formatNodePath(owners: readonly UiOwnerReport[], node: NodePathTarget): string {
  const names = owners.map(owner => owner.name).reverse();
  if (names.length === 0) {
    // Nothing rendered it: a node built without a component around it,
    // which is rare enough that the id is the only thing to say.
    return node.label === undefined || node.label === '' ? `${node.type} ${node.id}` : `${node.type} "${node.label}"`;
  }
  const path = names.join(' > ');
  return node.label === undefined || node.label === '' ? path : `${path} "${node.label}"`;
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
  /** For a bound property, the stream feeding it. Absent otherwise. */
  readonly stream?: UiStreamReport;
}

/**
 * The stream behind a bound property: which one, what it last said,
 * and when (`EXCELLENCE_ROADMAP.md` X15).
 *
 * "Is this value bound" was the third question `decisions/0045` set
 * out to answer, and the report answered it with a yes. A yes is not
 * enough to debug with: a prop that is not updating and a prop whose
 * stream has not emitted since the screen was built look identical on
 * the node, and so did they in the report.
 *
 * `emittedAt` is on the epoch clock rather than the thread's own,
 * because the panel reading it is one or two threads away and
 * `performance.now()` counts from each thread's creation. The panel
 * subtracts its own `Date.now()`.
 *
 * An epoch stamp rather than an age for a second reason: an age
 * changes on every frame, and the runtime decides whether to re-send a
 * selected node's report by comparing it with the last one. A report
 * carrying an age would differ from itself sixty times a second and
 * the panel would be redrawn for a clock tick.
 */
export interface UiStreamReport {
  /**
   * What feeds it: a labelled cell's own name (`queue.current`), else
   * what kind of stream it is.
   */
  readonly source: string;
  /** `cell` when the stream named itself, `observable` when it did not. */
  readonly kind: 'cell' | 'observable';
  /** The last value the stream produced, printed. */
  readonly value: string;
  /** How many values it has produced since the property was bound. */
  readonly emissions: number;
  /** When the last value arrived, as epoch milliseconds, or null before the first. */
  readonly emittedAt: number | null;
  /** Whether the subscription is still live. A false here is a torn-down binding still on the node. */
  readonly connected: boolean;
}

/**
 * A bound property's stream, as far as the report is concerned.
 *
 * Structural rather than `UiBinding`, so this module keeps its one
 * rule: it describes a node and imports nothing that holds one.
 */
export interface BoundStream {
  readonly id: number;
  readonly observable: unknown;
  value(): unknown;
  emissionCount(): number;
  emittedAt(): number | null;
  connected(): boolean;
}

/**
 * Describes the stream driving a property.
 *
 * `timeOrigin` turns the binding's own reading into an epoch stamp:
 * `performance.timeOrigin` on a thread that has one, and zero where
 * the reading is already an epoch.
 */
export function describeStream(binding: BoundStream, timeOrigin: number): UiStreamReport {
  // A labelled cell says where the value comes from: `Card.title`,
  // `queue.current`. An anonymous pipe only has the binding's id.
  const label = (binding.observable as { label?: unknown } | null)?.label;
  const labelled = typeof label === 'string' && label !== '';
  const emittedAt = binding.emittedAt();
  return {
    source: labelled ? label : `observable #${binding.id}`,
    kind: labelled ? 'cell' : 'observable',
    value: printPropValue(binding.value()),
    emissions: binding.emissionCount(),
    emittedAt: emittedAt === null ? null : timeOrigin + emittedAt,
    connected: binding.connected()
  };
}

/** A stream as one line: what feeds the prop, and how long ago it said so. */
export function formatStream(stream: UiStreamReport, now: number = Date.now()): string {
  const when = stream.emittedAt === null ? 'no value yet' : `${formatAge(Math.max(0, now - stream.emittedAt))} ago`;
  const emissions = `${stream.emissions} emission${stream.emissions === 1 ? '' : 's'}`;
  return `${stream.source} · ${emissions} · ${when}${stream.connected ? '' : ' · disconnected'}`;
}

/** An age in the largest unit that stays readable. */
export function formatAge(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms / 60_000)}m`;
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
      if (prop.stream !== undefined) {
        lines.push(`    ${formatStream(prop.stream)}`);
      }
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
