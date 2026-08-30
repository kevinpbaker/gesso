import type { DirtyFlags } from './DirtyFlags';
import type { UiGraph } from './UiGraph';
import type { NodeProperty, UiNode, UiPropertyOverride, UiPropertyOverrides } from './UiNode';

/**
 * The cascade a modifier writes into.
 *
 *   effective(property) = the last override in modifier order,
 *                         else what the element declared
 *
 * Keeping the element's own value rather than replacing it is what
 * makes a modifier safe to detach: dragging can write `transform` and
 * `opacity` for as long as the drag lasts, and dropping restores
 * exactly what the element asked for — including "nothing", which
 * restores inheritance from the environment rather than a default.
 *
 * Everything here funnels into `graph.applyResolvedProperty`, so
 * layout, paint, input and the environment read what they always read.
 */

/**
 * A write from the element: a plain prop, or an emission from a bound
 * Observable. It updates the declared value; whether it reaches the
 * node depends on whether a modifier is currently overriding it.
 */
export function writeDeclaredProperty(
  graph: UiGraph,
  node: UiNode,
  property: NodeProperty,
  value: unknown,
  flags: DirtyFlags
): boolean {
  const overrides = node.overrides?.get(property);
  if (overrides === undefined) {
    return graph.applyResolvedProperty(node, property, true, value, flags);
  }
  overrides.declared = { present: true, value };
  return applyEffective(graph, node, property, overrides, flags);
}

/**
 * A write from a modifier. Replaces that modifier's own entry, or adds
 * one in its position in the list.
 */
export function writeOverrideProperty(
  graph: UiGraph,
  node: UiNode,
  property: NodeProperty,
  override: Omit<UiPropertyOverride, 'value'> & { value: unknown },
  flags: DirtyFlags
): boolean {
  const overrides = overridesFor(node, property);
  const existing = overrides.entries.find(entry => entry.source === override.source);
  if (existing !== undefined) {
    existing.value = override.value;
    existing.order = override.order;
  } else {
    warnOnConflict(node, property, overrides.entries, override);
    overrides.entries.push({ ...override });
  }
  overrides.entries.sort((a, b) => a.order - b.order);
  return applyEffective(graph, node, property, overrides, flags);
}

/** Removes one modifier's write, restoring whatever was under it. */
export function clearOverrideProperty(
  graph: UiGraph,
  node: UiNode,
  property: NodeProperty,
  source: symbol,
  flags: DirtyFlags
): boolean {
  const overrides = node.overrides?.get(property);
  if (overrides === undefined) {
    return false;
  }
  const index = overrides.entries.findIndex(entry => entry.source === source);
  if (index === -1) {
    return false;
  }
  overrides.entries.splice(index, 1);
  const changed = applyEffective(graph, node, property, overrides, flags);
  if (overrides.entries.length === 0) {
    // Nothing is overriding it any more: drop the record so the write
    // path goes back to being a single field read.
    node.overrides?.delete(property);
    if (node.overrides?.size === 0) {
      node.overrides = null;
    }
  }
  return changed;
}

/** The names of the modifiers overriding a property, in order. */
export function overrideSources(node: UiNode, property: NodeProperty): string[] {
  return (node.overrides?.get(property)?.entries ?? []).map(entry => entry.name);
}

function applyEffective(
  graph: UiGraph,
  node: UiNode,
  property: NodeProperty,
  overrides: UiPropertyOverrides,
  flags: DirtyFlags
): boolean {
  const last = overrides.entries[overrides.entries.length - 1];
  if (last !== undefined) {
    return graph.applyResolvedProperty(node, property, true, last.value, flags);
  }
  return graph.applyResolvedProperty(node, property, overrides.declared.present, overrides.declared.value, flags);
}

function overridesFor(node: UiNode, property: NodeProperty): UiPropertyOverrides {
  if (node.overrides === null) {
    node.overrides = new Map();
  }
  let overrides = node.overrides.get(property);
  if (overrides === undefined) {
    // First override of this property: remember what the element had,
    // including that it had nothing.
    const present = node.properties.has(property);
    overrides = { declared: { present, value: present ? node.properties.get(property) : undefined }, entries: [] };
    node.overrides.set(property, overrides);
  }
  return overrides;
}

/** Warned about once per node and property; two writers is usually a bug. */
const warned = new Set<string>();

function warnOnConflict(
  node: UiNode,
  property: NodeProperty,
  entries: readonly UiPropertyOverride[],
  incoming: Omit<UiPropertyOverride, 'value'>
): void {
  if (entries.length === 0) {
    return;
  }
  const key = `${node.id}:${property}`;
  if (warned.has(key)) {
    return;
  }
  warned.add(key);
  console.warn(
    `Modifiers '${entries.map(entry => entry.name).join("', '")}' and '${incoming.name}' both write ` +
      `'${property}' on node '${node.id}'. The one later in the list wins.`
  );
}

/** Test hook: forgets which conflicts have been reported. */
export function resetOverrideWarnings(): void {
  warned.clear();
}
