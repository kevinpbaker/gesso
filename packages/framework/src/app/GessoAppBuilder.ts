import { createComponent } from '../createComponent';
import type { FrameworkChild } from '../ComponentElement';
import type { ComponentType } from '../FunctionComponent';
import type { WorkerHandle } from '../worker/WorkerPorts';
import { ServiceRegistry } from '../service/ServiceRegistry';
import { createChannelRegistry, type ChannelRegistration } from '../channel/createChannelRegistry';
import type { ChannelSource } from '../channel/provide';
import type { ChannelToken } from '../channel/ChannelToken';
import type { ColorSchemePreference } from './colorScheme';
import { GessoApp } from './GessoApp';
import type { RouterRoutes } from '../router/RouterService';
import type { ShellHistoryOptions } from './shellHistory';
import type { FrameMetrics, RendererChoice } from './GessoRuntime';
import type { MediaOptions } from './MediaService';
import type { UiNodeReport } from './NodeReport';

/**
 * Fluent builder for the single-thread configuration.
 */
export class GessoAppBuilder {
  private readonly channelRegistrations: ChannelRegistration[] = [];
  private readonly serviceRegistrations: (new () => object)[] = [];
  private frameListener: ((metrics: FrameMetrics) => void) | undefined;
  private inspectListener: ((report: UiNodeReport | null) => void) | undefined;
  private errorListener:
    | ((message: string, stack: string | undefined, source: 'renderer' | 'listener') => void)
    | undefined;
  private rendererChoice: RendererChoice | undefined;
  private routes: RouterRoutes | undefined;
  private historyOptions: ShellHistoryOptions | undefined;
  private mediaOptions: MediaOptions | undefined;
  private app: GessoApp | undefined;
  private colorSchemePreference: ColorSchemePreference = 'auto';

  constructor(private root: FrameworkChild | ComponentType) {}

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
   * Declares where the app's pictures come from: the image resolver,
   * the icon rasteriser and the video decoder. Mirrors
   * `renderRoot().useMedia`.
   *
   *   createApp(AppRoot).useMedia({ resolver: new CachingResolver() });
   *
   * Declared here rather than set on `MediaService` afterwards because
   * the tree is built inside the runtime's constructor and an `Image`
   * in it asks for its bitmap at that moment. Whatever is left out,
   * the runtime builds and owns; whatever is passed stays the
   * caller's, and the runtime will not dispose it.
   */
  useMedia(media: MediaOptions): this {
    this.mediaOptions = media;
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
  onInspect(listener: (report: UiNodeReport | null) => void): this {
    this.inspectListener = listener;
    return this;
  }

  /**
   * Receives errors the runtime would otherwise only log, mirroring
   * WorkerAppOptions.onError. See `GessoApp.onError`.
   */
  onError(listener: (message: string, stack: string | undefined, source: 'renderer' | 'listener') => void): this {
    this.errorListener = listener;
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
   * Replaces the root and rebuilds the tree, for hot module
   * replacement, mirroring `RenderWorkerApp.reload`.
   *
   * Before `mountSync` it changes which root will be built, so an
   * entry that accepts a replacement during startup is not a race.
   */
  reload(root: FrameworkChild | ComponentType, services: readonly (new () => object)[] = []): this {
    this.root = root;
    this.app?.reload(typeof root === 'function' ? createComponent(root as ComponentType) : root, services);
    return this;
  }

  /**
   * Chooses what the application is told about the appearance,
   * mirroring `WorkerApp.setColorScheme`.
   *
   * Unlike `setInspector`, this is remembered when it is called before
   * `mountSync`: the appearance decides what the first frame looks
   * like, so a host that already knows the reader's choice must be
   * able to say so before there is an app to tell.
   */
  setColorScheme(preference: ColorSchemePreference): this {
    this.colorSchemePreference = preference;
    this.app?.setColorScheme(preference);
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
      media: this.mediaOptions,
      history: this.historyOptions,
      renderer: this.rendererChoice,
      colorScheme: this.colorSchemePreference
    });
    app.deferPatchesFrom(channels.registry.all());
    if (this.frameListener !== undefined) {
      app.onFrame(this.frameListener);
    }
    if (this.inspectListener !== undefined) {
      app.onInspect(this.inspectListener);
    }
    if (this.errorListener !== undefined) {
      app.onError(this.errorListener);
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
