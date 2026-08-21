import type { UiElement } from '../ui/composition/UiElement';

/**
 * Base class for all Nodal framework components.
 *
 * Components are class-based. They declare reactive state with
 * `@State()`, inputs with `@Input()`, and return a UiElement tree
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
   * This is called exactly once per component instance. Dynamic
   * content should be expressed through Observable props or children,
   * not by re-invoking render().
   */
  abstract render(): UiElement;
}
