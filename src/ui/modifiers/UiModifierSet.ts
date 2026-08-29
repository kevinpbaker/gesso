import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { isUiModifier, type UiModifier, type UiModifierKind } from './UiModifier';
import type { UiModifierHost, UiModifierTeardown } from './UiModifierHost';

/** One attached instance: its slot, its current arguments, its host. */
interface Attached {
  readonly kind: UiModifierKind<unknown>;
  readonly slot: string | number;
  readonly host: Host;
  args: unknown;
}

/**
 * The modifiers attached to one node, and their reconciliation.
 *
 * Matching is by `(kind, key ?? position among that kind)`, the same
 * rule keyed children follow: an instance survives a re-render when it
 * lands in the same slot, and its `update` is called only when the
 * arguments actually differ. A kind with no `update` is detached and
 * re-attached instead, which is the honest behaviour for one that
 * cannot describe a change.
 *
 * The set keeps list order, because order is semantic: B1's override
 * layer resolves a conflict in favour of whichever modifier is later.
 */
export class UiModifierSet {
  private attached: Attached[] = [];

  constructor(
    private readonly node: UiNode,
    private readonly graph: UiGraph
  ) {}

  /** The names of what is attached, in order, for the inspector. */
  get names(): string[] {
    return this.attached.map(entry => entry.kind.name);
  }

  get size(): number {
    return this.attached.length;
  }

  /**
   * Brings the attached set in line with what the element declares.
   *
   * Runs after the node's declared props are written and before its
   * children are reconciled, so a modifier sees the element's own
   * values and may act on them before layout reads anything.
   */
  reconcile(modifiers: readonly UiModifier[]): void {
    const previous = this.attached;
    const taken = new Set<Attached>();
    const next: Attached[] = [];
    const ordinals = new Map<symbol, number>();

    for (const modifier of modifiers) {
      const kind = modifier.kind as UiModifierKind<unknown>;
      const ordinal = ordinals.get(kind.key) ?? 0;
      ordinals.set(kind.key, ordinal + 1);
      const slot = modifier.key ?? ordinal;
      const match = previous.find(entry => entry.kind.key === kind.key && entry.slot === slot && !taken.has(entry));
      if (match === undefined) {
        next.push(this.attach(kind, slot, modifier.args));
        continue;
      }
      taken.add(match);
      next.push(this.update(match, modifier.args));
    }

    for (const entry of previous) {
      if (!taken.has(entry)) {
        this.detachOne(entry);
      }
    }
    this.attached = next;
  }

  /** Releases everything, for a node leaving the tree. */
  detach(): void {
    for (let index = this.attached.length - 1; index >= 0; index--) {
      this.detachOne(this.attached[index]);
    }
    this.attached = [];
  }

  private attach(kind: UiModifierKind<unknown>, slot: string | number, args: unknown): Attached {
    const host = new Host(this.node, this.graph);
    const entry: Attached = { kind, slot, host, args };
    kind.attach(host, args);
    return entry;
  }

  private update(entry: Attached, args: unknown): Attached {
    if (Object.is(entry.args, args)) {
      return entry;
    }
    if (entry.kind.update === undefined) {
      // Nothing to tell it, so it is a different instance: tear the old
      // one down before the new one attaches, so their resources never
      // overlap.
      this.detachOne(entry);
      return this.attach(entry.kind, entry.slot, args);
    }
    const previous = entry.args;
    entry.args = args;
    entry.kind.update(entry.host, args, previous);
    return entry;
  }

  private detachOne(entry: Attached): void {
    entry.kind.detach?.(entry.host);
    entry.host.release();
  }
}

/** The host handed to one attached modifier. B0's surface. */
class Host implements UiModifierHost {
  private teardowns: UiModifierTeardown[] = [];

  constructor(
    readonly node: UiNode,
    private readonly graph: UiGraph
  ) {}

  own(teardown: UiModifierTeardown): void {
    this.teardowns.push(teardown);
  }

  requestFrame(): void {
    this.graph.markDirty(this.node, DirtyFlags.Paint);
  }

  /** Runs the teardowns in reverse, as a stack unwinds. */
  release(): void {
    const teardowns = this.teardowns;
    this.teardowns = [];
    for (let index = teardowns.length - 1; index >= 0; index--) {
      const teardown = teardowns[index];
      if (typeof teardown === 'function') {
        teardown();
      } else {
        teardown.unsubscribe();
      }
    }
  }
}

/**
 * Rejects a `modifiers` prop that is not a list of modifiers, naming
 * the node the way an unknown prop does.
 */
export function assertModifierList(node: UiNode, value: unknown): readonly UiModifier[] {
  if (!Array.isArray(value)) {
    throw new Error(`The 'modifiers' prop on node '${node.id}' must be an array, got ${typeof value}.`);
  }
  for (const entry of value) {
    if (!isUiModifier(entry)) {
      throw new Error(
        `The 'modifiers' prop on node '${node.id}' must hold modifiers built by a factory from defineModifier.`
      );
    }
  }
  return value as readonly UiModifier[];
}
