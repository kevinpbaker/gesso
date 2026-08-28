import type { ComponentLikeElement, UiChild } from './UiElement';

/**
 * Contract the framework layer implements so the runtime can mount
 * components during reconciliation.
 *
 * The runtime deliberately knows nothing about component classes,
 * decorators, lifecycle hooks, or stores. It knows only that a
 * ComponentLikeElement occupying a slot in the tree can be turned
 * into a UiChild, and that the slot may later go away.
 *
 * Hosts are addressed by the id of the Fragment anchor the builder
 * creates for the slot. That anchor is the component's identity: it
 * is stable across reconciles, survives the component rendering a
 * different root element type, and is removed exactly when the
 * component leaves the tree.
 */
export interface ComponentResolver {
  /**
   * Mounts or reuses the host owning `anchorId` and returns what the
   * component currently renders.
   *
   * Called on every reconcile pass that reaches the slot. Returning
   * the same value for an unchanged component is expected; the
   * builder reconciles it idempotently.
   */
  resolve(element: ComponentLikeElement, anchorId: string): UiChild;

  /**
   * Tears down the host owning `anchorId`.
   *
   * Called for every Fragment node in a removed subtree, so ids that
   * do not correspond to a host must be ignored rather than treated
   * as an error.
   */
  release(anchorId: string): void;

  /**
   * Invokes onMount() for every host mounted during the reconcile
   * pass that just completed.
   *
   * The builder calls this only when the outermost pass finishes, so
   * hooks observe a fully built subtree with all bindings connected.
   */
  flushMounts(): void;
}
