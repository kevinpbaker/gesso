import { Observable, Subscription } from 'rxjs';
import type { DirtyFlags } from '../graph/DirtyFlags';
import type { NodeId, NodeProperty } from '../graph/UiNode';
import type { UiGraph } from '../graph/UiGraph';

export type BindingId = number;

export class UiBinding<T> {
  constructor(
    public readonly id: BindingId,
    public readonly nodeId: NodeId,
    public readonly property: NodeProperty,
    public readonly observable: Observable<T>,
    private readonly graph: UiGraph,
    private readonly dirtyFlags: DirtyFlags
  ) {}

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
        this.graph.updateProperty(this.nodeId, this.property, value, this.dirtyFlags);
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
