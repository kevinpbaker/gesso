import { Subscription, type Observable } from 'rxjs';
import { bounds, type BoundsCell } from './bounds';
import { ChannelRegistry } from './channel/ChannelRegistry';
import { ServiceRegistry } from './service/ServiceRegistry';
import type { ChannelReplica } from './channel/ChannelReplica';
import type { ChannelToken, CommandMap } from './channel/ChannelToken';

import { isObservable, type UiChild } from 'gesso-core';
import { InputCell, isOutputTarget, outputTargetOf, withBodyOf } from './Input';
import type { Component } from './Component';
import { type ComponentElement } from './ComponentElement';
import {
  type ClassComponent,
  type ComponentContext,
  type ComponentType,
  type FunctionComponent,
  isClassComponent
} from './FunctionComponent';
import { getComponentMetadata } from './metadata';

/**
 * Owns a single component instance and its lifecycle.
 *
 * The host is responsible for:
 *   - instantiating the component class, or preparing a function's
 *     input cells and context
 *   - feeding parent props into input cells
 *   - resolving injected services
 *   - validating that @State fields are initialized
 *   - calling render() (or the function) exactly once and caching its output
 *   - invoking onMount / onUnmount hooks
 *   - owning subscriptions that must not outlive the component
 *
 * A host is created and released by the ComponentHostResolver, which
 * in turn is driven by graph reconciliation. The host never decides
 * when it lives or dies.
 *
 * A functional component is a class component with its `render()` in
 * the function and its inputs in the props record: the record hands
 * out one InputCell per prop name, created on first access, and the
 * host keeps every cell it handed out fed from the parent's props.
 */
export class ComponentHost<P extends Record<string, unknown> = Record<string, unknown>> {
  /** The class instance; undefined for a functional component. */
  readonly instance: Component | undefined;
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

  /** A functional component's cells, by prop name, as they were handed out. */
  private readonly functionalCells = new Map<string, InputCell<unknown>>();
  private readonly mountHooks: Array<() => void> = [];
  private readonly unmountHooks: Array<() => void> = [];
  /** True only while the component function runs; hooks may register then. */
  private rendering = false;

  constructor(
    element: ComponentElement<P>,
    private readonly services: ServiceRegistry = new ServiceRegistry(),
    private readonly channels: ChannelRegistry = new ChannelRegistry()
  ) {
    this.element = element;
    if (isClassComponent(element.component)) {
      this.instance = new element.component();
      this.validateInputs();
      this.wireInputs();
      this.wireInjects();
      this.wireChannels();
    } else {
      this.instance = undefined;
    }
  }

