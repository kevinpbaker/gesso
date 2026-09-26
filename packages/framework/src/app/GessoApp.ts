import type { FrameworkChild } from '../ComponentElement';
import {
  CanvasPlatformSurface,
  observeViewportInsets,
  prepareInputSurface,
  UiPlatformAdapter,
  type UiNode,
  type CanvasHost,
  UiAnimationFrameClock,
  type UiFrameClockFactory
} from 'gesso-core';
import { GessoRuntime, type FrameMetrics, type PatchSource, type RendererChoice } from './GessoRuntime';
import type { UiNodeReport } from './NodeReport';
import type { DevtoolsEvent, DevtoolsRequest } from './DevtoolsProtocol';
import { shellFilesUnsupported, type ShellRequest } from './ShellService';
import { AudioSink } from './AudioSink';
import { attachFileDrop } from './fileDrop';
import { browserFilesHost, ShellFiles } from './shellFiles';
import { EditingProxy, writeClipboard } from './EditingProxy';
import { SemanticsMirror } from './SemanticsMirror';
import { performShellStorage, shellStorageDenied } from './shellStorage';
import { observeColorScheme, type ColorSchemePreference } from './colorScheme';
import { observeReducedMotion } from './reducedMotion';
import { afterLayout, isDocumentFullscreen, observeFullscreen, setElementFullscreen, surfaceBox } from './fullscreen';
import { createShellHistory, type ShellHistory, type ShellHistoryOptions } from './shellHistory';
import { measure } from './worker/WorkerApp';
import type { ChannelRegistry } from '../channel/ChannelRegistry';
import type { ServiceRegistry } from '../service/ServiceRegistry';
import type { RouterRoutes } from '../router/RouterService';
import type { MediaOptions } from './MediaService';
import type { FontFamilyDeclaration } from './FontService';

export interface GessoAppOptions {
  host: HTMLElement;
  root: FrameworkChild;
  /** A registry built elsewhere, when some stores live in data workers. */
  services?: ServiceRegistry;
  channels?: ChannelRegistry;
  /** The routes a `RouterOutlet` in the tree resolves against. */
  routes?: RouterRoutes;
  /**
   * How the app's url is kept: `path` (pushState, the default in a
   * browser), `hash`, or `memory`. See `shellHistory`.
   */
  history?: ShellHistoryOptions;
  canvas?: CanvasHost;
  /** The rendering backend; see RendererChoice. Defaults to `auto`. */
  renderer?: RendererChoice;
  clock?: UiFrameClockFactory;
  /**
   * Set false to build the tree without attaching DOM input.
   * Handlers declared with `on*` props are still registered, so they
   * can be driven directly through `app.input`.
   */
  input?: boolean;
  /**
   * Set false to drop the off-screen DOM an assistive technology reads
   * (`SemanticsMirror`).
   *
   * On by default, because an application that is accessible only when
   * its author remembered a flag is an application that is not
   * accessible. The opt-out is for a host that mirrors the tree itself,
   * and for measuring what the mirror costs.
   */
  accessibility?: boolean;
  /**
   * The appearance the application is told about: `auto` (the default)
   * follows `prefers-color-scheme`, `light` and `dark` override it.
   * See `WorkerApp` for why this is an option and not only a setter.
   */
  colorScheme?: ColorSchemePreference;
  /**
   * Where the app's pictures come from: the image resolver, the icon
   * rasteriser and the video decoder.
   *
   * An option rather than a call on `MediaService` because the tree is
   * built inside the runtime's constructor and an `Image` in it asks
   * for its bitmap at that moment, so a resolver installed once there
   * is an app to install it on has already missed the first screen.
   */
  media?: MediaOptions;
  /** The font families the app's text may name; see `FontService`. */
  fonts?: readonly FontFamilyDeclaration[];
}

/**
 * Single-thread Gesso application.
 *
 * A thin DOM shell over GessoRuntime: it creates and sizes a canvas,
 * observes the host element, and forwards browser events into the
 * runtime's input controllers. All UI work — components, graph,
 * layout, rendering — belongs to the runtime and never touches the
 * DOM, which is what lets the same runtime host a render worker.
 *
 * This is the single-thread configuration. It is supported for tests,
 * headless rendering, and environments without OffscreenCanvas, but it
 * puts UI work on the main thread and so is not the default for an
 * interactive app.
 */
