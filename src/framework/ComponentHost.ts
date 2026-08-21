import type { UiElement } from '../ui/composition/UiElement';
import type { Component } from './Component';
import { type ComponentElement } from './ComponentElement';
import { getComponentMetadata } from './metadata';
import type { Store } from './store/Store';
import type { StoreRegistry } from './store/StoreRegistry';

/**
 * Owns a single component instance and its lifecycle.
 *
 * The host is responsible for:
 *   - instantiating the component class
 *   - assigning input values from props
 *   - validating that @State fields are initialized
 *   - calling render() once
 *   - invoking onMount / onUnmount hooks
 */
export class ComponentHost<P extends Record<string, unknown>> {
  readonly instance: Component;
  readonly element: ComponentElement<P>;

  private mounted = false;

  constructor(
    element: ComponentElement<P>,
    private readonly stores: StoreRegistry
  ) {
    this.element = element;
    this.instance = new element.componentClass();
    this.wireInputs();
    this.wireInjects();
    this.validateState();
  }

  render(): UiElement {
    return this.instance.render();
  }

  mount(): void {
    if (this.mounted) {
      return;
    }
    this.mounted = true;
    this.instance.onMount?.();
  }

  unmount(): void {
    if (!this.mounted) {
      return;
    }
    this.mounted = false;
    this.instance.onUnmount?.();
  }

  /**
   * Updates input values when the parent re-renders with new props.
   * Static inputs are overwritten directly.
   */
  updateProps(props: P): void {
    (this.element as { props: P }).props = props;
    this.wireInputs();
  }

  private wireInputs(): void {
    const metadata = getComponentMetadata(this.element.componentClass);
    for (const inputName of metadata.inputs) {
      const value = (this.element.props as Record<string, unknown>)[inputName];
      (this.instance as unknown as Record<string, unknown>)[inputName] = value;
    }
  }

  private wireInjects(): void {
    const metadata = getComponentMetadata(this.element.componentClass);
    for (const [propertyName, StoreClass] of metadata.injects) {
      const store = this.stores.get(StoreClass as unknown as new () => Store);
      (this.instance as unknown as Record<string, unknown>)[propertyName] = store;
    }
  }

  private validateState(): void {
    const metadata = getComponentMetadata(this.element.componentClass);
    for (const stateName of metadata.states) {
      const value = (this.instance as unknown as Record<string, unknown>)[stateName];
      if (value === undefined) {
        throw new Error(
          `Component '${metadata.tag}' declares @State() '${stateName}' but it is not initialized. ` +
            `Initialize it with state(initialValue).`
        );
      }
    }
  }
}
