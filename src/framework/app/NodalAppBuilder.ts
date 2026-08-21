import type { Component } from '../Component';
import { createComponent } from '../createComponent';
import type { FrameworkChild } from '../ComponentRenderer';
import type { Store } from '../store/Store';
import { NodalApp } from './NodalApp';

/**
 * Fluent builder for constructing a Nodal application.
 */
export class NodalAppBuilder {
  private readonly storeClasses: (new () => Store)[] = [];

  constructor(private readonly root: FrameworkChild | (new () => Component)) {}

  /**
   * Registers a store class with the application.
   */
  useStore(StoreClass: new () => Store): this {
    this.storeClasses.push(StoreClass);
    return this;
  }

  /**
   * Mounts the app into the supplied host element.
   *
   * Returns a dispose function that tears the app down.
   */
  mount(host: HTMLElement): () => void {
    const rootElement = typeof this.root === 'function' ? createComponent(this.root) : this.root;
    const app = new NodalApp({ host, root: rootElement, storeClasses: this.storeClasses });
    app.mount();
    return () => app.dispose();
  }
}