  /** The class or function this host mounts. */
  get component(): ComponentType {
    return this.element.component;
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
      this.output = this.instance !== undefined ? this.instance.render() : this.renderFunction();
    }
    return this.output;
  }

  mount(): void {
    if (this.mounted) {
      return;
    }
    this.mounted = true;
    this.instance?.onMount?.();
    for (const hook of this.mountHooks) {
      hook();
    }
  }

  /**
   * Runs onUnmount() and tears down framework-owned subscriptions.
   */
  dispose(): void {
    if (this.mounted) {
      this.mounted = false;
      this.instance?.onUnmount?.();
      for (const hook of this.unmountHooks) {
        hook();
      }
    }
    this.subscriptions.unsubscribe();
    // Completing the cells ends anything derived from them, such as the
    // defaulted cells `input(props.x, fallback)` returns.
    for (const cell of this.functionalCells.values()) {
      cell.complete();
    }
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
    if (this.instance !== undefined) {
      this.wireInputs();
      return;
    }
    for (const [name, cell] of this.functionalCells) {
      this.applyInput(name, cell, props[name], true);
    }
  }

  private renderFunction(): UiChild {
    const component = this.element.component as FunctionComponent<Record<string, unknown>>;
    const context = this.createContext();
    this.rendering = true;
    try {
      return withBodyOf(this.element.tag, () => component(this.createInputRecord(), context));
    } finally {
      this.rendering = false;
    }
  }

  /**
   * The props record a functional component reads: a cell per name,
   * created when first asked for and fed from the parent's props.
   *
   * Creating cells on demand is what lets the parent omit a prop
   * without the function having to check for a missing cell, and lets
   * a cell asked for later — in an event handler, say — still be live.
   */
  private createInputRecord(): Record<string, InputCell<unknown>> {
    const cellFor = (name: string): InputCell<unknown> => {
      let cell = this.functionalCells.get(name);
      if (cell === undefined) {
        cell = new InputCell<unknown>(undefined);
        cell.label = `${this.element.tag}.${name}`;
        this.functionalCells.set(name, cell);
        this.applyInput(name, cell, (this.element.props as Record<string, unknown>)[name], true);
      }
      return cell;
    };
    return new Proxy({} as Record<string, InputCell<unknown>>, {
      get: (_target, name) => (typeof name === 'string' ? cellFor(name) : undefined),
      has: (_target, name) => typeof name === 'string',
      ownKeys: () => Array.from(new Set([...Object.keys(this.element.props), ...this.functionalCells.keys()])),
      getOwnPropertyDescriptor: (_target, name) =>
        typeof name === 'string'
          ? { value: cellFor(name), enumerable: true, configurable: true, writable: false }
          : undefined,
      set: (_target, name) => {
        throw new Error(
          `Component '${this.element.tag}' tried to assign inputs.${String(name)}. ` +
            `Inputs are cells written by the host; read inputs.${String(name)}.value or bind the cell.`
        );
      }
    });
  }

  private createContext(): ComponentContext {
    const requireRendering = (method: string): void => {
      if (!this.rendering) {
        throw new Error(
          `Component '${this.element.tag}' called ctx.${method}() outside its function body. ` +
            `Register lifecycle hooks while the component function runs.`
        );
      }
    };
    return {
      inject: <S extends object>(ServiceClass: new () => S): S => this.services.get(ServiceClass),
      channel: <V extends object, C extends object>(token: ChannelToken<V, C>): ChannelReplica<V, C> =>
        this.channels.get(token),
      onMount: hook => {
        requireRendering('onMount');
        this.mountHooks.push(hook);
      },
      onUnmount: hook => {
        requireRendering('onUnmount');
        this.unmountHooks.push(hook);
      },
      effect: <T>(source: Observable<T>, run: (value: T) => void): Subscription => {
        // Not guarded by `requireRendering`: a teardown may be
        // registered at any point up to disposal, and adding one to a
        // Subscription that has already been torn down tears the new
        // one down at once, which is the right answer for a component
        // that has gone.
        const subscription = source.subscribe(value => run(value));
        this.subscriptions.add(subscription);
        return subscription;
      },
      bounds: (label?: string): BoundsCell => {
        const cell = bounds(label ?? `${this.element.tag}.bounds`);
        this.subscriptions.add(() => cell.complete());
        return cell;
      }
    };
  }

  private wireInputs(): void {
    const metadata = getComponentMetadata(this.element.component);
    const props = this.element.props as Record<string, unknown>;
    for (const inputName of metadata.inputs) {
      const cell = (this.instance as unknown as Record<string, InputCell<unknown>>)[inputName];
      cell.label ??= `${metadata.tag}.${inputName}`;
      this.applyInput(inputName, cell, props[inputName], false);
    }
  }

  /**
   * Connects one input cell to whatever the parent supplied.
   *
   * For a class, an absent prop leaves the cell's default in place, so
   * a parent that does not mention an input never clobbers it. For a
   * function the cell has no default of its own — `input(cell,
   * fallback)` supplies one — so a prop the parent stops passing is
   * pushed through as `undefined`, which re-applies the fallback.
   */
  private applyInput(inputName: string, cell: InputCell<unknown>, provided: unknown, resetWhenAbsent: boolean): void {
    if (this.inputSources.has(inputName) && this.inputSources.get(inputName) === provided) {
      return;
    }

    const previous = this.inputSubscriptions.get(inputName);
    if (previous !== undefined) {
      previous.unsubscribe();
      this.subscriptions.remove(previous);
      this.inputSubscriptions.delete(inputName);
    }

    const hadSource = this.inputSources.has(inputName) && this.inputSources.get(inputName) !== undefined;
    this.inputSources.set(inputName, provided);

    if (provided === undefined) {
      if (resetWhenAbsent && hadSource) {
        cell.next(undefined);
      }
      return;
    }

    if (isOutputTarget(provided)) {
      // The parent wants the child's output as a stream: the cell holds
      // a handler that forwards to the target, and `emit` calls it.
      const target = outputTargetOf(provided);
      cell.next((value: unknown) => target.next(value));
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
    const metadata = getComponentMetadata(this.element.component);
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

  /**
   * Resolves `@Channel(token)` properties to their replicas.
   *
   * Alongside `wireInjects` rather than inside it: a store is a class
   * this thread owns, a channel is a name the other side answers to,
   * and only one of the two survives the barrier design.
   */
  private wireChannels(): void {
    const metadata = getComponentMetadata(this.element.component);
    for (const [propertyName, token] of metadata.channels) {
      (this.instance as unknown as Record<string, unknown>)[propertyName] = this.channels.get(
        token as ChannelToken<object, CommandMap>
      );
    }
  }

  private wireInjects(): void {
    const metadata = getComponentMetadata(this.element.component);
    for (const [propertyName, ServiceClass] of metadata.injects) {
      const service = this.services.get(ServiceClass as unknown as new () => object);
      (this.instance as unknown as Record<string, unknown>)[propertyName] = service;
    }
  }
}

export type { ClassComponent };
