import { Subscription } from 'rxjs';

import { isObservable, type UiChild } from '../ui/composition/UiElement';
import { InputCell } from './Input';
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
 *   - feeding parent props into @Input() cells
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

  /**
   * What the parent most recently supplied for each input, so an
   * unchanged Observable is not resubscribed on every reconcile.
   */
  private readonly inputSources = new Map<string, unknown>();

  /** Live subscription per Observable-valued input. */
  private readonly inputSubscriptions = new Map<string, Subscription>();

  constructor(
    element: ComponentElement<P>,
    private readonly stores: StoreRegistry
  ) {
    this.element = element;
    this.instance = new element.componentClass();
    this.validateInputs();
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
   * Feeds new parent props into the input cells.
   *
   * The rendered tree is not rebuilt. Because inputs are cells and
   * render() bound them into the tree, pushing a new value through the
   * cell is what updates the output.
   */
  updateProps(props: P): void {
    (this.element as { props: P }).props = props;
    this.wireInputs();
  }

  private wireInputs(): void {
    const metadata = getComponentMetadata(this.element.componentClass);
    const props = this.element.props as Record<string, unknown>;
    for (const inputName of metadata.inputs) {
      const cell = (this.instance as unknown as Record<string, InputCell<unknown>>)[inputName];
      this.applyInput(inputName, cell, props[inputName]);
    }
  }

  /**
   * Connects one input cell to whatever the parent supplied.
   *
   * An absent prop leaves the cell's default in place, so a parent that
   * does not mention an input never clobbers it.
   */
  private applyInput(inputName: string, cell: InputCell<unknown>, provided: unknown): void {
    if (this.inputSources.has(inputName) && this.inputSources.get(inputName) === provided) {
      return;
    }

    const previous = this.inputSubscriptions.get(inputName);
    if (previous !== undefined) {
      previous.unsubscribe();
      this.subscriptions.remove(previous);
      this.inputSubscriptions.delete(inputName);
    }

    this.inputSources.set(inputName, provided);

    if (provided === undefined) {
      return;
    }

    if (isObservable(provided)) {
      const subscription = provided.subscribe(value => cell.next(value));
      this.inputSubscriptions.set(inputName, subscription);
      this.subscriptions.add(subscription);
      return;
    }

    cell.next(provided);
  }

  private validateInputs(): void {
    const metadata = getComponentMetadata(this.element.componentClass);
    for (const inputName of metadata.inputs) {
      const value = (this.instance as unknown as Record<string, unknown>)[inputName];
      if (!(value instanceof InputCell)) {
        throw new Error(
          `Component '${metadata.tag}' declares @Input() '${inputName}' but it is not an input cell. ` +
            `Initialize it with input(defaultValue).`
        );
      }
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
