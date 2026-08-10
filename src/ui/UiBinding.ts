import { Observable, Subscription } from 'rxjs';
import { DirtyFlags } from './DirtyFlags';
import { type NodeId } from './UiNode';
import { UiGraph } from './UiGraph';

export type BindingId = number;
export type NodeProperty = string;

export class UiBinding<T> {
  constructor(
    public readonly id: BindingId,
    public readonly nodeId: NodeId,
    public readonly property: NodeProperty,
    private readonly observable: Observable<T>,
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
