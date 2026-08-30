import { createComponent } from '../createComponent';
import type { FrameworkChild } from '../ComponentElement';
import type { ComponentType } from '../FunctionComponent';
import type { WorkerHandle } from '../worker/WorkerPorts';
import { ServiceRegistry } from '../service/ServiceRegistry';
import { createChannelRegistry, type ChannelRegistration } from '../channel/createChannelRegistry';
import type { ChannelSource } from '../channel/provide';
import type { ChannelToken } from '../channel/ChannelToken';
import { GessoApp } from './GessoApp';
import type { RouterRoutes } from '../router/RouterService';
import type { ShellHistoryOptions } from './shellHistory';
import type { FrameMetrics, RendererChoice } from './GessoRuntime';

/**
 * Fluent builder for the single-thread configuration.
 */
export class GessoAppBuilder {
  private readonly channelRegistrations: ChannelRegistration[] = [];
  private readonly serviceRegistrations: (new () => object)[] = [];
  private frameListener: ((metrics: FrameMetrics) => void) | undefined;
  private inspectListener: ((text: string | null) => void) | undefined;
  private rendererChoice: RendererChoice | undefined;
  private routes: RouterRoutes | undefined;
  private historyOptions: ShellHistoryOptions | undefined;
  private app: GessoApp | undefined;

  constructor(private readonly root: FrameworkChild | ComponentType) {}

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

  /**
   * Registers a runtime service: a plain class this thread constructs
   * once and hands to whoever injects it.
   *
   * For things that belong to the render thread and could not leave it
   * — something holding a `UiNode`, a decoded bitmap, or a generator
   * feeding bound props at frame rate. Application state goes through
   * `useChannel` instead, and the test is the usual one: if it
   * survives a reload or another screen cares about it, it is not a
   * service.
   */
  useService(ServiceClass: new () => object): this {
    this.serviceRegistrations.push(ServiceClass);
    return this;
  }

  /**
   * Declares the app's routes, which is all it takes to make a
   * `RouterOutlet` in the tree resolve them. Mirrors
   * `renderRoot().useRoutes`.
   */
  useRoutes(routes: RouterRoutes): this {
    this.routes = routes;
    return this;
  }

  /**
   * How the app's url is kept: `path` (pushState, the default in a
   * browser), `hash`, or `memory`. See `shellHistory`.
   */
  useHistory(history: ShellHistoryOptions): this {
    this.historyOptions = history;
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
    const channels = createChannelRegistry(this.channelRegistrations);
    const services = new ServiceRegistry();
    for (const ServiceClass of this.serviceRegistrations) {
      services.register(ServiceClass);
    }
    const app = new GessoApp({
      host: element,
      root: rootElement,
      channels: channels.registry,
      services,
      routes: this.routes,
      history: this.historyOptions,
      renderer: this.rendererChoice
    });
    app.deferPatchesFrom(channels.registry.all());
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