export class GessoApp {
  private readonly runtime: GessoRuntime;
  private readonly canvas: CanvasHost;
  private readonly host: HTMLElement;
  private readonly inputEnabled: boolean;
  private readonly accessibilityEnabled: boolean;
  private readonly adapter: UiPlatformAdapter;
  private readonly historyOptions: ShellHistoryOptions | undefined;

  private running = false;
  private resizeObserver: ResizeObserver | null = null;
  private proxy: EditingProxy | null = null;
  /** The one audio element, behind `AudioService`; see `AudioSink`. */
  private audio: AudioSink | null = null;
  private mirror: SemanticsMirror | null = null;
  private history: ShellHistory | null = null;
  private detachVisibility: (() => void) | null = null;
  private detachFileDrop: (() => void) | null = null;
  /** Pickers and remembered handles, made on the first file request. */
  private files: ShellFiles | null = null;
  private detachFullscreen: (() => void) | null = null;
  private fullscreen = false;
  private detachReducedMotion: (() => void) | null = null;
  /** Stops watching `prefers-color-scheme`; null while overridden. */
  private detachColorScheme: (() => void) | null = null;
  /** Stops watching `visualViewport` for the safe area and the keyboard. */
  private detachViewportInsets: (() => void) | null = null;
  /** The appearance this shell reports; watched or overridden. */
  private colorSchemePreference: ColorSchemePreference = 'auto';

  constructor(options: GessoAppOptions) {
    this.host = options.host;
    this.canvas = options.canvas ?? createCanvasElement();
    this.inputEnabled = options.input ?? true;
    this.accessibilityEnabled = options.accessibility ?? true;
    this.historyOptions = options.history;
    this.colorSchemePreference = options.colorScheme ?? 'auto';

    this.runtime = new GessoRuntime({
      root: options.root,
      canvas: this.canvas,
      renderer: options.renderer,
      services: options.services,
      channels: options.channels,
      routes: options.routes,
      media: options.media,
      fonts: options.fonts,
      clock: options.clock ?? (callback => new UiAnimationFrameClock(callback)),
      dpr: devicePixelRatio()
    });

    const input = this.runtime.input;
    this.adapter = new UiPlatformAdapter({
      pointerController: input.pointer,
      wheelController: input.wheel,
      keyboardController: input.keyboard
    });
  }

  /** The runtime services a component in this app can inject. */
  get services(): ServiceRegistry {
    return this.runtime.services;
  }

  /**
   * The platform adapter, for tests and for callers driving input from
   * a non-DOM source.
   */
  get input(): UiPlatformAdapter {
    return this.adapter;
  }

  /**
   * Starts the app: appends the canvas to the host, sizes it,
   * attaches input, and arms the frame scheduler.
   */
  mount(): void {
    if (this.running) {
      return;
    }
    this.running = true;

    if (isCanvasElement(this.canvas) && this.canvas.parentElement !== this.host) {
      this.host.appendChild(this.canvas);
      this.canvas.style.display = 'block';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
    }

    this.observeResize();
    // The canvas's box rather than the host's: clientWidth/clientHeight
    // include the host's padding, and starting the runtime a padding
    // wider than the surface it draws on leaves the first frame scaled
    // and every pointer coordinate off by the same ratio. See
    // `measure` in worker/WorkerApp for the same reasoning on the
    // worker path.
    const box = isCanvasElement(this.canvas) ? measure(this.canvas, this.host) : undefined;
    this.resize(box?.width ?? this.canvas.width ?? 600, box?.height ?? this.canvas.height ?? 600);
    this.attachInput();
    this.attachHistory();
    this.attachViewportInsets();
    this.runtime.onCursor(cursor => {
      if (isCanvasElement(this.canvas)) {
        this.canvas.style.cursor = cursor ?? '';
      }
    });
    this.runtime.start();
  }

  /** Aligns patch delivery from worker-owned stores to the frame. */
  deferPatchesFrom(sources: readonly PatchSource[]): void {
    this.runtime.deferPatchesFrom(sources);
  }

  /**
   * Receives per-frame timings, mirroring WorkerAppOptions.onFrame so
   * the two configurations can be compared on equal terms.
   */
  onFrame(listener: ((metrics: FrameMetrics) => void) | null): void {
    this.runtime.onFrame(listener);
  }

