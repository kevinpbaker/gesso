import { EMPTY, isObservable, type Observable, type Subscription } from 'rxjs';

import {
  AnimationDriver,
  UiSharedElements,
  UiSpring,
  createTween,
  type AnimatedCell,
  type UiSpringOptions,
  type UiTweenOptions
} from '../animation';

import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiEnvironmentKey } from '../environment/UiEnvironmentKey';
import type { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { clearOverrideProperty, writeOverrideProperty } from '../graph/UiPropertyOverrides';
import type { UiEventListener, UiEventListenerOptions, UiInputDispatcher } from '../input/UiInputDispatcher';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { UiEventType } from '../input/UiInputEvent';
import type { DecorationShape } from '../rendering/Decorations';
import { findPropertyDefinition, propertyEffects } from '../properties/UiPropertyRegistry';
import { resolveProperty } from '../properties/UiPropertyResolver';
import { isUiModifier, type UiModifier, type UiModifierKind } from './UiModifier';
import type { UiModifierHost, UiModifierTeardown } from './UiModifierHost';

/** One attached instance: its slot, its current arguments, its host. */
interface Attached {
  readonly kind: UiModifierKind<unknown>;
  readonly slot: string | number;
  readonly host: Host;
  args: unknown;
}

/** Where a modifier's layout access comes from; the runtime supplies it. */
export interface UiModifierLayout {
  box(node: UiNode): LayoutBox | null;
  /** The same node in pre-scroll layout coordinates; see `UiModifierHost.flowBox`. */
  flowBox(node: UiNode): LayoutBox | null;
  /** The node's own scroll offset; see `UiModifierHost.scrollOffset`. */
  scroll(node: UiNode): { x: number; y: number } | null;
  onLayout(node: UiNode, listener: (box: LayoutBox) => void): () => void;
}

/**
 * Where a modifier's focus access comes from.
 *
 * Supplied by the runtime, which owns the focus manager. Kept behind
 * an interface for the same reason layout is: `packages/core/src/composition`
 * must not depend on the input stack, and a headless build has
 * neither.
 */
export interface UiModifierFocus {
  isFocused(node: UiNode): boolean;
  focus(node: UiNode): void;
  onFocusChange(node: UiNode, listener: (focused: boolean) => void): () => void;
}

/** Where a modifier's environment access comes from. */
export interface UiModifierEnvironment {
  read<T>(node: UiNode, key: UiEnvironmentKey<T>): T;
  onChange(node: UiNode, listener: () => void): () => void;
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
  /** Built on the first `decorate`, so an undecorated node allocates nothing. */
  private decorations: NodeDecorations | null = null;

  constructor(
    private readonly node: UiNode,
    private readonly graph: UiGraph,
    private readonly dispatcher?: UiInputDispatcher,
    private readonly layout?: UiModifierLayout,
    private readonly focus?: UiModifierFocus,
    private readonly environment?: UiModifierEnvironment,
    private readonly animations?: AnimationDriver,
    private readonly sharedElements?: UiSharedElements
  ) {}

  /** The merged decoration list, created on demand. */
  private decorationsFor(): NodeDecorations {
    if (this.decorations === null) {
      this.decorations = new NodeDecorations(this.node, this.graph);
    }
    return this.decorations;
  }

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

    for (const [order, entry] of next.entries()) {
      entry.host.setOrder(order);
    }
    // Order is semantic for decorations too: a node paints its
    // modifiers' shapes in the order the element listed them.
    this.decorations?.reorder();

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
    const host = new Host(this.node, this.graph, kind.name, () => this.decorationsFor(), {
      dispatcher: this.dispatcher,
      layout: this.layout,
      focus: this.focus,
      environment: this.environment,
      animations: this.animations,
      sharedElements: this.sharedElements
    });
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

/**
 * The host handed to one attached modifier.
 *
 * Its `source` symbol is what the override cascade records, so two
 * instances of one kind on a node write independently and each
 * restores only its own.
 */
interface HostServices {
  dispatcher?: UiInputDispatcher;
  layout?: UiModifierLayout;
  focus?: UiModifierFocus;
  environment?: UiModifierEnvironment;
  animations?: AnimationDriver;
  sharedElements?: UiSharedElements;
}

class Host implements UiModifierHost {
  private teardowns: UiModifierTeardown[] = [];
  private readonly source: symbol;
  private readonly written = new Set<string>();
  private readonly subscriptions = new Map<string, Subscription>();
  private order = 0;
  private decorated = false;
  /** Cells this modifier is driving, stopped when it detaches. */
  private readonly animated = new Set<AnimatedCell<unknown>>();

  constructor(
    readonly node: UiNode,
    private readonly graph: UiGraph,
    private readonly name: string,
    private readonly decorations: () => NodeDecorations,
    private readonly services: HostServices
  ) {
    this.source = Symbol(name);
  }

  /** The modifier's position in the element's list; later wins. */
  setOrder(order: number): void {
    if (order === this.order) {
      return;
    }
    this.order = order;
    for (const property of this.written) {
      this.write(property, this.node.properties.get(property));
    }
    if (this.decorated) {
      this.decorations().setOrder(this.source, order);
    }
  }

  get<T>(property: string): T {
    const definition = findPropertyDefinition<T>(property);
    if (definition === undefined) {
      throw new Error(`Modifier '${this.name}' read unknown property '${property}' on node '${this.node.id}'.`);
    }
    return resolveProperty(this.node, definition);
  }

  set(property: string, value: unknown): void {
    if (findPropertyDefinition(property) === undefined) {
      throw new Error(`Modifier '${this.name}' wrote unknown property '${property}' on node '${this.node.id}'.`);
    }
    this.subscriptions.get(property)?.unsubscribe();
    this.subscriptions.delete(property);
    if (isObservable(value)) {
      // Held for as long as the modifier is attached; each emission is
      // another write of the same override.
      this.subscriptions.set(
        property,
        (value as Observable<unknown>).subscribe(next => this.write(property, next))
      );
      this.written.add(property);
      return;
    }
    this.write(property, value);
  }

  clear(property: string): void {
    this.subscriptions.get(property)?.unsubscribe();
    this.subscriptions.delete(property);
    if (!this.written.delete(property)) {
      return;
    }
    clearOverrideProperty(this.graph, this.node, property, this.source, propertyEffects(property));
  }

  on(type: UiEventType, listener: UiEventListener, options?: UiEventListenerOptions): void {
    const dispatcher = this.services.dispatcher;
    if (dispatcher === undefined) {
      warnMissingDispatcher(this.name);
      return;
    }
    dispatcher.addEventListener(this.node, type, listener, options);
    this.own(() => dispatcher.removeEventListener(this.node, type, listener, options));
  }

  layoutBox(): LayoutBox | null {
    return this.services.layout?.box(this.node) ?? null;
  }

  flowBox(): LayoutBox | null {
    return this.services.layout?.flowBox(this.node) ?? null;
  }

  onLayout(listener: (box: LayoutBox) => void): void {
    const layout = this.services.layout;
    if (layout === undefined) {
      warnMissingLayout(this.name);
      return;
    }
    this.own(layout.onLayout(this.node, listener));
  }

  environment<T>(key: UiEnvironmentKey<T>): T {
    const environment = this.services.environment;
    if (environment === undefined) {
      // The default is what an unprovided key resolves to anyway, so a
      // headless build reads the same value the tree would.
      return key.defaultValue;
    }
    return environment.read(this.node, key);
  }

  onEnvironment(listener: () => void): void {
    const environment = this.services.environment;
    if (environment === undefined) {
      warnMissing(this.name, 'follow its environment', 'environment');
      return;
    }
    this.own(environment.onChange(this.node, listener));
  }

  focus(): void {
    const focus = this.services.focus;
    if (focus === undefined) {
      warnMissing(this.name, 'move focus', 'focus');
      return;
    }
    focus.focus(this.node);
  }

  isFocused(): boolean {
    return this.services.focus?.isFocused(this.node) ?? false;
  }

  onFocusChange(listener: (focused: boolean) => void): void {
    const focus = this.services.focus;
    if (focus === undefined) {
      warnMissing(this.name, 'follow focus', 'focus');
      return;
    }
    this.own(focus.onFocusChange(this.node, listener));
  }

  decorate(shapes: readonly DecorationShape[] | null): void {
    this.decorated = shapes !== null;
    this.decorations().set(this.source, this.order, shapes);
  }

  animate<T>(cell: AnimatedCell<T>, to: T, options: UiTweenOptions): Observable<T> {
    const driver = this.services.animations;
    const tween = driver === undefined ? undefined : createTween(cell, to, options);
    if (driver === undefined || tween === undefined) {
      if (driver === undefined) {
        warnMissing(this.name, 'animate a value', 'animations');
      }
      cell.value = to;
      return EMPTY as Observable<T>;
    }
    this.animated.add(cell as AnimatedCell<unknown>);
    return driver.start(tween);
  }

  spring(cell: AnimatedCell<number>, to: number, options: UiSpringOptions): Observable<number> {
    const driver = this.services.animations;
    if (driver === undefined) {
      warnMissing(this.name, 'animate a value', 'animations');
      cell.value = to;
      return EMPTY as Observable<number>;
    }
    this.animated.add(cell as AnimatedCell<unknown>);
    // Retargeting a spring keeps the velocity it had, as
    // `AnimationService.spring` does: a spring that started again from
    // rest every time it was re-aimed would crawl, which is exactly
    // what a modifier re-aimed once a frame does.
    const previous = driver.animationFor(cell);
    const velocity = options.velocity ?? (previous instanceof UiSpring ? previous.currentVelocity : 0);
    return driver.start(new UiSpring(cell, to, { ...options, velocity }));
  }

  own(teardown: UiModifierTeardown): void {
    this.teardowns.push(teardown);
  }

  scrollOffset(): { x: number; y: number } | null {
    return this.services.layout?.scroll(this.node) ?? null;
  }

  stopAnimation<T>(cell: AnimatedCell<T>): void {
    this.services.animations?.stop(cell as AnimatedCell<unknown>);
  }

  get shared(): UiSharedElements | null {
    const registry = this.services.sharedElements;
    if (registry === undefined) {
      warnMissing(this.name, 'share an element across a tree change', 'sharedElements');
      return null;
    }
    return registry;
  }

  requestFrame(): void {
    this.graph.markDirty(this.node, DirtyFlags.Paint);
  }

  private write(property: string, value: unknown): void {
    this.written.add(property);
    writeOverrideProperty(
      this.graph,
      this.node,
      property,
      { source: this.source, name: this.name, order: this.order, value },
      propertyEffects(property)
    );
  }

  /**
   * Restores everything this modifier wrote, then runs its teardowns
   * in reverse, as a stack unwinds.
   */
  release(): void {
    // clear() deletes the entry it is given, which is the one being
    // visited; removing the current element of a Set mid-iteration is
    // defined and does not skip the next.
    for (const property of this.written) {
      this.clear(property);
    }
    if (this.decorated) {
      this.decorate(null);
    }
    for (const cell of this.animated) {
      this.services.animations?.stop(cell);
    }
    this.animated.clear();
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
 * The merged decorations of one node.
 *
 * Every modifier that decorates contributes its own list; the node
 * paints the concatenation in modifier order, which is the same rule
 * the override cascade uses and for the same reason — order in the
 * element's list is the only thing that can settle a disagreement, and
 * it is the one a reader can see.
 *
 * `node.decorations` goes back to null when the last contributor
 * leaves, so a node that was decorated and is not any more costs
 * exactly what it did before.
 */
class NodeDecorations {
  private readonly bySource = new Map<symbol, { order: number; shapes: readonly DecorationShape[] }>();

  constructor(
    private readonly node: UiNode,
    private readonly graph: UiGraph
  ) {}

  set(source: symbol, order: number, shapes: readonly DecorationShape[] | null): void {
    if (shapes === null || shapes.length === 0) {
      if (!this.bySource.delete(source)) {
        return;
      }
    } else {
      this.bySource.set(source, { order, shapes });
    }
    this.rebuild();
  }

  setOrder(source: symbol, order: number): void {
    const entry = this.bySource.get(source);
    if (entry === undefined || entry.order === order) {
      return;
    }
    entry.order = order;
    this.rebuild();
  }

  reorder(): void {
    if (this.bySource.size > 1) {
      this.rebuild();
    }
  }

  private rebuild(): void {
    if (this.bySource.size === 0) {
      this.node.decorations = null;
      this.graph.markDirty(this.node, DirtyFlags.Paint);
      return;
    }
    const merged: DecorationShape[] = [];
    for (const entry of [...this.bySource.values()].sort((a, b) => a.order - b.order)) {
      merged.push(...entry.shapes);
    }
    this.node.decorations = merged;
    this.graph.markDirty(this.node, DirtyFlags.Paint);
  }
}

let warnedAboutLayout = false;

function warnMissingLayout(name: string): void {
  if (warnedAboutLayout) {
    return;
  }
  warnedAboutLayout = true;
  console.warn(
    `Modifier '${name}' asked to follow its node's box, but the UiGraphBuilder was constructed without layout access. ` +
      `Construct it with { layout } for onLayout to fire.`
  );
}

let warnedAboutDispatcher = false;

function warnMissingDispatcher(name: string): void {
  if (warnedAboutDispatcher) {
    return;
  }
  warnedAboutDispatcher = true;
  console.warn(
    `Modifier '${name}' asked to listen for input, but the UiGraphBuilder was constructed without a dispatcher. ` +
      `Construct it with { dispatcher } for modifiers to receive events.`
  );
}

const warnedAbout = new Set<string>();

/** One warning per missing service, as the two above do for theirs. */
function warnMissing(name: string, what: string, option: string): void {
  if (warnedAbout.has(option)) {
    return;
  }
  warnedAbout.add(option);
  console.warn(
    `Modifier '${name}' asked to ${what}, but the UiGraphBuilder was constructed without ${option} access. ` +
      `Construct it with { ${option} }, as the runtime does.`
  );
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
