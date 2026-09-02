import type { FrameworkChild } from '../../ComponentElement';
import { createComponent } from '../../createComponent';
import type { ComponentType } from '../../FunctionComponent';
import { APPLICATION_WORKER, portHandle, type WorkerHandle } from '../../worker/WorkerPorts';
import {
  createChannelRegistry,
  type ChannelRegistration,
  type ChannelRegistryHandle
} from '../../channel/createChannelRegistry';
import type { ChannelSource } from '../../channel/provide';
import type { ChannelToken } from '../../channel/ChannelToken';
import { UiHostFrameClock } from '@gesso/core';
import { GessoRuntime, type RendererChoice } from '../GessoRuntime';
import { ServiceRegistry } from '../../service/ServiceRegistry';
import type { MediaOptions } from '../MediaService';
import type { RouterRoutes } from '../../router/RouterService';
import { isInputMessage, type RuntimeToShellMessage, type ShellToRuntimeMessage } from './RenderWorkerProtocol';

/**
 * An `error` event as this module needs it: the thrown value when the
 * engine kept it, and the location when it did not.
 */
interface WorkerErrorEvent {
  message?: string;
  error?: unknown;
  filename?: string;
  lineno?: number;
  colno?: number;
}

/** An `unhandledrejection` event, reduced to the value that was rejected. */
interface WorkerRejectionEvent {
  reason?: unknown;
}

/**
 * Minimal view of the worker global, so this module type-checks
 * against the DOM lib without pulling in the WebWorker lib.
 *
 * `addEventListener` is required rather than optional, because a host
 * without it is a host whose uncaught exceptions vanish, and that is
 * the failure this whole file exists to prevent. A test double states
 * how it wants to be told instead of quietly not being told.
 */
interface WorkerGlobal {
  onmessage: ((event: MessageEvent<ShellToRuntimeMessage>) => void) | null;
  postMessage(message: RuntimeToShellMessage): void;
  addEventListener(type: 'error', listener: (event: WorkerErrorEvent) => void): void;
  addEventListener(type: 'unhandledrejection', listener: (event: WorkerRejectionEvent) => void): void;
}

/**
 * Runs a Gesso application inside a render worker.
 *
 * Everything the user sees is built and drawn here: components,
 * the retained graph, layout, input routing, and rasterization to an
 * OffscreenCanvas. The main thread only forwards events and never
 * touches any of it, which is the entire point of the arrangement.
 *
 * Usage, in a module loaded as a worker:
 *
 *   renderRoot(AppRoot).useChannel(Catalog);
 *
 * The message handler is installed synchronously, so chained
 * useChannel() calls always land before the shell's init message is
 * processed.
 */
export function renderRoot(root: FrameworkChild | ComponentType): RenderWorkerApp {
  return new RenderWorkerApp(root);
}

export class RenderWorkerApp {
  private readonly channelRegistrations: ChannelRegistration[] = [];
  private readonly serviceRegistrations: (new () => object)[] = [];
  private routes: RouterRoutes | undefined;
  private media: MediaOptions | undefined;
  private root: FrameworkChild;
  private readonly host: WorkerGlobal;

  private runtime: GessoRuntime | undefined;
  /** Held so forwarded display refreshes can be handed to it. */
  private clock: UiHostFrameClock | undefined;
  private channels: ChannelRegistryHandle | undefined;
  /** The shell's port to the application-logic worker, if there is one. */
  private appLogicWorker: WorkerHandle | undefined;

  constructor(root: FrameworkChild | ComponentType, host: WorkerGlobal = self as unknown as WorkerGlobal) {
    this.root = typeof root === 'function' ? createComponent(root as ComponentType) : root;
    this.host = host;
    this.host.onmessage = event => this.receive(event.data);
    // Everything `receive` cannot see. The usual frame is not in that
    // set: the shell forwards its `requestAnimationFrame` as a `tick`
    // message and the clock delivers it synchronously, so a component
    // that throws while rendering, laying out or painting throws
    // inside `receive`'s own try and is reported as `message`. What
    // lands here is the rest: module scope, a callback no shell
    // message drove, and the frames the clock paces from its own
    // timer, before the first tick arrives or while the shell's thread
    // is blocked. Their only witness is the worker's own console,
    // which a page cannot read and a person only finds by opening the
    // right thread in devtools. These two listeners are what make a
    // render worker's failures reach the shell at all. See
    // `decisions/0036-error-overlay.md`, amended by 0039.
    this.host.addEventListener('error', event => {
      // The location only when the engine kept no Error: with one, the
      // stack says where it was in more detail and the event's
      // `filename` is whichever bundle chunk the frame landed in,
      // which is not where anybody wrote anything.
      const error = event.error;
      this.reportUncaught(
        error ?? event.message ?? 'Unknown error',
        error === undefined ? locationOf(event) : undefined
      );
    });
    this.host.addEventListener('unhandledrejection', event => {
      this.reportUncaught(event.reason ?? 'Unhandled rejection');
    });
  }

