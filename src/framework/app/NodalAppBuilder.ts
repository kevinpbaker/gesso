import { createComponent } from '../createComponent';
import type { FrameworkChild } from '../ComponentElement';
import type { ComponentType } from '../FunctionComponent';
import type { Store } from '../store/Store';
import { createStoreRegistry, type StoreRegistration } from '../store/worker/createStoreRegistry';
import { NodalApp } from './NodalApp';
import type { FrameMetrics, RendererChoice } from './NodalRuntime';

/**
 * Fluent builder for the single-thread configuration.
 */
export class NodalAppBuilder {
  private readonly registrations: StoreRegistration[] = [];
  private frameListener: ((metrics: FrameMetrics) => void) | undefined;
  private inspectListener: ((text: string | null) => void) | undefined;
  private rendererChoice: RendererChoice | undefined;
  private app: NodalApp | undefined;

  constructor(private readonly root: FrameworkChild | ComponentType) {}

  /**
   * Registers a store.
   *
   * With no options the store lives on this thread. Pass a worker
   * factory to move it into a data worker, which is worth doing even
   * here: rendering stays on the main thread in this configuration,
   * so keeping heavy state work off it still buys smoother frames.
   */
  useStore(StoreClass: new () => Store, options: { worker?: () => Worker } = {}): this {
    this.registrations.push({ storeClass: StoreClass, worker: options.worker });
    return this;
  }

  /**
   * Chooses the rendering backend, mirroring WorkerAppOptions.renderer.
   * Defaults to Canvas2D; `webgpu` and `auto` fall back to it when the
   * browser has no WebGPU.
   */
  renderer(choice: RendererChoice): this {
    this.rendererChoice = choice;
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
   * Receives the hovered node's layout explanation while the inspector
   * is on, mirroring WorkerAppOptions.onInspect.
   */
  onInspect(listener: (text: string | null) => void): this {
    this.inspectListener = listener;
    return this;
  }

  /**
   * Turns the layout inspector on or off on the mounted app, mirroring
   * WorkerApp.setInspector. A no-op before mountSync.
   */
  setInspector(enabled: boolean): void {
    this.app?.setInspector(enabled);
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
    const rootElement = typeof this.root === 'function' ? createComponent(this.root as ComponentType) : this.root;
    const stores = createStoreRegistry(this.registrations);
    const app = new NodalApp({
      host: element,
      root: rootElement,
      stores: stores.registry,
      renderer: this.rendererChoice
    });
    app.deferPatchesFrom(stores.replicas);
    if (this.frameListener !== undefined) {
      app.onFrame(this.frameListener);
    }
    if (this.inspectListener !== undefined) {
      app.onInspect(this.inspectListener);
    }
    this.app = app;
    app.mount();
    return () => {
      this.app = undefined;
      app.dispose();
      stores.dispose();
    };
  }
}

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`Mount host '${selector}' was not found.`);
  }
  return element;
}
