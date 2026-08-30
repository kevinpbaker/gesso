import type { UiChild } from '../ui/composition/UiElement';

/**
 * Base class for all Nodal framework components.
 *
 * Components are class-based. They declare reactive state with
 * a `state()` cell, inputs with `@Input()`, and return a UiElement tree
 * from `render()`. The framework calls `render()` once per mount;
 * after that, observable emissions in the returned tree drive updates.
 */
export abstract class Component {
  /**
   * Called once after the component's UiNode subtree has been created
   * and all observable bindings are connected.
   */
  onMount?(): void;

  /**
   * Called once when the component is being removed from the graph.
   */
  onUnmount?(): void;

  /**
   * Returns the component's UI definition.
   *
   * Called exactly once per component instance. Dynamic content is
   * expressed through Observable props and children, never by
   * re-invoking render().
   *
   * Returning an Observable is allowed for structural changes that
   * cannot be expressed as observable children (routing, for example).
   * The framework reconciles the component's root on each emission.
   */
  abstract render(): UiChild;
}