  /**
   * Reports a value nothing caught.
   *
   * `where` is the fallback location the `error` event carries when
   * the engine did not keep the thrown object — a cross-origin script,
   * or a value thrown that was never an Error. Without it the report
   * would be a bare sentence with nothing to look up.
   */
  private reportUncaught(value: unknown, where?: string): void {
    const error = value instanceof Error ? value : undefined;
    const message = error !== undefined ? error.message : String(value);
    this.host.postMessage({
      type: 'error',
      message: where === undefined ? message : `${message} (${where})`,
      stack: error?.stack,
      source: 'uncaught'
    });
  }

  /**
   * Replaces the application's root and rebuilds its tree, for hot
   * module replacement (`ROADMAP.md` F7).
   *
   * The framework knows nothing about any bundler. An entry module
   * that wants this asks its own HMR client for the new module and
   * hands the root over:
   *
   *   const app = renderRoot(AppRoot).useService(Counter);
   *   import.meta.hot?.accept('./AppRoot', module => {
   *     app.reload(module.AppRoot, [module.Counter]);
   *   });
   *
   * The services are the ones the replaced module defines. They have
   * to be named because a registry is keyed by the class object and a
   * replaced module produces a new one; the registry adopts them,
   * keeping their instances. Omit a service that lives in a module the
   * replacement did not touch.
   *
   * Everything that is not the tree survives, including the channels:
   * see `GessoRuntime.reload`. Called before the shell's `init`
   * message it simply changes which root will be built.
   */
  reload(root: FrameworkChild | ComponentType, services: readonly (new () => object)[] = []): void {
    this.root = typeof root === 'function' ? createComponent(root as ComponentType) : root;
    for (const ServiceClass of services) {
      // Kept for a later reload too: a second replacement is matched
      // against what the first one left, not against the original.
      const previous = this.serviceRegistrations.findIndex(existing => existing.name === ServiceClass.name);
      if (previous === -1) {
        this.serviceRegistrations.push(ServiceClass);
      } else {
        this.serviceRegistrations[previous] = ServiceClass;
      }
    }
    this.runtime?.reload(this.root, services);
  }

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
    options: { worker?: WorkerHandle | (() => Worker); source?: ChannelSource<V, C> } = {}
  ): this {
    if (this.runtime !== undefined) {
      throw new Error(`Channel '${token.name}' was registered after the runtime started.`);
    }
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
   * `RouterOutlet` in the tree resolve them.
   *
   *   renderRoot(AppRoot).useRoutes({ routes: ROUTES, notFound: NotFound });
   *
   * They are declared here, in the render worker, because a route
   * holds a component class. The shell never sees one; the only thing
   * that crosses is the url.
   */
  useRoutes(routes: RouterRoutes): this {
    if (this.runtime !== undefined) {
      throw new Error('Routes were registered after the runtime started.');
    }
    this.routes = routes;
    return this;
  }

  /**
   * Declares where the app's pictures come from: the image resolver,
   * the icon rasteriser and the video decoder.
   *
   *   renderRoot(AppRoot).useMedia({ resolver: new CachingResolver() });
   *
   * Declared in the worker, like the routes and for a related reason:
   * a resolver is a function, and no function crosses a `postMessage`.
   * The shell could not forward one it was given, so the thread that
   * will do the fetching is where it is built. That is also the right
   * thread for it: this one already has no main thread to block.
   *
   * Declared before `init` rather than set on `MediaService` later,
   * because the tree is built when `init` arrives and an `Image` in it
   * asks for its bitmap at that moment. Whatever is left out, the
   * runtime builds and owns; whatever is passed stays the caller's,
   * and the runtime will not dispose it.
   */
  useMedia(media: MediaOptions): this {
    if (this.runtime !== undefined) {
      throw new Error('A media resolver was registered after the runtime started.');
    }
    this.media = media;
    return this;
  }

  /**
   * Handles one message from the shell.
   *
   * Exceptions are reported to the shell rather than left to vanish:
   * an uncaught throw inside a worker is invisible to the page, which
   * is the worst failure mode this architecture introduces.
   */
  receive(message: ShellToRuntimeMessage): void {
    try {
      this.dispatch(message);
    } catch (error) {
      this.host.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        source: 'message'
      });
    }
  }

  private dispatch(message: ShellToRuntimeMessage): void {
    if (message.type === 'init') {
      // The shell's channel to the application-logic worker, when it spawned
      // one. Held before initialize, because the channels registered
      // without a worker of their own are opened over it there.
      this.appLogicWorker = message.appPort === undefined ? undefined : portHandle(message.appPort);
      this.initialize(
        message.canvas,
        message.width,
        message.height,
        message.dpr,
        message.renderer,
        message.accessibility !== false
      );
      this.runtime!.setTextInputSource(message.textInput ?? 'keys');
      return;
    }

    const runtime = this.runtime;
    if (runtime === undefined) {
      // Events can outrun init; dropping them is correct, since there
      // is no tree yet for them to reach.
      return;
    }

    switch (message.type) {
      case 'resize':
        runtime.resize(message.width, message.height, message.dpr);
        break;
      case 'pointerDown':
        runtime.input.pointer.pointerDown(message.x, message.y, message.buttons, message.modifiers, message.pointer);
        break;
      case 'pointerMove':
        runtime.input.pointer.pointerMove(message.x, message.y, message.buttons, message.modifiers, message.pointer);
        break;
      case 'pointerUp':
        runtime.input.pointer.pointerUp(message.x, message.y, message.buttons, message.modifiers, message.pointer);
        break;
      case 'pointerCancel':
        runtime.input.pointer.pointerCancel(message.pointer);
        break;
      case 'wheel':
        runtime.input.wheel.wheel(
          message.x,
          message.y,
          message.deltaX,
          message.deltaY,
          message.modifiers,
          message.deltaMode,
          message.wheelDeltaY
        );
        break;
      case 'keyDown':
        runtime.input.keyboard.keyDown(message.key, message.modifiers);
        break;
      case 'keyUp':
        runtime.input.keyboard.keyUp(message.key, message.modifiers);
        break;
      case 'beforeInput':
        runtime.input.editing.beforeInput(message.inputType, message.data);
        break;
      case 'compositionStart':
        runtime.input.editing.compositionStart();
        break;
      case 'compositionUpdate':
        runtime.input.editing.compositionUpdate(message.text, message.caret);
        break;
      case 'compositionEnd':
        runtime.input.editing.compositionEnd(message.text);
        break;
      case 'paste':
        runtime.input.editing.paste(message.text);
        break;
      case 'blur':
        runtime.input.focus.blur();
        break;
      case 'reducedMotion':
        runtime.setReducedMotion(message.reduced);
        break;
      case 'colorScheme':
        runtime.setColorScheme(message.scheme);
        break;
      case 'url':
        runtime.setUrl(message.url);
        break;
      case 'tick':
        this.clock?.tick(message.time);
        break;
      case 'visibility':
        runtime.setVisible(message.visible);
        break;
      case 'inspector':
        runtime.setInspectorEnabled(message.enabled);
        break;
      case 'semanticsAction':
        runtime.applySemanticsAction(message.action);
        break;
      case 'dispose':
        runtime.dispose();
        this.channels?.dispose();
        this.channels = undefined;
        this.runtime = undefined;
        break;
    }

    // After routing, not before: whether a frame is now pending is how
    // the runtime tells an input that caused work from one that hit
    // nothing. `dispose` cannot reach here with a live runtime, and no
    // lifecycle message is an input, so the guard is enough.
    if (this.runtime !== undefined && isInputMessage(message)) {
      this.runtime.noteInput(message.at);
    }
  }

  /**
   * Swaps the `APPLICATION_WORKER` placeholder for the shell's port.
   *
   * Registrations run before `init`, so a registration naming the
   * application worker can only name a stand-in; this is where it
   * becomes real. Anything else is left exactly as registered.
   */
  private resolveWorker<T extends { worker?: WorkerHandle | (() => Worker) }>(registration: T): T {
    if (registration.worker !== APPLICATION_WORKER) {
      return registration;
    }
    return { ...registration, worker: this.appLogicWorker };
  }

  private initialize(
    canvas: OffscreenCanvas,
    width: number,
    height: number,
    dpr: number,
    renderer: RendererChoice | undefined,
    accessibility: boolean
  ): void {
    this.runtime?.dispose();
    this.channels?.dispose();
    this.channels = createChannelRegistry(
      // A channel registered with neither a worker nor a source is
      // served by whatever the shell spawned. Naming no worker is the
      // common case: an application has one application-logic worker, and
      // repeating that at every registration says nothing.
      this.channelRegistrations.map(registration =>
        registration.worker === undefined && registration.source === undefined
          ? { ...registration, worker: this.appLogicWorker }
          : this.resolveWorker(registration)
      ),
      (channelName, message, stack) => {
        this.host.postMessage({
          type: 'error',
          message: `channel ${channelName}: ${message}`,
          stack,
          source: 'channel'
        });
      }
    );
    const services = new ServiceRegistry();
    for (const ServiceClass of this.serviceRegistrations) {
      services.register(ServiceClass);
    }
    this.runtime = new GessoRuntime({
      root: this.root,
      services,
      routes: this.routes,
      media: this.media,
      canvas,
      renderer,
      channels: this.channels.registry,
      // A worker has no requestAnimationFrame tied to the compositor,
      // so the shell forwards the display's own refresh and this clock
      // just delivers it. See FRAMEWORK_DESIGN section 13.
      clock: callback => {
        const clock = new UiHostFrameClock(callback, running => {
          this.host.postMessage({ type: 'frameLoop', running });
        });
        this.clock = clock;
        return clock;
      },
      width,
      height,
      dpr
    });
    this.runtime.deferPatchesFrom(this.channels.registry.all());
    this.runtime.onInspect(report => {
      this.host.postMessage({ type: 'inspect', report });
    });
    this.runtime.onCursor(cursor => {
      this.host.postMessage({ type: 'cursor', cursor });
    });
    this.runtime.onScrollability((scrollability, scrollsAnything) => {
      this.host.postMessage({ type: 'scrollability', scrollability, scrollsAnything });
    });
    this.runtime.onEditingState(state => {
      this.host.postMessage({ type: 'editing', state });
    });
    if (accessibility) {
      // Subscribing is what turns the geometry sweep on in the
      // runtime, so a shell without a mirror pays nothing for one.
      this.runtime.onSemantics(update => {
        this.host.postMessage({ type: 'semantics', update });
      });
    }
    this.runtime.onShellRequest(request => {
      if (request.type === 'clipboard') {
        this.host.postMessage({ type: 'clipboard', text: request.text });
      } else if (request.type === 'openUrl') {
        this.host.postMessage({ type: 'openUrl', url: request.url });
      } else {
        this.host.postMessage({ type: 'history', action: request.action, url: request.url });
      }
    });
    this.runtime.onRendererError(message => {
      this.host.postMessage({ type: 'error', message, source: 'renderer' });
    });
    this.runtime.onListenerError((message, stack) => {
      this.host.postMessage({ type: 'error', message, stack, source: 'listener' });
    });
    this.runtime.onFrame(metrics => {
      this.host.postMessage({
        type: 'frame',
        frame: metrics.frame,
        durationMs: metrics.durationMs,
        nodes: metrics.nodes,
        measured: metrics.measured,
        relayoutRoots: metrics.relayoutRoots,
        at: metrics.at,
        inputLatencyMs: metrics.inputLatencyMs,
        phases: metrics.phases,
        renderer: metrics.renderer,
        gpu: metrics.gpu
      });
    });
    this.runtime.start();
    this.host.postMessage({ type: 'ready' });
  }
}

/** `file:line:column` from an error event that carried no Error. */
function locationOf(event: WorkerErrorEvent): string | undefined {
  if (event.filename === undefined || event.filename === '') {
    return undefined;
  }
  const line = event.lineno ?? 0;
  const column = event.colno ?? 0;
  return `${event.filename}:${line}:${column}`;
}
