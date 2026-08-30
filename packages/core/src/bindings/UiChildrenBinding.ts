import type { Observable, Subscription } from 'rxjs';

import { DirtyFlags } from '../graph/DirtyFlags';
import type { NodeId } from '../graph/UiNode';
import type { UiGraph } from '../graph/UiGraph';
import type { UiGraphBuilder } from '../composition/UiGraphBuilder';
import type { UiChild } from '../composition/UiElement';

export type ChildrenBindingId = number;

/**
 * Binds an observable stream of child definitions to a fragment anchor.
 *
 * When the observable emits, the emitted UiElement(s) are reconciled
 * into the fragment's children. The fragment itself is invisible to
 * layout, rendering, and hit-testing; it exists only as a stable anchor
 * in the retained graph.
 */
export class UiChildrenBinding {
  private subscription: Subscription | null = null;

  constructor(
    public readonly id: ChildrenBindingId,
    public readonly parentId: NodeId,
    public readonly fragmentId: NodeId,
    public readonly observable: Observable<UiChild | readonly UiChild[]>,
    private readonly graph: UiGraph,
    private readonly builder: UiGraphBuilder
  ) {}

  /**
   * Start listening to the observable.
   */
  connect(): void {
    if (this.subscription !== null) {
      throw new Error(`Children binding ${this.id} is already connected.`);
    }
    this.subscription = this.observable.subscribe({
      next: value => this.handleValue(value),
      error: error => {
        console.error(`Children binding ${this.id} failed (${this.parentId} → ${this.fragmentId})`, error);
        this.disconnect();
      }
    });
  }

  /**
   * Stop listening and detach the subscription.
   */
  disconnect(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  private handleValue(value: UiChild | readonly UiChild[]): void {
    const definitions = Array.isArray(value) ? (value as readonly UiChild[]) : [value as UiChild];
    const fragment = this.graph.requireNode(this.fragmentId);
    this.builder.reconcileChildren(fragment, definitions);
    const parent = this.graph.requireNode(this.parentId);
    this.graph.markDirty(parent, DirtyFlags.Children);
  }
}