  /** Resolves with the backend that ended up drawing. */
  get rendererReady(): Promise<'canvas2d' | 'webgpu'> {
    return this.runtime.rendererReady;
  }

  /** Resizes the drawing surface and schedules a repaint. */
  resize(width: number, height: number): void {
    this.runtime.resize(width, height, devicePixelRatio());
  }

  /** Turns the layout inspector on or off; see GessoRuntime.setInspectorEnabled. */
  /**
   * Replaces the root and rebuilds the tree, for hot module
   * replacement. See `GessoRuntime.reload` for what survives.
   */
  reload(root: FrameworkChild, services: readonly (new () => object)[] = []): void {
    this.runtime.reload(root, services);
  }

  setInspector(enabled: boolean): void {
    this.runtime.setInspectorEnabled(enabled);
  }

  /**
   * Chooses what the application is told about the appearance: `auto`
   * follows `prefers-color-scheme`, `light` and `dark` override it.
   *
   * The same method `WorkerApp` has, doing the same thing without the
   * protocol in the middle — which is the point of the two shells
   * having one surface.
   */
  setColorScheme(preference: ColorSchemePreference): void {
    this.detachColorScheme?.();
    this.detachColorScheme = null;
    this.colorSchemePreference = preference;
    if (preference === 'auto') {
      this.detachColorScheme = observeColorScheme(scheme => this.runtime.setColorScheme(scheme));
      return;
    }
    this.runtime.setColorScheme(preference);
  }

  /** Receives a report on the hovered node while the inspector is on. */
  onInspect(listener: ((report: UiNodeReport | null) => void) | null): void {
    this.runtime.onInspect(listener);
  }

  /** Receives a devtools panel's answers and updates; see `WorkerApp.onDevtools`. */
  onDevtools(listener: ((event: DevtoolsEvent) => void) | null): void {
    this.runtime.onDevtools(listener);
  }

  /**
   * Answers a devtools panel, with the runtime in this thread. A
   * `console` request does nothing here: the page's console is already
   * the one the developer is reading.
   */
  devtools(request: DevtoolsRequest): void {
    this.runtime.handleDevtools(request);
  }

  /**
   * Receives the errors this configuration would otherwise only log:
   * a renderer that could not draw, and an application listener that
   * threw and was caught so the dispatch could continue.
   *
   * Mirrors `WorkerAppOptions.onError`, minus the two sources that
   * cannot arise here — nothing crosses a message boundary, and an
   * exception nothing catches is an ordinary main-thread error that
   * reaches `window` on its own.
   */
  onError(
    listener: ((message: string, stack: string | undefined, source: 'renderer' | 'listener') => void) | null
  ): void {
    this.runtime.onRendererError(listener === null ? null : message => listener(message, undefined, 'renderer'));
    this.runtime.onListenerError(listener === null ? null : (message, stack) => listener(message, stack, 'listener'));
  }

  debugRoot(): UiNode {
    return this.runtime.debugRoot();
  }

  /**
   * Stops the scheduler, detaches input, and removes the canvas.
   */
  dispose(): void {
    this.running = false;
    this.audio?.dispose();
    this.audio = null;
    this.runtime.onAudioRequest(null);
    this.proxy?.dispose();
    this.proxy = null;
    this.mirror?.dispose();
    this.mirror = null;
    this.detachVisibility?.();
    this.detachVisibility = null;
    this.detachFileDrop?.();
    this.detachFileDrop = null;
    this.detachFullscreen?.();
    this.detachFullscreen = null;
    this.detachReducedMotion?.();
    this.detachReducedMotion = null;
    this.detachColorScheme?.();
    this.detachColorScheme = null;
    this.detachViewportInsets?.();
    this.detachViewportInsets = null;
    this.history?.dispose();
    this.history = null;
    this.adapter.detach();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (isCanvasElement(this.canvas) && this.canvas.parentElement === this.host) {
      this.host.removeChild(this.canvas);
    }
    this.runtime.dispose();
  }

