import { Observable, Subscription } from 'rxjs';
import type { DirtyFlags } from '../graph/DirtyFlags';
import type { NodeId, NodeProperty, UiNode } from '../graph/UiNode';
import type { UiGraph } from '../graph/UiGraph';

export type BindingId = number;

export class UiBinding<T> {
  constructor(
    public readonly id: BindingId,
    public readonly node: UiNode,
    public readonly property: NodeProperty,
    public readonly observable: Observable<T>,
    private readonly graph: UiGraph,
    private readonly dirtyFlags: DirtyFlags
  ) {}

  /**
   * The bound node's id.
   *
   * The binding holds the node itself so that an emission writes the
   * property without going back through the graph's id index — that
   * index is keyed by a concatenated path, and this runs on every
   * value a bound observable produces.
   */
  get nodeId(): NodeId {
    return this.node.id;
  }

  private subscription: Subscription | null = null;

  private currentValue!: T;

  /**
   * How many values the source has produced since this binding
   * connected, and when the last one arrived.
   *
   * Kept unconditionally rather than behind a devtools switch, because
   * the question they answer — "is this prop bound, to what, and is it
   * still emitting" — is asked *after* something has already gone
   * wrong, and a counter that only starts when the panel opens would
   * answer it about a different run. The cost is an increment and one
   * `performance.now()` per emission, against a write that already
   * walks the override cascade and marks a node dirty.
   *
   * `emittedAt` is on the emitting thread's clock, which is why the
   * node report sends an age rather than the reading itself: a panel
   * on another thread cannot subtract it from its own.
   */
  private emissions = 0;
  private lastEmittedAt = 0;

  /**
   * Start listening to the Observable.
   */
  connect(): void {
    if (this.subscription !== null) {
      throw new Error(`Binding ${this.id} is already connected.`);
    }
    this.subscription = this.observable.subscribe({
      next: value => {
        this.currentValue = value;
        this.emissions++;
        this.lastEmittedAt = now();
        this.graph.updateNodeProperty(this.node, this.property, value, this.dirtyFlags);
      },
      error: error => {
        this.graph.handleBindingError(this, error);
        this.disconnect();
      }
    });
  }

  /**
   * Stop listening to the Observable.
   */
  disconnect(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  /**
   * Whether this binding is currently subscribed.
   */
  connected(): boolean {
    return this.subscription !== null;
  }

  /**
   * Most recently emitted value.
   */
  value(): T {
    return this.currentValue;
  }

  /** How many values the source has produced since `connect`. */
  emissionCount(): number {
    return this.emissions;
  }

  /**
   * When the last value arrived, on the clock of the thread that owns
   * the graph, or null before the first one.
   */
  emittedAt(): number | null {
    return this.emissions === 0 ? null : this.lastEmittedAt;
  }
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}
