import { Subscription } from 'rxjs';

import type { UiChild } from '../ui/composition/UiElement';
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
 *   - resolving @Inject() stores
 *   - validating that @State fields are initialized
 *   - calling render() exactly once and caching its output
 *   - invoking onMount / onUnmount hooks
 *   - owning subscriptions that must not outlive the component
 *
 * A host is created and released by the ComponentHostResolver, which
 * in turn is driven by graph reconciliation. The host never decides
 * when it lives or dies.
 */
export class ComponentHost<P extends Record<string, unknown> = Record<string, unknown>> {
  readonly instance: Component;
  readonly element: ComponentElement<P>;

  /**
   * Subscriptions the framework opened on the component's behalf.
   *
   * Anything added here is torn down in dispose(), after onUnmount()
   * has had a chance to run against a still-live component.
   */
  readonly subscriptions = new Subscription();

  private mounted = false;
  private output: UiChild | undefined;

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

  get componentClass(): new () => Component {
    return this.element.componentClass;
  }

  /**
   * Returns what the component renders.
   *
   * render() is invoked exactly once per instance. Subsequent calls
   * return the cached output, because updates are expressed through
   * observable props and children rather than by re-rendering.
   */
  render(): UiChild {
    if (this.output === undefined) {
      this.output = this.instance.render();
    }
    return this.output;
  }

  mount(): void {
    if (this.mounted) {
      return;
    }
    this.mounted = true;
    this.instance.onMount?.();
  }

  /**
   * Runs onUnmount() and tears down framework-owned subscriptions.
   */
  dispose(): void {
    if (this.mounted) {
      this.mounted = false;
      this.instance.onUnmount?.();
    }
    this.subscriptions.unsubscribe();
  }

  /**
   * Updates input values when the parent supplies new props.
   *
   * The already-rendered tree is not rebuilt: a component that read a
   * plain input value during render() keeps the value it captured.
   * Passing an Observable input (or, from Phase C, an input cell) is
   * what makes an input update the rendered output.
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
