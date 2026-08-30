import { createComponent } from '../createComponent';
import type { FrameworkChild } from '../ComponentElement';
import type { ComponentType } from '../FunctionComponent';
import type { Store } from '../store/Store';
import { createStoreRegistry, type StoreRegistration } from '../store/worker/createStoreRegistry';
import type { WorkerHandle } from '../worker/WorkerPorts';
import { createChannelRegistry, type ChannelRegistration } from '../channel/createChannelRegistry';
import type { ChannelSource } from '../channel/provide';
import type { ChannelToken } from '../channel/ChannelToken';
import { NodalApp } from './NodalApp';
import type { FrameMetrics, RendererChoice } from './NodalRuntime';

/**
 * Fluent builder for the single-thread configuration.
 */
export class NodalAppBuilder {
  private readonly registrations: StoreRegistration[] = [];
  private readonly channelRegistrations: ChannelRegistration[] = [];
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
  useStore(StoreClass: new () => Store, options: { worker?: WorkerHandle | (() => Worker); key?: string } = {}): this {
    this.registrations.push({ storeClass: StoreClass, worker: options.worker, key: options.key });
    return this;
  }

  /**
   * Chooses the rendering backend, mirroring WorkerAppOptions.renderer.
   * Defaults to Canvas2D; `webgpu` and `auto` fall back to it when the
   * browser has no WebGPU.
   */

  /**
   * Registers a channel.
   *
   * With `worker`, the channel's data lives there — api, store, domain
   * and view models, all plain code the framework never sees. With
   * `source`, it is fed from this thread; either way the same patches
   * cross the same kind of port, so a channel can be moved into a
   * worker later without a view noticing.
   */
  useChannel<V extends object, C extends object>(
    token: ChannelToken<V, C>,
    options: { worker?: WorkerHandle | (() => Worker); source?: ChannelSource<V, C> }
  ): this {
    this.channelRegistrations.push({
      token: token as unknown as ChannelToken<never, never>,
      worker: options.worker,
      source: options.source as unknown as ChannelSource<never, never>
    });
    return this;
  }

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
    const channels = createChannelRegistry(this.channelRegistrations);
    const app = new NodalApp({
      host: element,
      root: rootElement,
      stores: stores.registry,
      channels: channels.registry,
      renderer: this.rendererChoice
    });
    app.deferPatchesFrom([...stores.replicas, ...channels.registry.all()]);
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
      channels.dispose();
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