  private attachInput(): void {
    if (!this.inputEnabled || !isCanvasElement(this.canvas)) {
      // A headless or offscreen canvas has no DOM events to forward.
      return;
    }
    this.canvas.tabIndex = 0;
    prepareInputSurface(this.canvas);
    this.adapter.attach(new CanvasPlatformSurface(this.canvas));

    // Text editing goes through a hidden textarea, exactly as in the
    // worker configuration, so the IME works the same on both. Keys are
    // not forwarded from it: the surface above listens on `window` and
    // already sees them.
    const editing = this.runtime.input.editing;
    const canvas = this.canvas;
    this.proxy = new EditingProxy(canvas, {
      beforeInput: (inputType, data) => editing.beforeInput(inputType, data),
      compositionStart: () => editing.compositionStart(),
      compositionUpdate: (text, caret) => editing.compositionUpdate(text, caret),
      compositionEnd: text => editing.compositionEnd(text),
      paste: text => editing.paste(text),
      blur: () => this.runtime.input.focus.blur()
    });
    this.runtime.setTextInputSource('proxy');
    this.runtime.onEditingState(state => this.proxy?.update(state));
    // Sound, driven directly instead of over the protocol: the same
    // sink the worker configuration uses, which is the point of it not
    // knowing where its requests come from.
    this.audio = new AudioSink({
      sample: sample => this.runtime.applyAudioSample(sample),
      action: action => this.runtime.applyAudioAction(action)
    });
    this.runtime.onAudioRequest(request => this.audio?.handle(request));
    this.attachSemanticsMirror(canvas);
    // Files dragged in from the desktop, handed straight to the
    // runtime: there is no thread to cross, so nothing to transfer.
    this.detachFileDrop = attachFileDrop(
      canvas,
      (clientX, clientY) => {
        const box = canvas.getBoundingClientRect();
        return { x: clientX - box.left, y: clientY - box.top };
      },
      message => this.runtime.applyFileDrop(message)
    );
    if (typeof document !== 'undefined') {
      const onVisibility = (): void => this.runtime.setVisible(document.visibilityState !== 'hidden');
      document.addEventListener('visibilitychange', onVisibility);
      this.detachVisibility = () => document.removeEventListener('visibilitychange', onVisibility);
      this.detachFullscreen = observeFullscreen(canvas, active => {
        // The host's `ResizeObserver` does not see this; see
        // `surfaceBox` for why, and for why the size comes from the
        // canvas going in and from the host coming out.
        this.fullscreen = active;
        this.runtime.setFullscreen(active);
        afterLayout(() => {
          const box = surfaceBox(canvas, this.host, active);
          if (box !== null) {
            this.resize(box.width, box.height);
          }
        });
      });
      // Once at startup as well as on change: a canvas mounted into a
      // document that is already fullscreen never fires the event.
      this.runtime.setFullscreen(isDocumentFullscreen(canvas));
    }
    this.detachReducedMotion = observeReducedMotion(reduced => this.runtime.setReducedMotion(reduced));
    this.setColorScheme(this.colorSchemePreference);
  }

  /**
   * Mounts the off-screen DOM an assistive technology reads.
   *
   * The same class the worker configuration uses, driven directly
   * instead of over the protocol — which is the point of it being a
   * DOM class that knows nothing about where its updates come from.
   * Keys are not forwarded from it: `CanvasPlatformSurface` listens on
   * `window` and already sees them, exactly as for the editing proxy.
   */
  private attachSemanticsMirror(canvas: HTMLCanvasElement): void {
    if (!this.accessibilityEnabled) {
      return;
    }
    const mirror = new SemanticsMirror(
      canvas,
      {
        action: action => this.runtime.applySemanticsAction(action),
        // A paste onto something that is not a text field lands here,
        // because the element holding focus while the app has it is
        // one of the mirror's and not the canvas.
        paste: text => this.runtime.input.editing.paste(text)
      },
      this.proxy
    );
    this.mirror = mirror;
    this.runtime.onSemantics(update => mirror.apply(update));
  }

  /**
   * Connects the router to the window's address bar.
   *
   * Outside `attachInput` deliberately: an app mounted with
   * `input: false` — a test, a headless render — still routes, and a
   * router that silently stopped syncing in that configuration would
   * be a difference between the two hosts that nothing declared.
   */
  private attachHistory(): void {
    const history = createShellHistory(this.historyOptions);
    this.history = history;
    this.runtime.onShellRequest(request => this.handleShellRequest(request, history));
    history.onChange(url => this.runtime.setUrl(url));
    this.runtime.setUrl(history.url);
  }

