import type { Component } from '../Component';
import { createComponent } from '../createComponent';
import type { FrameworkChild } from '../ComponentElement';
import type { Store } from '../store/Store';
import { NodalApp } from './NodalApp';
import type { FrameMetrics } from './NodalRuntime';

/**
 * Fluent builder for the single-thread configuration.
 */
export class NodalAppBuilder {
  private readonly storeClasses: (new () => Store)[] = [];
  private frameListener: ((metrics: FrameMetrics) => void) | undefined;

  constructor(private readonly root: FrameworkChild | (new () => Component)) {}

  /**
   * Registers a store class with the application.
   */
  useStore(StoreClass: new () => Store): this {
    this.storeClasses.push(StoreClass);
    return this;
  }

  /**
   * Receives per-frame timings, mirroring the worker configuration's
   * onFrame option.
   */
  onFrame(listener: (metrics: FrameMetrics) => void): this {
    this.frameListener = listener;
    return this;
  }

  /**
   * Mounts the app on the calling thread.
   *
   * Named for what it costs: everything — components, layout and
   * rendering — runs here, so main-thread work delays frames. Use the
   * worker configuration for interactive apps.
   *
   * Returns a dispose function that tears the app down.
   */
  mountSync(host: HTMLElement | string): () => void {
    const element = typeof host === 'string' ? requireElement(host) : host;
    const rootElement = typeof this.root === 'function' ? createComponent(this.root) : this.root;
    const app = new NodalApp({ host: element, root: rootElement, storeClasses: this.storeClasses });
    if (this.frameListener !== undefined) {
      app.onFrame(this.frameListener);
    }
    app.mount();
    return () => app.dispose();
  }
}

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`Mount host '${selector}' was not found.`);
  }
  return element;
}
