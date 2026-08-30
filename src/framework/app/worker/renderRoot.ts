import type { FrameworkChild } from '../../ComponentElement';
import { createComponent } from '../../createComponent';
import type { ComponentType } from '../../FunctionComponent';
import type { Store } from '../../store/Store';
import {
  createStoreRegistry,
  type RegistryHandle,
  type StoreRegistration
} from '../../store/worker/createStoreRegistry';
import { APPLICATION_WORKER, portHandle, type WorkerHandle } from '../../worker/WorkerPorts';
import {
  createChannelRegistry,
  type ChannelRegistration,
  type ChannelRegistryHandle
} from '../../channel/createChannelRegistry';
import type { ChannelSource } from '../../channel/provide';
import type { ChannelToken } from '../../channel/ChannelToken';
import { UiTimerFrameClock } from '../../../ui/scheduler';
import { NodalRuntime, type RendererChoice } from '../NodalRuntime';
import { isInputMessage, type RuntimeToShellMessage, type ShellToRuntimeMessage } from './RenderWorkerProtocol';

/**
 * Minimal view of the worker global, so this module type-checks
 * against the DOM lib without pulling in the WebWorker lib.
 */
interface WorkerGlobal {
  onmessage: ((event: MessageEvent<ShellToRuntimeMessage>) => void) | null;
  postMessage(message: RuntimeToShellMessage): void;
}

/**
 * Runs a Nodal application inside a render worker.
 *
 * Everything the user sees is built and drawn here: components,
 * the retained graph, layout, input routing, and rasterization to an
 * OffscreenCanvas. The main thread only forwards events and never
 * touches any of it, which is the entire point of the arrangement.
 *
 * Usage, in a module loaded as a worker:
 *
 *   renderRoot(AppRoot).useStore(DemoStore);
 *
 * The message handler is installed synchronously, so chained
 * useStore() calls always land before the shell's init message is
 * processed.
 */
export function renderRoot(root: FrameworkChild | ComponentType): RenderWorkerApp {
  return new RenderWorkerApp(root);
}

export class RenderWorkerApp {
  private readonly registrations: StoreRegistration[] = [];
  private readonly channelRegistrations: ChannelRegistration[] = [];
  private readonly root: FrameworkChild;
  private readonly host: WorkerGlobal;

  private runtime: NodalRuntime | undefined;
  private registry: RegistryHandle | undefined;
  private channels: ChannelRegistryHandle | undefined;
  /** The shell's port to the application worker, if there is one. */
  private appWorker: WorkerHandle | undefined;

  constructor(root: FrameworkChild | ComponentType, host: WorkerGlobal = self as unknown as WorkerGlobal) {
    this.root = typeof root === 'function' ? createComponent(root as ComponentType) : root;
    this.host = host;
    this.host.onmessage = event => this.receive(event.data);
  }

  /**
   * Registers a store.
   *
   * With no options the store lives here, in the render worker. Pass a
   * worker factory to put it in a data worker instead, so its actions,
   * business logic and projection computation stay off this thread and
   * cannot delay a frame:
   *
   *   .useStore(CartStore, {
   *     worker: () => new Worker(new URL('./cart.worker.ts', import.meta.url), { type: 'module' })
   *   })
   */
  useStore(StoreClass: new () => Store, options: { worker?: WorkerHandle | (() => Worker); key?: string } = {}): this {
    if (this.runtime !== undefined) {
      throw new Error(`Store '${StoreClass.name}' was registered after the runtime started.`);
    }
    this.registrations.push({ storeClass: StoreClass, worker: options.worker, key: options.key });
    return this;
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
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  private dispatch(message: ShellToRuntimeMessage): void {
    if (message.type === 'init') {
      // The shell's channel to the application worker, when it spawned
      // one. Held before initialize, because the channels registered
      // without a worker of their own are opened over it there.
      this.appWorker = message.appPort === undefined ? undefined : portHandle(message.appPort);
      this.initialize(message.canvas, message.width, message.height, message.dpr, message.renderer);
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
        runtime.input.pointer.pointerDown(message.x, message.y, message.buttons, message.modifiers);
        break;
      case 'pointerMove':
        runtime.input.pointer.pointerMove(message.x, message.y, message.buttons, message.modifiers);
        break;
      case 'pointerUp':
        runtime.input.pointer.pointerUp(message.x, message.y, message.buttons, message.modifiers);
        break;
      case 'pointerCancel':
        runtime.input.pointer.pointerCancel();
        break;
      case 'wheel':
        runtime.input.wheel.wheel(message.x, message.y, message.deltaX, message.deltaY, message.modifiers);
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
      case 'visibility':
        runtime.setVisible(message.visible);
        break;
      case 'inspector':
        runtime.setInspectorEnabled(message.enabled);
        break;
      case 'dispose':
        runtime.dispose();
        this.registry?.dispose();
        this.channels?.dispose();
        this.registry = undefined;
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
    return { ...registration, worker: this.appWorker };
  }

  private initialize(
    canvas: OffscreenCanvas,
    width: number,
    height: number,
    dpr: number,
    renderer: RendererChoice | undefined
  ): void {
    this.runtime?.dispose();
    this.registry?.dispose();
    this.channels?.dispose();
    this.registry = createStoreRegistry(
      this.registrations.map(registration => this.resolveWorker(registration)),
      (storeName, message, stack) => {
        this.host.postMessage({ type: 'error', message: `store ${storeName}: ${message}`, stack });
      }
    );
    this.channels = createChannelRegistry(
      // A channel registered with neither a worker nor a source is
      // served by whatever the shell spawned. Naming no worker is the
      // common case: an application has one application worker, and
      // repeating that at every registration says nothing.
      this.channelRegistrations.map(registration =>
        registration.worker === undefined && registration.source === undefined
          ? { ...registration, worker: this.appWorker }
          : this.resolveWorker(registration)
      ),
      (channelName, message, stack) => {
        this.host.postMessage({ type: 'error', message: `channel ${channelName}: ${message}`, stack });
      }
    );
    this.runtime = new NodalRuntime({
      root: this.root,
      canvas,
      renderer,
      stores: this.registry.registry,
      channels: this.channels.registry,
      // A worker has no requestAnimationFrame tied to the compositor,
      // so frames are timer-paced. See FRAMEWORK_DESIGN section 13.
      clock: callback => new UiTimerFrameClock(callback),
      width,
      height,
      dpr
    });
    this.runtime.deferPatchesFrom([...this.registry.replicas, ...this.channels.registry.all()]);
    this.runtime.onInspect(text => {
      this.host.postMessage({ type: 'inspect', text });
    });
    this.runtime.onCursor(cursor => {
      this.host.postMessage({ type: 'cursor', cursor });
    });
    this.runtime.onEditingState(state => {
      this.host.postMessage({ type: 'editing', state });
    });
    this.runtime.onShellRequest(request => {
      this.host.postMessage(
        request.type === 'clipboard' ? { type: 'clipboard', text: request.text } : { type: 'openUrl', url: request.url }
      );
    });
    this.runtime.onRendererError(message => {
      this.host.postMessage({ type: 'error', message: `renderer: ${message}` });
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
