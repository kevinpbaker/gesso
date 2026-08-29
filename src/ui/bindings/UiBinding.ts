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
   * Start listening to the Observable.
   */
  connect(): void {
    if (this.subscription !== null) {
      throw new Error(`Binding ${this.id} is already connected.`);
    }
    this.subscription = this.observable.subscribe({
      next: value => {
        this.currentValue = value;
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
}
