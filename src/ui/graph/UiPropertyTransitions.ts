import type { AnimatedCell, UiTransitionSpec } from '../animation';
import { AnimationDriver, UiSpring, createTween } from '../animation';
import type { DirtyFlags } from './DirtyFlags';
import type { UiGraph } from './UiGraph';
import type { NodeProperty, UiNode, UiNodeTransitions } from './UiNode';

/**
 * The transitions declared on one node, and the animations they are
 * currently running.
 *
 * This is the same shape as the override cascade and for the same
 * reason `decisions/0022` gives for putting that on the node: **both
 * the builder's static writes and a binding's emissions funnel through
 * `updateNodeProperty`**, so interposing there is the only place that
 * catches both. `node.transitions` is null until an element declares
 * one, so the cost to a tree without transitions is the second field
 * read on the write path.
 *
 * What it interposes is a write, not a binding. The Observable a
 * component wrote is still bound by the graph and still emits into the
 * same property; what changes is that the emission becomes a target
 * rather than a value. So nothing about component identity, binding
 * teardown or `getBindingForProperty` moves, and a `transition` can be
 * added to an element without touching anything else about it.
 */
export class NodeTransitions implements UiNodeTransitions {
  private specs: ReadonlyMap<NodeProperty, UiTransitionSpec> = new Map();
  private readonly cells = new Map<NodeProperty, AnimatedCell<unknown>>();
  private readonly targets = new Map<NodeProperty, unknown>();

  constructor(
    private readonly node: UiNode,
    private readonly graph: UiGraph,
    private readonly driver: AnimationDriver
  ) {}

  /** Replaces what the element declares; a property dropped from the list stops animating. */
  setSpecs(specs: ReadonlyMap<NodeProperty, UiTransitionSpec>): void {
    // Deleting the current key while iterating a Map is defined and
    // does not skip the next one.
    for (const property of this.cells.keys()) {
      if (!specs.has(property)) {
        this.stopProperty(property);
      }
    }
    this.specs = specs;
  }

  get size(): number {
    return this.specs.size;
  }

  /**
   * Takes over a write, or declines it.
   *
   * Declines when the property has no transition, when the node has no
   * value yet — a node's *first* value is not a change and animating
   * from nothing would mean animating from a default nobody asked for
   * — and when the two values cannot be blended (`interpolatorFor`
   * says which, and why).
   */
  write(property: NodeProperty, value: unknown, flags: DirtyFlags): boolean {
    const spec = this.specs.get(property);
    if (spec === undefined) {
      return false;
    }
    if (!this.node.properties.has(property)) {
      return false;
    }
    const current = this.node.properties.get(property);
    if (Object.is(current, value)) {
      return false;
    }
    // Already on its way there: a binding that re-emits the same target
    // must not restart the animation, or a spring would never settle.
    if (this.cells.has(property) && Object.is(this.targets.get(property), value)) {
      return true;
    }
    const cell = this.cellFor(property, flags);
    const started = this.startAnimation(cell, value, spec, property);
    if (!started) {
      this.stopProperty(property);
      return false;
    }
    this.targets.set(property, value);
    return true;
  }

  /** Cancels everything, for a node leaving the tree or dropping the prop. */
  release(): void {
    for (const cell of this.cells.values()) {
      this.driver.stop(cell);
    }
    this.cells.clear();
    this.targets.clear();
    this.specs = new Map();
  }

  private stopProperty(property: NodeProperty): void {
    const cell = this.cells.get(property);
    if (cell !== undefined) {
      this.driver.stop(cell);
      this.cells.delete(property);
    }
    this.targets.delete(property);
  }

  /**
   * The cell one property animates through, kept for the life of the
   * node: the driver keys its running set by cell identity, so a fresh
   * adapter per write would leave the previous animation running.
   *
   * Writing goes through `updateNodePropertyNow`, which is the path a
   * plain write takes minus this class — so a modifier's override still
   * sits on top of an animated value, exactly as it sits on top of a
   * bound one.
   */
  private cellFor(property: NodeProperty, flags: DirtyFlags): AnimatedCell<unknown> {
    let cell = this.cells.get(property);
    if (cell !== undefined) {
      return cell;
    }
    const node = this.node;
    const graph = this.graph;
    cell = {
      get value(): unknown {
        return node.properties.get(property);
      },
      set value(next: unknown) {
        graph.updateNodePropertyNow(node, property, next, flags);
      }
    };
    this.cells.set(property, cell);
    return cell;
  }

  private startAnimation(
    cell: AnimatedCell<unknown>,
    to: unknown,
    spec: UiTransitionSpec,
    property: NodeProperty
  ): boolean {
    if (spec.kind === 'spring') {
      if (typeof cell.value !== 'number' || typeof to !== 'number') {
        warnNotInterpolable(property);
        return false;
      }
      const previous = this.driver.animationFor(cell);
      const velocity = previous instanceof UiSpring ? previous.currentVelocity : 0;
      this.driver.start(
        new UiSpring(cell as AnimatedCell<number>, to, {
          spring: spec.spring,
          velocity,
          restDelta: spec.restDelta,
          reducedMotion: spec.reducedMotion
        })
      );
      return true;
    }
    const tween = createTween(cell, to, {
      duration: spec.duration,
      easing: spec.easing,
      stepMs: spec.stepMs,
      reducedMotion: spec.reducedMotion
    });
    if (tween === undefined) {
      warnNotInterpolable(property);
      return false;
    }
    this.driver.start(tween);
    return true;
  }
}

const warnedProperties = new Set<string>();

/**
 * One warning per property, then silence.
 *
 * Not an error: a `transition` on a property whose values cannot be
 * blended should still leave a working screen, and the value does get
 * written. But it must not be silent, because "my transition does
 * nothing" is otherwise indistinguishable from a typo.
 */
function warnNotInterpolable(property: NodeProperty): void {
  if (warnedProperties.has(property)) {
    return;
  }
  warnedProperties.add(property);
  console.warn(
    `A 'transition' was declared for '${property}', but its values cannot be blended, so it is written directly. ` +
      `Numbers, UiColor objects and transforms can be animated; typed lengths (percent, fr, auto) and palette ` +
      `names cannot — see interpolatorFor in src/ui/animation/Interpolate.ts.`
  );
}

/** Test hook: forgets which properties have been reported. */
export function resetTransitionWarnings(): void {
  warnedProperties.clear();
}