  /**
   * Reports the platform's safe area and soft keyboard to the runtime.
   *
   * Outside `attachInput` for the reason `attachHistory` is: the insets
   * are a layout fact, and an app mounted with `input: false` still
   * lays out. Nothing is decided here. `observeViewportInsets` reads
   * `visualViewport` and hands over four numbers, and the runtime
   * publishes them into the application's inset registry, which is the
   * same route `WorkerApp` takes with a message in the middle.
   */
  private attachViewportInsets(): void {
    this.detachViewportInsets = observeViewportInsets(insets => this.runtime.setViewportInsets(insets));
  }

  private handleShellRequest(request: ShellRequest, history: ShellHistory): void {
    if (request.type === 'history') {
      if (request.action === 'push') {
        history.push(request.url);
      } else if (request.action === 'replace') {
        history.replace(request.url);
      } else if (request.action === 'back') {
        history.back();
      } else {
        history.forward();
      }
      return;
    }
    if (!isCanvasElement(this.canvas)) {
      // No document to write a clipboard through or open a window from.
      // A popup still has to be answered, because a promise nobody
      // settles is worse than a popup nobody opened, and a storage
      // request is answered for the same reason.
      if (request.type === 'popup') {
        this.runtime.settlePopup(request.id, false);
      } else if (request.type === 'storage') {
        this.runtime.settleStorage(request.id, shellStorageDenied());
      } else if (request.type === 'file') {
        this.runtime.settleFile(request.id, shellFilesUnsupported('There is no document to reach files through.'));
      }
      return;
    }
    if (request.type === 'clipboard') {
      writeClipboard(request.text, this.canvas.ownerDocument);
      return;
    }
    if (request.type === 'fullscreen') {
      // The canvas rather than the document body: what the application
      // draws on is what should fill the screen, and a host page with
      // chrome of its own around the canvas does not want that chrome
      // blown up with it.
      setElementFullscreen(this.canvas, request.enter);
      return;
    }
    const view = this.canvas.ownerDocument.defaultView;
    if (request.type === 'file') {
      if (view === null) {
        this.runtime.settleFile(request.id, shellFilesUnsupported('There is no window to reach files through.'));
        return;
      }
      // The same shell half the worker configuration runs, with no
      // thread to cross: the answer settles the promise directly.
      this.files ??= new ShellFiles(browserFilesHost(view as Window & typeof globalThis));
      void this.files.perform(request.request).then(result => this.runtime.settleFile(request.id, result));
      return;
    }
    if (request.type === 'storage') {
      // Performed here rather than posted, because in this
      // configuration the shell and the render side are the same
      // thread; the answer is the same either way.
      this.runtime.settleStorage(
        request.id,
        performShellStorage(request, () => view?.localStorage)
      );
      return;
    }
    if (request.type === 'popup') {
      // Same shape as `WorkerApp.openPopup`, and `noopener` is absent
      // for the same reason: it would make the answer always `null`.
      let opened = false;
      try {
        const features = `popup,width=${request.width},height=${request.height}`;
        opened = (view?.open(request.url, request.name, features) ?? null) !== null;
      } catch {
        opened = false;
      }
      this.runtime.settlePopup(request.id, opened);
      return;
    }
    view?.open(request.url, '_blank', 'noopener,noreferrer');
  }

  private observeResize(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry === undefined) {
        return;
      }
      // contentRect is the logical CSS size. The surface owns the
      // backing store, so the canvas attributes are never written here:
      // round-tripping the size through them once meant the second
      // resize read device pixels back as logical pixels.
      if (this.fullscreen) {
        // The canvas is filling the screen and is no longer in the
        // host's flow; see the fullscreen listener above.
        return;
      }
      this.resize(entry.contentRect.width, entry.contentRect.height);
    });
    this.resizeObserver.observe(this.host);
  }
}

function createCanvasElement(): HTMLCanvasElement {
  return document.createElement('canvas');
}

function isCanvasElement(canvas: CanvasHost): canvas is HTMLCanvasElement {
  return typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement;
}

function devicePixelRatio(): number {
  return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
}
