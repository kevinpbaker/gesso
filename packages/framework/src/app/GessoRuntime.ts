import type { FrameworkChild } from '../ComponentElement';
import { ComponentHostResolver } from '../ComponentHostResolver';
import { getComponentMetadata } from '../metadata';
import {
  describeStream,
  formatNodePath,
  printPropValue,
  type UiEnvironmentReport,
  type UiNodeReport,
  type UiBeneathReport,
  type UiOwnerReport,
  type UiPropReport,
  type UiSemanticsReport
} from './NodeReport';
import {
  treeText,
  type DevtoolsEvent,
  type DevtoolsRequest,
  type UiTreeNode,
  type UiTreeSnapshot
} from './DevtoolsProtocol';
import {
  UiGraph,
  UiGraphBuilder,
  describeOverrides,
  formatExplanation,
  isComponentLikeElement,
  linkOf,
  textRunOfRecordId,
  type UiEnvironment,
  isObservable,
  type UiElement,
  Stack,
  scrollbarThumb,
  UiVirtualWindow,
  VIRTUAL_INDEX_PROP,
  VIRTUAL_LEAD_PROP,
  VIRTUAL_WINDOW_PROP,
  type VirtualItemMeasure,
  DirtyFlags,
  propertyEffects,
  setPerformanceMarks,
  resolveCursor,
  type UiNode,
  UiNodeType,
  UiInputDispatcher,
  UiPointerEvent,
  UiEventType,
  UiGestureRecognizer,
  UiHitTester,
  UiPointerController,
  UiTouchScroller,
  UiWheelController,
  type ScrollContainerState,
  type ScrollSink,
  type UiScrollability,
  UiFocusManager,
  FocusNotifier,
  EnvironmentNotifier,
  UiEnvironmentKeys,
  UiInsetRegistry,
  insetsEqual,
  noInsets,
  type UiInsets,
  UiKeyboardController,
  UiEditingController,
  type EditingState,
  UiSelectionController,
  UiFindController,
  AnimationDriver,
  UiSharedElements,
  buildSemanticsTree,
  diffSemantics,
  LayoutNotifier,
  type UiSemanticsAction,
  type UiSemanticsBox,
  type UiSemanticsMap,
  type UiSemanticsPatch,
  type UiSemanticsUpdate,
  type LayoutBox,
  LayoutEngine,
  type LayoutExplanation,
  Constraints,
  Canvas2DRenderer,
  CanvasTextMeasurer,
  type TextMeasurer,
  createCanvasSurface,
  createWebGPUSurface,
  isWebGPUAvailable,
  LayoutInspector,
  WebGPURenderer,
  type CanvasHost,
  type CanvasSurface,
  type RendererBackend,
  type UiRenderer,
  type WebGPUCanvasHost,
  UiScheduler,
  UiTimerFrameClock,
  type UiFrame,
  type UiFrameClockFactory
} from '@gesso/core';
import { createComponent } from '../createComponent';
import { OverlayLayer } from '../overlay/OverlayLayer';
import { OverlayService } from '../overlay/OverlayService';
import type { ColorScheme } from './colorScheme';
import { ShellService, type ShellRequest, type ShellStorageResult } from './ShellService';
import { AudioService, type AudioAction, type AudioRequest, type AudioSample } from './AudioService';
import { RouterService, type RouterRoutes } from '../router/RouterService';
import { FindService } from './FindService';
import { FocusService } from './FocusService';
import { MediaService, type MediaOptions } from './MediaService';
import { FontService, type FontFamilyDeclaration } from './FontService';
import { AnimationService } from './AnimationService';
import { FrameService } from './FrameService';
import { InputLatencyTracker } from './InputLatency';
import { SmoothScroller } from './SmoothScroller';
import { ChannelRegistry } from '../channel/ChannelRegistry';
import { ServiceRegistry } from '../service/ServiceRegistry';

/**
 * The ordered work of one frame.
 *
 * Only five of the seven stages the design document imagined are real
 * phases. Component reconciliation and input dispatch are driven by
 * events, not by the clock: an observable emission reconciles its
 * subtree immediately and a pointer event routes immediately, each
 * marking nodes dirty so the *effects* land in the next frame. Giving
 * them frame slots would add latency and describe the system falsely.
 *
 * `ticks`, `patches` and `environment` run before the dirty set is
 * snapshotted, because all three produce dirt that this frame must
 * see. `layout` and `render` run against the snapshot.
 *
 * `ticks` is first because an animation's writes are inputs to
 * everything after them: a tick that changed a width has to be the
 * width this frame's virtualization measures against and this frame's
 * layout places from, and a tick that ran after `patches` would draw
 * one frame late for the whole life of the animation.
 */
export const UI_FRAME_PHASES = [
  'ticks',
  'patches',
  'environment',
  'virtualize',
  'layout',
  'semantics',
  'render'
] as const;

export type UiFramePhase = (typeof UI_FRAME_PHASES)[number];

export type FramePhaseTimings = Record<UiFramePhase, number>;

/**
 * Guard against a root component that only ever renders another
 * component, which would otherwise recurse until the stack gives out.
 */
const MAX_ROOT_COMPONENT_DEPTH = 32;

/**
 * Input controllers over the built tree.
 *
 * Exposed because input arrives differently per thread: from DOM
 * events through a UiPlatformAdapter on the main thread, and from
 * forwarded messages in a render worker. Both end up calling these.
 */
export interface RuntimeInput {
  readonly dispatcher: UiInputDispatcher;
  readonly pointer: UiPointerController;
  readonly wheel: UiWheelController;
  readonly keyboard: UiKeyboardController;
  readonly focus: UiFocusManager;
  /** Text editing: the shell's beforeinput, composition and paste land here. */
  readonly editing: UiEditingController;
  /** Selecting and copying text nobody types into. */
  readonly selection: UiSelectionController;
  /** Finding text in the app's own content; the find bar's engine. */
  readonly find: UiFindController;
  /** Dragging a scroll container's contents with a finger. */
  readonly touchScroll: UiTouchScroller;
}

/**
 * Which backend draws.
 *
 * **`canvas2d` is the default, and that is not the obvious answer.** A
 * GPU backend sounds like the faster one and on a scene of shapes and
 * text it is. On a scene dense with pictures it is currently not, and
 * the reason is one asymmetry rather than anything fundamental:
 * Canvas2D keeps a copy of each still at the size it is drawn (see
 * `ScaledImageCache`), while `WebGPUTextureCache` uploads a still at
 * the source's own size. A 480px cover shown at 164 is therefore about
 * eight times the texture on WebGPU, and a screen holding ninety of
 * them feels it. Measured on Segue's home screen, where the difference
 * was plain enough to notice without instrumenting anything.
 *
 * So the default is the one that is fast everywhere today, and the
 * faster ceiling is opt-in until the gap is closed. When
 * `WebGPUTextureCache` learns the drawn size the way its video path
 * already has, this should flip back.
 *
 * `auto` picks WebGPU where the browser has it and Canvas2D everywhere
 * else. The choice is made synchronously on whether `navigator.gpu`
 * exists, so an engine that never shipped WebGPU (WKWebView, WebKitGTK)
 * is on Canvas2D from the first frame rather than after a rejected
 * adapter request. A browser that has the entry point but cannot
 * produce an adapter or a device still falls back, asynchronously, once
 * that request fails.
 *
 * `canvas2d` pins the portable backend and never asks for an adapter.
 * `webgpu` asks for it and falls back the same way `auto` does, but
 * reports the fallback to the console, because a caller that named the
 * backend wants to know it did not get it.
 */
export type RendererChoice = RendererBackend | 'auto';

export interface GessoRuntimeOptions {
  /** Root component or element. */
  root: FrameworkChild;
  /** Canvas to draw into: HTMLCanvasElement, OffscreenCanvas, or a test double. */
  canvas: CanvasHost;
  /** The rendering backend. Defaults to `canvas2d`; see RendererChoice. */
  renderer?: RendererChoice;
  /**
   * A canvas for text measurement when the draw canvas is WebGPU's — a
   * canvas holds one context, so the measurer needs its own. Defaults
   * to a 1×1 OffscreenCanvas; tests pass a double.
   */
  measureCanvas?: CanvasHost;
  /**
   * The measurer layout and the renderers share, when the caller wants
   * one that does not come from a canvas.
   *
   * Only a test supplies it. A canvas measurer is the right answer
   * everywhere a canvas is real, but a test double's `measureText`
   * answers the same width for every font size, so text laid out
   * against one is not text: a heading and its caption come out the
   * same height. `@gesso/testing` passes `CharacterCountTextMeasurer`
   * instead, which is proportional to the font size and identical on
   * every machine.
   */
  textMeasurer?: TextMeasurer;
  /**
   * The image resolver, icon rasteriser and video decoder the
   * `MediaService` should use.
   *
   * Supplied here rather than through the store afterwards because the
   * tree is built inside this constructor, and an `Image` in it asks
   * for its bitmap at that moment: a resolver installed after the
   * runtime exists would already have missed the first screen. An app
   * that fetches through its own stack, or one that has measured a
   * reason to decode in a worker of its own, passes it here.
   *
   * An application reaches this through `createApp(Root).useMedia()`
   * on the single thread and `renderRoot(Root).useMedia()` in a render
   * worker. It is declared in the worker rather than in the shell
   * because a resolver is a function and no function crosses a
   * `postMessage`.
   */
  media?: MediaOptions;
  /**
   * The font families this runtime's text may name, with their faces
   * and fallback stacks. Each face is loaded into this thread's font
   * set, and the tree is measured again as it arrives; until then text
   * draws in the fallback. See `FontService`.
   */
  fonts?: readonly FontFamilyDeclaration[];
  /**
   * The runtime services this runtime's components may reach.
   *
   * Supplied only by a test wanting to substitute one; a runtime
   * registers the six it owns itself, because they are part of what a
   * runtime *is* rather than something an application configures.
   */
  services?: ServiceRegistry;
  /**
   * The routes a `RouterOutlet` in this tree resolves against.
   *
   * Optional, like every other application-shaped thing here: a
   * runtime with no routes still registers a `RouterService`, and it
   * simply matches nothing. Given here rather than set afterwards for
   * the same reason `media` is — the tree is built inside this
   * constructor, and an outlet in it asks for the current match at
   * that moment.
   */
  routes?: RouterRoutes;
  /**
   * The channels this runtime's components may reach.
   *
   * Attached elsewhere and handed in, because where a channel's data
   * lives is the application's decision, not the runtime's.
   */
  channels?: ChannelRegistry;
  /** Defaults to a timer clock, which is the only option inside a worker. */
  clock?: UiFrameClockFactory;
  /** Initial logical size. Callers normally follow with resize(). */
  width?: number;
  height?: number;
  dpr?: number;
}

/**
 * The whole UI, with no reference to the DOM.
 *
 * Owns the component runtime, retained graph, layout engine, input
 * controllers, scheduler and renderer. Everything here runs happily
 * in a Worker: the only things it cannot do for itself are obtain a
 * canvas and learn about size and input, which is exactly the split
 * between this class and its two hosts — GessoApp on the main thread
 * and renderRoot() in a render worker.
 */
export class GessoRuntime {
  readonly services: ServiceRegistry;
  readonly channels: ChannelRegistry;
  readonly input: RuntimeInput;
  /**
   * The layout inspector: hover boxes, a heatmap of measured nodes and
   * `engine.explain` for the hovered node, painted over each frame
   * while enabled. Off by default; see `setInspectorEnabled`.
   */
  readonly inspector: LayoutInspector;

  private readonly resolver: ComponentHostResolver;
  private readonly graph = new UiGraph();
  private readonly engine: LayoutEngine;
  private readonly builder: UiGraphBuilder;
  private readonly scheduler: UiScheduler;
  private readonly inputLatency = new InputLatencyTracker();
  private readonly canvas: CanvasHost;
  private readonly textMeasurer: TextMeasurer;
  /** The 2D surface when Canvas2D draws; the inspector paints on it. */
  private canvasSurface: CanvasSurface | null = null;
  private renderer: UiRenderer;
  private rendererState: RendererBackend | 'pending';
  /** Resolves with the backend that ended up drawing. */
  readonly rendererReady: Promise<RendererBackend>;
  private readonly dispatcher = new UiInputDispatcher();
  private width: number;
  private height: number;

  /** The layout root: a stack holding the app root and the overlay layer. */
  private root: UiNode | undefined;
  /** The node the app's root definition produced. */
  private appRoot: UiNode | undefined;
  /** The platform's insets as the shell last reported them; see `setViewportInsets`. */
  private viewportInsetValue: UiInsets = noInsets;
  /** The registry those insets are currently published into, and the handle on them. */
  private viewportInsetRegistry: UiInsetRegistry | null = null;
  private viewportInsetWrite: ((next?: Partial<UiInsets>) => void) | null = null;
  /** Stops watching the app root's environment for a change of registry. */
  private detachViewportInsetEnvironment: (() => void) | null = null;
  private constraints: Constraints;
  private pixelRatio: number;
  private lastFrameMs = 0;
  private frameListener: ((metrics: FrameMetrics) => void) | null = null;
  private rendererErrorListener: ((message: string) => void) | null = null;
  /** WebGPU stage timings of the frame being rendered; null on Canvas2D. */
  private gpuTimings: GpuStageTimings | null = null;
  private inspectListener: ((report: UiNodeReport | null) => void) | null = null;
  /** The last report's explanation text, which is what tells two reports apart. */
  private lastInspection: string | null = null;
  private devtoolsListener: ((event: DevtoolsEvent) => void) | null = null;
  /** Whether a panel wants a tree snapshot after every frame that changed the tree. */
  private watchingTree = false;
  /**
   * Live subscriptions as of the last snapshot sent.
   *
   * A leak that adds no nodes changes nothing `frameChangedTree` looks
   * at, so a panel watching for one would never be told. This is the
   * second reason to resend, and it costs a count only while a panel
   * is attached.
   */
  private lastSubscriptions = -1;
  /** Whether a panel wants every frame's metrics. */
  private watchingFrames = false;
  /** The node a panel has selected, whose report is kept fresh; null for none. */
  private selectedId: string | null = null;
  /** The selected node's last report, serialised, which is what tells two apart. */
  private lastSelectedReport: string | null = null;
  private cursorListener: ((cursor: string | null) => void) | null = null;
  private lastCursor: string | null = null;
  private scrollabilityListener: ((scrollability: UiScrollability, scrollsAnything: boolean) => void) | null = null;
  private lastScrollability: UiScrollability = { up: false, down: false, left: false, right: false };
  /**
   * Undefined until the first report, so that one is always sent.
   *
   * The values it takes are ordinary booleans; the third state exists
   * only to make "nothing has been said yet" different from "nothing
   * scrolls", which matters because those two need opposite
   * `touch-action` on the shell's canvas and an app with no scroll
   * container at all would otherwise never send either.
   */
  private lastScrollsAnything: boolean | undefined = undefined;
  private editingListener: ((state: EditingState | null) => void) | null = null;
  /**
   * The selection controller, reachable before `input` is assigned:
   * the graph's node-removed listener is installed in the constructor
   * and fires for nodes taken out from under a live selection.
   */
  private selectionController: UiSelectionController | null = null;
  private findController: UiFindController | null = null;
  /** Reachable before `input` is assigned, for the same reason. */
  private readonly focusManager: UiFocusManager;
  /** The input stack's hit tester, kept for the inspector's questions about what lies where. */
  private hitTester!: UiHitTester;
  private readonly layoutNotifier: LayoutNotifier;
  /** Animates a wheel scroll; see `SmoothScroller`. */
  private readonly smoothScroller: SmoothScroller;
  /**
   * Whether the document showing this runtime is on screen.
   *
   * Assumed true until the shell says otherwise, because a runtime with
   * no shell — a spec, a headless graph — is never told and must draw.
   */
  private visible = true;
  /**
   * The running animations. Built as a field rather than in the body
   * of the constructor because the builder, the services and `buildRoot`
   * all need it, and `buildRoot` is where a component's first
   * `animate()` can happen.
   */
  private readonly animations = new AnimationDriver();
  /**
   * Which node currently answers to each shared-element name.
   *
   * Per runtime for the same reason the driver above is: several
   * runtimes share a worker in the playground, and a shared registry
   * would let one runtime's element morph from another's.
   */
  private readonly sharedElements = new UiSharedElements();
  private readonly focusNotifier = new FocusNotifier();
  private readonly environmentNotifier = new EnvironmentNotifier();
  private semantics: UiSemanticsMap = new Map();
  private semanticsListener: ((update: UiSemanticsUpdate) => void) | null = null;
  /**
   * The box last reported for each mirrored node, so a frame that
   * moved three rows of a list sends three boxes rather than all of
   * them. Only populated while a listener is attached.
   */
  private semanticsBoxes = new Map<string, LayoutBox>();
  private lastFocusedId: string | null = null;
  /**
   * Where the caret was when `reload` replaced the tree, put back on
   * the frame that lays the new one out, and null when nothing had it.
   *
   * Null is restored as well as an id, which is the second half of
   * `decisions/0049`'s gap: a rebuilt subtree runs `autoFocus` again,
   * and a dialog's first field taking the caret away from where the
   * person was is worse than a reload doing nothing at all.
   */
  private focusAfterReload: string | null = null;
  /** Whether `focusAfterReload` is waiting to be applied. */
  private restoringFocus = false;
  /** A frame changed semantics while nothing was listening; see `semanticsTree`. */
  private semanticsStale = false;
  private lastEditingState: EditingState | null = null;
  private shellListener: ((request: ShellRequest) => void) | null = null;
  private audioListener: ((request: AudioRequest) => void) | null = null;
  private caretTimer: ReturnType<typeof setTimeout> | null = null;
  private scrollbarTimer: ReturnType<typeof setTimeout> | null = null;
  private inspectorTimer: ReturnType<typeof setTimeout> | null = null;
  /** Pending wake-up for an animation that does not want every frame. */
  private animationTimer: ReturnType<typeof setTimeout> | null = null;
  private replicas: readonly PatchSource[] = [];
  private phaseTimings: FramePhaseTimings = emptyPhaseTimings();
  private started = false;

  constructor(options: GessoRuntimeOptions) {
    this.services = options.services ?? new ServiceRegistry();
    this.channels = options.channels ?? new ChannelRegistry();
    this.canvas = options.canvas;
    this.pixelRatio = options.dpr ?? 1;
    this.width = options.width ?? 600;
    this.height = options.height ?? 600;
    this.constraints = Constraints.loose(this.width, this.height);

    // `auto` decides here, in the constructor, rather than by letting
    // the WebGPU path fail: a browser with no `navigator.gpu` gets the
    // Canvas2D renderer immediately, with no `pending` frames and no
    // fallback to unwind. Only `webgpu` asked for by name goes to the
    // GPU path on an engine that has no entry point, so that it can
    // report what it could not have.
    const choice = options.renderer ?? 'canvas2d';
    const drawWithWebGPU = choice === 'webgpu' || (choice === 'auto' && isWebGPUAvailable());
    if (!drawWithWebGPU) {
      this.canvasSurface = createCanvasSurface(options.canvas);
      this.textMeasurer = options.textMeasurer ?? new CanvasTextMeasurer(this.canvasSurface.getContext2D());
      this.renderer = new Canvas2DRenderer({ surface: this.canvasSurface });
      this.rendererState = 'canvas2d';
      this.rendererReady = Promise.resolve('canvas2d');
    } else {
      // The draw canvas will hold the WebGPU context, so text is measured
      // on a canvas of its own. One measurer still serves layout and the
      // renderer, which is what keeps line breaks identical.
      const measureSurface = createCanvasSurface(options.measureCanvas ?? createMeasureCanvas());
      this.textMeasurer = options.textMeasurer ?? new CanvasTextMeasurer(measureSurface.getContext2D());
      const webgpu = new WebGPURenderer({
        surface: createWebGPUSurface(options.canvas as unknown as WebGPUCanvasHost),
        onError: message => this.reportRendererError(message),
        hooks: {
          onPrepareEnd: ms => (this.gpuTimings = { ...(this.gpuTimings ?? emptyGpuTimings()), prepare: ms }),
          onUploadEnd: ms => (this.gpuTimings = { ...(this.gpuTimings ?? emptyGpuTimings()), upload: ms }),
          onEncodeEnd: ms => (this.gpuTimings = { ...(this.gpuTimings ?? emptyGpuTimings()), encode: ms })
        }
      });
      this.renderer = webgpu;
      this.rendererState = 'pending';
      this.rendererReady = webgpu
        .initialize()
        .then((): RendererBackend => {
          if (this.renderer !== webgpu) {
            return this.rendererState === 'pending' ? 'canvas2d' : this.rendererState;
          }
          this.rendererState = 'webgpu';
          this.renderer.resize(this.width, this.height, this.pixelRatio);
          this.requestRepaint();
          return 'webgpu';
        })
        .catch((error: unknown): RendererBackend => {
          if (choice === 'webgpu') {
            // eslint-disable-next-line no-console
            console.error('WebGPU was requested but is unavailable; drawing with Canvas2D.', error);
          }
          this.fallBackToCanvas2D(webgpu);
          return 'canvas2d';
        });
    }

    this.engine = new LayoutEngine(this.textMeasurer);
    this.inspector = new LayoutInspector(this.engine, {
      // Read through `this.builder`, which is assigned below: the
      // closure runs when a node is hovered, long after the
      // constructor.
      modifierNames: node => this.builder.modifiersFor(node)?.names ?? []
    });
    this.resolver = new ComponentHostResolver(this.services, this.channels);
    this.layoutNotifier = new LayoutNotifier();
    // Built before the tree, not with the rest of the input stack in
    // `createInput`: modifiers attach while `buildRoot` runs, and a
    // `focusRing()` on the first control asks whether its node has
    // focus at that moment. The traversal root arrives afterwards
    // through `setRoot`, which is the only thing the manager needs the
    // tree for.
    this.focusManager = new UiFocusManager(this.graph.root, this.dispatcher);
    this.focusManager.onFocusChange(node => {
      this.focusNotifier.handleFocusChange(node, this.focusManager.focusVisible);
      if (this.semanticsListener !== null) {
        // A mirror has to move DOM focus with the app's, and the frame
        // where it hears about it is the frame this arms. Most focus
        // changes dirty something anyway — a focus ring is a property
        // write — but a node with no visible focus state would
        // otherwise change nothing and schedule nothing.
        this.requestRepaint();
      }
    });
    this.graph.setEnvironmentChangedListener(node => this.environmentNotifier.handleEnvironmentChange(node));
    this.builder = new UiGraphBuilder(this.graph, {
      components: this.resolver,
      dispatcher: this.dispatcher,
      focus: {
        isFocused: node => this.focusNotifier.isFocused(node),
        isFocusVisible: node => this.focusNotifier.isFocusVisible(node),
        focus: node => {
          this.focusManager.focus(node);
        },
        onFocusChange: (node, listener) => this.focusNotifier.add(node, listener)
      },
      environment: {
        read: (node, key) => (node.environment ?? this.graph.buildNodeEnvironment(node)).get(key),
        onChange: (node, listener) => this.environmentNotifier.add(node, listener)
      },
      layout: {
        // The visible box, not the world box: a modifier that turns a
        // pointer position into a fraction of its node needs where the
        // node is *seen*, which is the world box after every scroll and
        // sticky offset above it.
        box: node => (this.engine.recordFor(node) === undefined ? null : this.engine.visibleBox(node)),
        // And the pre-scroll box, for a modifier asking where the node
        // sits in the layout rather than where it is seen — a layout
        // animation, which must not mistake a scroll for a move.
        flowBox: node => (this.engine.recordFor(node) === undefined ? null : this.engine.worldBox(node)),
        // The container's *effective* offset, which is the record's and
        // not the property's: a wheel writes the property unclamped and
        // the engine clamps it to the content on the next layout, so the
        // property can name a place the list never went.
        scroll: node => {
          const record = this.engine.recordFor(node);
          return record === undefined ? null : { x: record.scrollX, y: record.scrollY };
        },
        onLayout: (node, listener) => this.layoutNotifier.add(node, listener)
      },
      animations: this.animations,
      sharedElements: this.sharedElements
    });

    // Every runtime has an overlay layer; its entries hold elements and
    // nodes, so it could not leave this thread even if asked.
    if (!this.services.has(OverlayService)) {
      this.services.register(OverlayService);
    }
    // And the shell's services: clipboard and URLs, which only the host
    // thread can reach.
    if (!this.services.has(ShellService)) {
      this.services.register(ShellService);
    }
    this.services.get(ShellService).setHandler(request => this.shellListener?.(request));
    // And sound, which is the shell's element and this thread's client.
    if (!this.services.has(AudioService)) {
      this.services.register(AudioService);
    }
    this.services.get(AudioService).setHandler(request => this.audioListener?.(request));
    // And the find session, so a component can drive the search the
    // browser's own find bar cannot do over a canvas.
    if (!this.services.has(FindService)) {
      this.services.register(FindService);
    }
    // And focus, which lives in the input stack and is therefore out
    // of a component's reach without a store in front of it.
    if (!this.services.has(FocusService)) {
      this.services.register(FocusService);
    }
    // And the frames themselves, for a screen that shows its own
    // frame gap or input latency.
    if (!this.services.has(FrameService)) {
      this.services.register(FrameService);
    }
    // And the image resolver and icon rasteriser, whose caches must be
    // per runtime: two runtimes in one worker must not share a bitmap
    // one of them is about to close.
    if (!this.services.has(MediaService)) {
      this.services.register(MediaService);
    }
    // And the fonts, which load into this thread's font set and re-lay
    // the tree out as they arrive.
    if (!this.services.has(FontService)) {
      this.services.register(FontService);
    }
    this.services.get(FontService).setListener(() => this.fontsChanged());
    if (options.fonts !== undefined) {
      this.services.get(FontService).declare(options.fonts);
    }
    // And animation, whose running set must be per runtime for the
    // same reason the media caches are: the playground has several
    // runtimes in one worker, and a shared driver would tick a
    // disposed runtime's cells.
    if (!this.services.has(AnimationService)) {
      this.services.register(AnimationService);
    }
    this.services.get(AnimationService).setDriver(this.animations);
    // Sound reads the clock through the same driver, so a playback's
    // position moves between the shell's samples.
    this.services.get(AudioService).setAnimations(this.services.get(AnimationService));
    this.smoothScroller = new SmoothScroller(
      this.graph,
      this.services.get(AnimationService),
      // Read fresh on every notch rather than captured: content grows,
      // and a target clamped against yesterday's limit stops short.
      (node, axis) => {
        const record = this.engine.recordFor(node);
        if (record === undefined) {
          return 0;
        }
        return axis === 'scrollY'
          ? Math.max(0, record.contentHeight - record.height)
          : Math.max(0, record.contentWidth - record.width);
      }
    );
    // And the router, whose matches hold route definitions, which hold
    // component classes: it could not cross a worker boundary if it
    // wanted to. The one thing it needs from the shell is the address
    // bar, which it reaches the same way the clipboard does.
    if (!this.services.has(RouterService)) {
      this.services.register(RouterService);
    }
    const router = this.services.get(RouterService);
    router.setHistory({
      push: url => this.shellListener?.({ type: 'history', action: 'push', url }),
      replace: url => this.shellListener?.({ type: 'history', action: 'replace', url }),
      back: () => this.shellListener?.({ type: 'history', action: 'back' }),
      forward: () => this.shellListener?.({ type: 'history', action: 'forward' })
    });
    if (options.routes !== undefined) {
      router.setRoutes(options.routes);
    }
    if (options.media?.resolver !== undefined) {
      this.services.get(MediaService).setResolver(options.media.resolver);
    }
    if (options.media?.rasterizer !== undefined) {
      this.services.get(MediaService).setRasterizer(options.media.rasterizer);
    }
    if (options.media?.videoResolver !== undefined) {
      this.services.get(MediaService).setVideoResolver(options.media.videoResolver);
    }

    this.scheduler = new UiScheduler({
      clock: options.clock ?? (callback => new UiTimerFrameClock(callback)),
      dirty: this.graph.getDirtyNodes(),
      beforeCollect: time => this.runPreCollectPhases(time),
      onFrame: frame => this.handleFrame(frame)
    });

    // An animation started between frames — from a click handler that
    // changes nothing else — has to arm the frame that will run its
    // first tick. Nothing in the graph is dirty at that moment, so
    // nothing else would.
    this.animations.setWakeListener(() => this.scheduler.wake());
    this.graph.setDirtyListener(() => this.scheduler.notifyDirty());
    this.graph.setNodeRemovedListener(node => {
      this.engine.detachNode(node);
      // Neither a selection nor a set of find matches can outlive its
      // nodes: virtualization and route changes both take them out from
      // under one.
      this.selectionController?.handleNodeRemoved(node);
      this.findController?.handleNodeRemoved(node);
      // Nor can focus: a closed dialog or a recycled row takes the
      // focused node with it.
      this.focusManager.handleNodeRemoved(node);
      this.layoutNotifier.handleNodeRemoved(node);
      this.smoothScroller.handleNodeRemoved(node);
      this.focusNotifier.handleNodeRemoved(node);
      this.environmentNotifier.handleNodeRemoved(node);
    });

    this.buildRoot(options.root);
    this.input = this.createInput();
    this.services.get(FocusService).setManager(this.input.focus);
    // Keyboard navigation must keep the focused control visible — but
    // only keyboard navigation. A click has already shown the person
    // where they are, and revealing what they just pressed scrolls the
    // page out from under a pointer that is still resting on it: a
    // half-visible 562px card jumped 511px up the screen on the press,
    // before the transition it started had drawn a frame. A browser
    // draws the same line, and for the same reason.
    this.input.focus.onFocusChange((node, source) => {
      if (node !== null && source !== 'pointer') {
        this.scrollIntoView(node);
      }
    });

    if (options.width !== undefined && options.height !== undefined) {
      this.resize(options.width, options.height, this.pixelRatio);
    }
  }

  /**
   * Aligns patch delivery from worker-owned channels to the frame.
   *
   * Without this a burst of patches rebuilds the bound subtree once per
   * patch, even though only the final state is ever drawn.
   */
  deferPatchesFrom(sources: readonly PatchSource[]): void {
    this.replicas = sources;
    for (const source of sources) {
      source.deferPatches(() => this.scheduler.notifyDirty());
    }
  }

  /** Starts the frame scheduler. */
  start(): void {
    this.started = true;
    this.scheduler.start();
  }

  /** The backend drawing frames, or `pending` while WebGPU initialises. */
  get rendererBackend(): RendererBackend | 'pending' {
    return this.rendererState;
  }

  /**
   * Receives renderer errors — GPU validation failures, device loss —
   * that would otherwise only reach the console of whichever thread
   * renders. Without a listener they are logged.
   */
  onRendererError(listener: ((message: string) => void) | null): void {
    this.rendererErrorListener = listener;
  }

  /**
   * Receives exceptions thrown by the application's own event
   * listeners — an `onClick` that throws.
   *
   * The dispatcher catches those so that one broken listener cannot
   * stop an event reaching the rest of the tree, which means nothing
   * outside it can see them. Without this hook they are logged to the
   * console of whichever thread dispatched, and in the worker
   * configuration that console is not the page's.
   */
  onListenerError(listener: ((message: string, stack?: string) => void) | null): void {
    this.dispatcher.onListenerError(
      listener === null
        ? null
        : (error, node, type) => {
            const message = error instanceof Error ? error.message : String(error);
            listener(
              `${message} (listener: ${type} on ${this.pathOf(node)})`,
              error instanceof Error ? error.stack : undefined
            );
          }
    );
  }

  private reportRendererError(message: string): void {
    if (this.rendererErrorListener !== null) {
      this.rendererErrorListener(message);
      return;
    }
    // eslint-disable-next-line no-console
    console.error(message);
  }

  /**
   * Replaces a WebGPU renderer that could not start, or lost its
   * device, with Canvas2D on the same canvas. The WebGPU path does not
   * touch the canvas until it has a device, so the 2D context is free.
   */
  private fallBackToCanvas2D(failed: UiRenderer): void {
    if (this.renderer !== failed) {
      return;
    }
    failed.dispose();
    this.canvasSurface = createCanvasSurface(this.canvas);
    this.renderer = new Canvas2DRenderer({ surface: this.canvasSurface });
    this.rendererState = 'canvas2d';
    this.renderer.resize(this.width, this.height, this.pixelRatio);
    this.requestRepaint();
  }

  private requestRepaint(): void {
    if (this.root !== undefined) {
      this.graph.markDirty(this.root, DirtyFlags.Paint);
    }
  }

  /**
   * A declared font face finished loading (or failed, which changes
   * nothing but is not worth telling apart here). Every width measured
   * so far was measured in the fallback, so the measurer's cache, the
   * renderer's glyphs and the engine's sizes are all dropped, and the
   * whole tree is laid out and painted again in the face that was
   * meant. Text moves at most once per face, as with `font-display:
   * swap`.
   */
  private fontsChanged(): void {
    this.textMeasurer.invalidate?.();
    this.renderer.fontsChanged?.();
    this.engine.invalidateMeasurements();
    if (this.root !== undefined) {
      this.graph.markDirty(this.root, DirtyFlags.SubtreeLayout | DirtyFlags.Paint);
    }
  }

  /**
   * Resizes the surface and schedules a repaint.
   *
   * Zero-sized reports are ignored. A hidden or detached host delivers
   * 0x0, and a zero logical size makes the renderer's cull rectangle
   * empty, which discards every node.
   */
  resize(width: number, height: number, dpr: number = this.pixelRatio): void {
    if (!(width > 0) || !(height > 0)) {
      return;
    }
    this.pixelRatio = dpr;
    this.width = width;
    this.height = height;
    this.renderer.resize(width, height, dpr);
    this.constraints = Constraints.loose(width, height);
    if (this.root === undefined) {
      return;
    }
    this.engine.layout(this.root, this.constraints);
    // Resizing the backing store clears whatever was drawn, and layout
    // marks nothing dirty on its own, so without this the canvas stays
    // blank until some unrelated change happens to schedule a frame.
    this.graph.markDirty(this.root, DirtyFlags.Paint);
    // Drawn here, in the task that cleared the surface, rather than on
    // the next tick: a cleared canvas is committed to the compositor at
    // the end of this task, so a deferred repaint shows one blank frame
    // per resize notification, which reads as flicker while dragging.
    // Before start() there is nothing on screen to protect, and the
    // host has not wired its frame listeners yet.
    if (this.started) {
      this.scheduler.flush(now());
    }
  }

  /**
   * Receives per-frame timings. Used to report metrics across a
   * worker boundary, and by tests asserting frames actually ran.
   */
  onFrame(listener: ((metrics: FrameMetrics) => void) | null): void {
    this.frameListener = listener;
  }

  /**
   * Reports when the shell received the input just routed, so the
   * frame answering it can say how long it waited.
   *
   * Called by the host *after* handing the event to the input
   * controllers, because whether a frame is now pending is the test
   * for whether the input caused any work at all. A host that does not
   * call this leaves `FrameMetrics.inputLatencyMs` null, which is why
   * it is a separate call rather than a parameter on every input
   * method: measurement must not be a condition of routing an event.
   */
  noteInput(at: number | undefined): void {
    this.inputLatency.mark(at, this.scheduler.framePending);
  }

  /**
   * Turns the layout inspector on or off. While on, every frame paints
   * the hovered node's boxes and the measure heatmap over the scene, and
   * the inspect listener receives the hovered node's explanation.
   */
  setInspectorEnabled(enabled: boolean): void {
    if (this.inspector.isEnabled === enabled) {
      return;
    }
    this.inspector.setEnabled(enabled);
    if (enabled) {
      this.inspector.setHovered(this.input.pointer.hoveredNode);
    }
    // Always sent, so a listener learns the toggle even when the
    // report happens to match (null before and after).
    const report = this.hoveredReport();
    this.lastInspection = report?.explanation ?? null;
    this.inspectListener?.(report);
    this.devtoolsListener?.({ kind: 'hover', report });
    if (this.root !== undefined) {
      this.graph.markDirty(this.root, DirtyFlags.Paint);
    }
  }

  /**
   * Receives a report on the hovered node whenever it changes while the
   * inspector is on, and null when nothing is hovered or the inspector
   * is turned off.
   *
   * The report carries `explanation`, which is what this used to send
   * on its own. It is plain data so that the worker configuration can
   * post it to a shell that has no access to the tree.
   */
  onInspect(listener: ((report: UiNodeReport | null) => void) | null): void {
    this.inspectListener = listener;
  }

  /**
   * Receives what a devtools panel asked for and what it is watching:
   * tree snapshots, node reports, and nothing else from here (console
   * entries are added by whoever owns the worker global).
   *
   * One listener, like the others on this class: the host forwards
   * events to its shell, and the shell fans them out.
   */
  onDevtools(listener: ((event: DevtoolsEvent) => void) | null): void {
    this.devtoolsListener = listener;
  }

  /**
   * Answers a devtools panel (`DevtoolsProtocol.ts`).
   *
   * `console` is not handled here: the runtime does not own the
   * worker's global, and in the same-thread configuration there is
   * nothing to forward. The host that owns the global handles it
   * before the request gets this far.
   */
  handleDevtools(request: DevtoolsRequest): void {
    switch (request.kind) {
      case 'tree':
        this.sendTree();
        break;
      case 'watchTree':
        this.watchingTree = request.enabled;
        if (request.enabled) {
          this.sendTree();
        }
        break;
      case 'inspect':
        this.devtoolsListener?.({ kind: 'report', id: request.id, report: this.inspectNodeById(request.id) });
        break;
      case 'select':
        this.selectedId = request.id;
        this.lastSelectedReport = null;
        if (request.id !== null) {
          this.sendSelectedReport();
        }
        break;
      case 'highlight':
        this.setHighlightedNode(request.id);
        break;
      case 'watchFrames':
        this.watchingFrames = request.enabled;
        break;
      case 'inspector':
        this.setInspectorEnabled(request.enabled);
        break;
      case 'setProp':
        this.writeInspectedProperty(request.id, request.name, request.value);
        break;
      case 'marks':
        setPerformanceMarks(request.enabled);
        break;
      case 'console':
        break;
    }
  }

  /**
   * Writes a property from a panel, on a node named by id.
   *
   * Through the same call the builder makes, so the write is an
   * ordinary one: a declared transition animates towards it, the
   * override cascade decides whether a modifier is already writing
   * this property, the equality check drops a write that changes
   * nothing, and the registry says what the property invalidates. A
   * panel that reached into the node's own map instead would produce a
   * value the cascade does not know about and a screen that does not
   * redraw.
   *
   * `null` removes the property rather than writing null, which is how
   * an inherited value is put back; that one goes past the cascade,
   * because there is no value to cascade.
   *
   * The selected node's report is re-sent by the frame this dirties,
   * so nothing is echoed from here.
   */
  private writeInspectedProperty(id: string, name: string, value: unknown): void {
    const node = this.graph.getNode(id);
    if (node === undefined) {
      return;
    }
    const effects = propertyEffects(name);
    if (value === null) {
      this.graph.applyResolvedProperty(node, name, false, undefined, effects);
      return;
    }
    this.graph.updateNodeProperty(node, name, value, effects);
  }

  /**
   * The tree as a panel lists it, from the application's root.
   *
   * The runtime's own layout root and the overlay layer beside the app
   * root are left out: neither is something the application wrote,
   * and the layout root is exactly the node `beneathAtPointer` also
   * hides for being nobody's intent.
   */
  snapshotTree(): UiTreeSnapshot {
    const root = this.debugRoot();
    let count = 0;
    const visit = (node: UiNode): UiTreeNode => {
      count++;
      const children: UiTreeNode[] = [];
      for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        children.push(visit(child));
      }
      const host = this.resolver.hostFor(node.id);
      const text = treeText(node.getProperty('text'));
      // Counted per node and added up by the panel towards the nearest
      // component anchor, because the tree is what knows which
      // component a node belongs to and the snapshot is already being
      // walked.
      const subscriptions = this.graph.subscriptionsForNode(node);
      return {
        id: node.id,
        type: node.type,
        ...(host === undefined ? {} : { component: getComponentMetadata(host.component).tag }),
        ...(text === undefined ? {} : { text }),
        ...(subscriptions === 0 ? {} : { subscriptions }),
        children
      };
    };
    return { root: visit(root), nodes: count, subscriptions: this.graph.subscriptionCount };
  }

  /**
   * Sends a snapshot, and remembers the subscription count that went
   * with it.
   *
   * Every route to a snapshot goes through here, so the count a later
   * frame compares against is the one a panel was last told, whichever
   * request produced it.
   */
  private sendTree(): void {
    const tree = this.snapshotTree();
    this.lastSubscriptions = tree.subscriptions;
    this.devtoolsListener?.({ kind: 'tree', tree });
  }

  /** `inspectNode` for a node named by id, or null when the tree has no such node. */
  inspectNodeById(id: string): UiNodeReport | null {
    const node = this.graph.getNode(id);
    return node === undefined ? null : this.inspectNode(node);
  }

  /**
   * Outlines a node on the canvas for a panel that picked it from the
   * tree, or clears the outline with null. An id the tree does not
   * have clears it too, since there is nothing to point at.
   */
  setHighlightedNode(id: string | null): void {
    const node = id === null ? undefined : this.graph.getNode(id);
    if (this.inspector.setHighlighted(node ?? null) && this.root !== undefined) {
      this.graph.markDirty(this.root, DirtyFlags.Paint);
    }
  }

  /**
   * Receives the cursor the hovered node asks for (`cursor: 'pointer'`
   * on it or an ancestor) whenever it changes, and null when nothing
   * under the pointer sets one. The shell applies it to the canvas —
   * the runtime has no DOM, in a worker least of all.
   */
  onCursor(listener: ((cursor: string | null) => void) | null): void {
    this.cursorListener = listener;
  }

  /** The cursor currently reported to the shell; null is the default arrow. */
  get cursor(): string | null {
    return this.lastCursor;
  }

  /**
   * Receives which way the runtime could scroll under the pointer,
   * whenever that changes.
   *
   * This exists because `preventDefault()` is a synchronous decision
   * and this runtime may be a worker message away from the DOM event
   * that needs it. A shell that swallows every wheel makes the canvas
   * a scroll trap in the page around it; one that swallows none lets
   * a scroll happen twice. Neither is a guess it can make locally, so
   * the answer is pushed ahead of the event and read from a cache
   * when one arrives — at worst one frame stale, which is the same
   * trade a browser makes to scroll off the main thread.
   */
  onScrollability(listener: ((scrollability: UiScrollability, scrollsAnything: boolean) => void) | null): void {
    this.scrollabilityListener = listener;
  }

  /** Which way the pointer's scroll chain can currently move. */
  get scrollability(): UiScrollability {
    return this.lastScrollability;
  }

  /**
   * Receives the focused editable's text, selection and caret box after
   * any frame that changed them, and null when no editable has focus.
   * The shell's editing proxy mirrors it; see `EditingProxy`.
   */
  onEditingState(listener: ((state: EditingState | null) => void) | null): void {
    this.editingListener = listener;
  }

  /** The editing state last reported to the shell. */
  get editingState(): EditingState | null {
    return this.lastEditingState;
  }

  /**
   * Receives what components ask of the shell through `ShellService`:
   * clipboard writes and URLs to open. Without a listener they are
   * dropped.
   */
  onShellRequest(listener: ((request: ShellRequest) => void) | null): void {
    this.shellListener = listener;
  }

  /**
   * Receives what components ask of the shell's audio element through
   * `AudioService`. Without a listener they are dropped, and the app
   * plays nothing, which is what a headless runtime should do.
   */
  onAudioRequest(listener: ((request: AudioRequest) => void) | null): void {
    this.audioListener = listener;
  }

  /** The shell reports its audio element; passed straight through to `AudioService`. */
  applyAudioSample(sample: AudioSample): void {
    this.services.get(AudioService).applySample(sample);
  }

  /** The platform's media controls acted; passed straight through to `AudioService`. */
  applyAudioAction(action: AudioAction): void {
    this.services.get(AudioService).applyAction(action);
  }

  /**
   * Where typed text comes from. A shell with an editing proxy delivers
   * it through `input.editing.beforeInput` and the composition methods,
   * so printable key presses must not be inserted a second time; with
   * `keys` (the default) they are all there is.
   */
  setTextInputSource(source: 'proxy' | 'keys'): void {
    this.input.editing.textFromKeys = source === 'keys';
  }

  /**
   * The page was hidden or shown. A hidden page stops the caret blink,
   * so a background tab with a focused field schedules no frames.
   *
   * The driver is told as well, and it is the half that matters to
   * what the page looks like: a hidden page goes on painting but runs
   * no animation frames, so anything the driver is holding would be
   * drawn frozen at whatever value it had reached. See
   * `AnimationDriver.setHidden` for why an entrance frozen at its
   * first value is a hole in the page rather than a paused animation.
   */
  setVisible(visible: boolean): void {
    this.input.editing.setVisible(visible);
    if (visible === this.visible) {
      return;
    }
    this.visible = visible;
    this.animations.setHidden(!visible);
    if (!visible) {
      return;
    }
    if (!this.started) {
      return;
    }
    // One frame on the way back, whether or not anything is dirty: an
    // animation the driver kept running while hidden is still in it,
    // and `scheduleAnimationTick` only re-arms from inside a frame.
    this.scheduler.wake();
  }

  /**
   * The person has asked for less motion, or stopped asking.
   *
   * `ShellRequest` is outbound only and nothing carried a preference
   * inbound before this, so honouring reduced motion is plumbing that
   * had to be built rather than a setting that had to be read: the
   * shell has the media query, the runtime has the animations, and in
   * a render worker there is a thread boundary between them. It
   * arrives the way `visibility` does, and lands on the driver, which
   * is the one place every animation passes through.
   *
   * Not an environment key. A theme is scoped because different parts
   * of a screen legitimately look different; a motion preference
   * belongs to the person, not to a region of the tree, and an
   * animation drives a cell, which has no node to resolve a scoped
   * value against.
   */
  setReducedMotion(reduced: boolean): void {
    this.services.get(AnimationService).applyReducedMotion(reduced);
  }

  /**
   * The window's address, as the shell reports it: once at start-up,
   * and again for every back, forward or typed address.
   *
   * Guards run on it — a url the person typed is the navigation a
   * guard exists for — so a refused url is corrected back through the
   * history sink rather than shown.
   */
  setUrl(url: string): void {
    this.services.get(RouterService).applyUrl(url);
  }

  /**
   * The appearance the shell reports: once at start-up, and again
   * whenever the platform's answer or the host's override changes.
   *
   * Passed straight through to `ShellService`, where an application
   * reads it. Nothing here acts on it — unlike `reducedMotion`, which
   * the animation driver consumes, no part of the framework knows what
   * dark should look like.
   */
  setColorScheme(scheme: ColorScheme): void {
    this.services.get(ShellService).applyColorScheme(scheme);
  }

  /**
   * The platform's own insets, as the shell reports them: the safe area
   * under a notch or a home indicator and the strip a soft keyboard
   * covers, once at start-up and again whenever they change.
   *
   * Two things happen to them, and both are on this side of the
   * boundary because both are decisions. They reach `ShellService`,
   * where an application can read the raw numbers as `colorScheme` is
   * read. And they are published into the inset registry the app root's
   * environment carries, as one contributor beside the application's
   * own floating bars, so `insetPadding` on a screen keeps clear of the
   * keyboard without the application writing a line. The registry
   * composes by maximum, so a bar drawn across the home indicator and
   * the home indicator under it cost the content one strip, not two;
   * see `UiInsetRegistry` for the reasoning.
   *
   * The registry is the one at the app root rather than one this
   * runtime owns because an application provides its own with the
   * `insets` prop and every screen reads that one. Without a provider
   * the key's default registry is used, which is what every reader
   * under such a root resolves too. A registry provided below the root
   * is not found; the application feeds `ShellService.viewportInsets`
   * into it, which is why that cell exists.
   */
  setViewportInsets(insets: UiInsets): void {
    if (insetsEqual(this.viewportInsetValue, insets)) {
      return;
    }
    this.viewportInsetValue = insets;
    this.services.get(ShellService).applyViewportInsets(insets);
    this.publishViewportInsets();
  }

  /**
   * Writes the platform's insets into whichever registry the app root
   * resolves right now, moving the contribution when that changes.
   *
   * Called when the insets change, when the root is built or reloaded,
   * and when the root's environment is rebuilt, because the registry
   * is an environment value and a reload may provide a different one.
   * The old registry gets its room back before the new one is written,
   * exactly as a retracted bar would.
   */
  private publishViewportInsets(): void {
    const appRoot = this.appRoot;
    const source =
      appRoot === undefined
        ? null
        : (appRoot.environment ?? this.graph.buildNodeEnvironment(appRoot)).get(UiEnvironmentKeys.insets);
    const registry = source instanceof UiInsetRegistry ? source : null;
    if (registry !== this.viewportInsetRegistry) {
      this.viewportInsetWrite?.();
      this.viewportInsetWrite = null;
      this.viewportInsetRegistry = registry;
    }
    if (registry === null) {
      // A source that is not a registry is somebody's read-only view of
      // one, and there is nothing to publish into; `publishInset` makes
      // the same call.
      return;
    }
    if (this.viewportInsetWrite === null) {
      this.viewportInsetWrite = registry.publish(this.viewportInsetValue);
    } else {
      this.viewportInsetWrite(this.viewportInsetValue);
    }
  }

  /**
   * Reports what became of a popup a component asked for, settling the
   * promise `ShellService.openPopup` returned.
   *
   * The one inbound message that answers an outbound one, so unlike the
   * preference setters beside it this carries the id it is replying to.
   */
  settlePopup(id: number, opened: boolean): void {
    this.services.get(ShellService).settlePopup(id, opened);
  }

  /**
   * Reports what the shell found in `localStorage`, settling the
   * promise `ShellService.requestStorage` returned.
   *
   * The second inbound message that answers an outbound one, and it
   * carries its request's id for the same reason the first does.
   */
  settleStorage(id: number, result: ShellStorageResult): void {
    this.services.get(ShellService).settleStorage(id, result);
  }

  /** Whether the runtime is currently honouring a reduced-motion preference. */
  get reducedMotion(): boolean {
    return this.animations.isReducedMotion;
  }

  /** The appearance the shell last reported; `light` until it says otherwise. */
  get colorScheme(): ColorScheme {
    return this.services.get(ShellService).currentColorScheme;
  }

  /** The platform's insets the shell last reported; zeroes until it says otherwise. */
  get viewportInsets(): UiInsets {
    return this.viewportInsetValue;
  }

  /** Which shared-element names are currently held, for specs and devtools. */
  get sharedElementNames(): readonly string[] {
    return this.sharedElements.names;
  }

  /** `engine.explain` for any node, for tests and devtools. */
  explain(node: UiNode): LayoutExplanation {
    return this.engine.explain(node);
  }

  /**
   * Everything the inspector shows about one node, as plain data
   * (`ROADMAP.md` F7).
   *
   * Built here rather than in `@gesso/devtools` because every source
   * it reads is private to the render thread and most of it cannot
   * cross a thread boundary at all: the graph's bindings, the
   * builder's modifier sets, the resolver's component hosts. The
   * report is strings, so it can.
   */
  inspectNode(node: UiNode): UiNodeReport {
    const box = this.engine.visibleBox(node);
    return {
      id: node.id,
      type: node.type,
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      owners: this.ownersOf(node),
      props: this.propsOf(node),
      environment: this.environmentOf(node),
      modifiers: this.builder.modifiersFor(node)?.names ?? [],
      listens: this.dispatcher.listenerTypes(node),
      beneath: this.beneathAtPointer(node),
      semantics: this.semanticsOf(node),
      explanation: formatExplanation(this.engine.explain(node))
    };
  }

  /**
   * The nodes under the pointer that this one is painted over, topmost
   * first, when the pointer is over this node at all. This is how the
   * inspector explains a dead click: the hovered node took the press,
   * and the button the person meant is listed here beneath it.
   */
  private beneathAtPointer(node: UiNode): UiBeneathReport[] {
    const at = this.input.pointer.position;
    if (at === null) {
      return [];
    }
    const stack = this.hitTester.hitStack(at.x, at.y);
    const index = stack.indexOf(node);
    if (index === -1) {
      return [];
    }
    // The layout root is the runtime's own wrapper, under everything
    // and never what a person meant to press.
    return stack
      .slice(index + 1)
      .filter(under => under !== this.root)
      .map(under => {
        const owners = this.ownersOf(under);
        return {
          id: under.id,
          type: under.type,
          ...(owners.length === 0 ? {} : { owner: owners[0]!.name }),
          listens: this.dispatcher.listenerTypes(under)
        };
      });
  }

  /**
   * A node as a path a person reads, for an error message: `App >
   * TrackScreen > ActionRow > Button "Like"`.
   *
   * The owner chain and the accessible name are both already computed
   * for the inspector; the only new thing here is that an error is
   * worth spending them on. See `formatNodePath`.
   */
  private pathOf(node: UiNode): string {
    const label = this.semanticsOf(node)?.label;
    return formatNodePath(this.ownersOf(node), {
      type: node.type,
      id: node.id,
      ...(label === undefined ? {} : { label })
    });
  }

  /** The components that rendered a node, nearest first. */
  private ownersOf(node: UiNode): UiOwnerReport[] {
    const owners: UiOwnerReport[] = [];
    for (let current: UiNode | null = node; current !== null; current = current.parent) {
      // Asking the resolver rather than matching the id against
      // `:component:`: it holds a host for exactly the anchors that are
      // components, and a key with a colon in it would defeat the
      // string test.
      const host = this.resolver.hostFor(current.id);
      if (host !== undefined) {
        owners.push({ name: getComponentMetadata(host.component).tag, anchorId: current.id });
      }
    }
    return owners;
  }

  private propsOf(node: UiNode): UiPropReport[] {
    const sources = describeOverrides(node);
    const out: UiPropReport[] = [];
    for (const [name, value] of node.properties) {
      const source = sources?.[name];
      if (source !== undefined) {
        out.push({ name, value: printPropValue(value), origin: 'modifier', source });
        continue;
      }
      const binding = this.graph.getBindingForProperty(node, name);
      if (binding !== undefined) {
        // Which stream, what it last said, and how long ago. A yes to
        // "is this bound" was `decisions/0045`'s answer and is not
        // enough to debug with: a stream that stopped and one that has
        // not emitted since the screen was built look the same.
        const stream = describeStream(binding, timeOrigin());
        out.push({
          name,
          value: printPropValue(value),
          origin: 'binding',
          source: `bound to ${stream.source}`,
          stream
        });
        continue;
      }
      out.push({ name, value: printPropValue(value), origin: 'element' });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  /**
   * Every environment value in force at the node, and whether the node
   * is the one providing it.
   *
   * Walks the chain rather than reading the node's own map, because
   * the question the inspector answers is "what does this node see",
   * and most of what it sees was provided by an ancestor.
   */
  private environmentOf(node: UiNode): UiEnvironmentReport[] {
    const environment = node.environment;
    if (environment === null) {
      return [];
    }
    // A node that provides nothing shares its parent's environment
    // object rather than getting one of its own, so "does my
    // environment provide this" is true of every node under a
    // provider. The question the inspector is asking is narrower:
    // whether this node is the one that provided it.
    const own = environment === (node.parent?.environment ?? null) ? null : environment;
    const seen = new Set<string>();
    const out: UiEnvironmentReport[] = [];
    for (let current: UiEnvironment | null = environment; current !== null; current = current.parent) {
      for (const name of current.providedKeys()) {
        if (seen.has(name)) {
          continue;
        }
        seen.add(name);
        out.push({
          key: name,
          value: printPropValue(current.getOwn(name)),
          provided: current === own && own.providesOwn(name)
        });
      }
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  }

  private semanticsOf(node: UiNode): UiSemanticsReport | undefined {
    const record = this.semanticsTree().get(node.id);
    if (record === undefined) {
      return undefined;
    }
    return {
      role: record.role,
      label: record.label,
      value: record.valueText ?? (record.valueNow === undefined ? undefined : String(record.valueNow)),
      states: record.states
    };
  }

  /**
   * The UiNode the app's root definition produced.
   *
   * For tests and devtools that inspect the retained graph without
   * reaching into private state. It is the first child of the layout
   * root, whose only other child is the overlay layer.
   */
  debugRoot(): UiNode {
    if (this.appRoot === undefined) {
      throw new Error('App root has not been built.');
    }
    return this.appRoot;
  }

  /** The laid-out box of a node, for tests and devtools. */
  debugLayoutBox(node: UiNode): { x: number; y: number; width: number; height: number } {
    return this.engine.worldBox(node);
  }

  /**
   * The node layout, hit testing and painting start from: a stack that
   * stretches the app root over the viewport with the overlay layer on
   * top of it.
   */
  layoutRoot(): UiNode {
    if (this.root === undefined) {
      throw new Error('App root has not been built.');
    }
    return this.root;
  }

  /**
   * Scrolls every scroll container above `node` just enough that the
   * node is inside its viewport, `padding` pixels from the nearest edge.
   * Nothing moves when it is already visible.
   */
  scrollIntoView(node: UiNode, padding = 8): void {
    for (const adjustment of this.engine.revealAdjustments(node, padding)) {
      // A reveal knows exactly where the container has to be, and a
      // spring still running would overwrite that on its next tick.
      this.smoothScroller.stop(adjustment.container);
      adjustment.container.setProperty('scrollX', adjustment.scrollX);
      adjustment.container.setProperty('scrollY', adjustment.scrollY);
      this.graph.markDirty(adjustment.container, DirtyFlags.Transform);
    }
  }

  /**
   * Rebuilds the application's tree from a new root definition,
   * keeping the runtime and everything that is not the tree
   * (`ROADMAP.md` F7's HMR item).
   *
   * **Why a rebuild is the only story.** A Gesso component's `render`
   * runs once; there is no re-render pass to push new code through, so
   * replacing a module cannot be made to update a mounted component in
   * place. What can be done is to throw the tree away and build a new
   * one, and that is only useful if the things worth keeping do not
   * live in the tree. In this framework they do not: application state
   * is in a data worker behind a channel, and a replica's cells are
   * held by the runtime rather than by any component, so a freshly
   * built tree binds to values that are already there.
   *
   * That is why the roadmap's "snapshot projections as patches, replay
   * after mount" is not here. It describes rebuilding a replica from
   * scratch, and nothing rebuilds one: the replica, the services, the
   * renderer, the canvas, the focus manager and the scheduler all
   * survive, because only the tree is replaced.
   *
   * **What is kept and what is lost.** The layout root node is the
   * same object, so input routing, the focus scope stack and every
   * listener registered on the root stay valid. Below it, the builder
   * reconciles rather than recreating, so a component whose class is
   * the same object as before keeps its host and its `internalState`;
   * one whose module was replaced is a different class, and its host
   * is disposed and mounted again. Scroll offsets on containers that
   * survive are kept, because the node is kept. Component state in a
   * replaced module is lost, which is the honest cost and the reason
   * this is a development tool.
   *
   * **Services from the replaced module have to be handed over.** A
   * registry is keyed by the class object, so a service defined beside
   * the root in a module that was replaced is a new class that the
   * registry has never seen, even though the old one is still in it.
   * Pass the replacements as `services` and the registry adopts them,
   * keeping their instances and therefore their state. One that is
   * genuinely new is registered instead.
   */
  reload(rootDefinition: FrameworkChild, services: readonly (new () => object)[] = []): void {
    if (this.root === undefined) {
      throw new Error('App root has not been built.');
    }
    // Before the tree is rebuilt, because the components in it inject
    // these on the way up and would otherwise ask for a class the
    // registry has never seen.
    for (const ServiceClass of services) {
      if (!this.services.adopt(ServiceClass)) {
        this.services.register(ServiceClass);
      }
    }
    // The hovered node may be about to be removed, and the inspector
    // would go on explaining it until the pointer next moved. The
    // highlighted one is about to be removed for certain.
    this.inspector.setHovered(null);
    this.inspector.setHighlighted(null);
    // Read before the rebuild and applied after the frame that lays
    // the new tree out, because that is the frame `autoFocus` fires
    // on and this has to be the last word.
    this.focusAfterReload = this.focusManager.focusedNode?.id ?? null;
    this.restoringFocus = true;
    this.buildRoot(rootDefinition);
    this.graph.markDirty(this.root, DirtyFlags.Children | DirtyFlags.SubtreeLayout | DirtyFlags.Paint);
  }

  /**
   * Puts the caret back where it was before a reload.
   *
   * A node id is positional and the builder reconciles, so the field
   * that had focus keeps its id across a replacement of the module
   * that rendered it, and the same id in the new tree is the same
   * place on the screen. When it is not there any more — the edit
   * removed it — the focus is cleared rather than left wherever the
   * rebuild happened to put it.
   */
  private restoreFocusAfterReload(): void {
    const id = this.focusAfterReload;
    this.focusAfterReload = null;
    const node = id === null ? undefined : this.graph.getNode(id);
    if (node === undefined || !this.focusManager.focus(node)) {
      this.focusManager.blur();
    }
  }

  dispose(): void {
    if (this.scrollbarTimer !== null) {
      clearTimeout(this.scrollbarTimer);
      this.scrollbarTimer = null;
    }
    // The room the platform's insets took is given back: the default
    // registry is shared, and a disposed runtime must not go on
    // reporting a keyboard into it.
    this.detachViewportInsetEnvironment?.();
    this.detachViewportInsetEnvironment = null;
    this.viewportInsetWrite?.();
    this.viewportInsetWrite = null;
    this.viewportInsetRegistry = null;
    if (this.caretTimer !== null) {
      clearTimeout(this.caretTimer);
      this.caretTimer = null;
    }
    this.editingListener = null;
    this.shellListener = null;
    this.semanticsListener = null;
    if (this.inspectorTimer !== null) {
      clearTimeout(this.inspectorTimer);
      this.inspectorTimer = null;
    }
    if (this.animationTimer !== null) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    this.inspectListener = null;
    this.devtoolsListener = null;
    this.cursorListener = null;
    this.scrollabilityListener = null;
    this.rendererErrorListener = null;
    this.scheduler.stop();
    // An animation holds its cell, and a cell holds whatever the
    // component that made it captured. A disposed runtime must not.
    this.animations.stopAll();
    this.sharedElements.clear();
    this.animations.setWakeListener(null);
    this.services.get(AnimationService).setDriver(null);
    this.services.get(AudioService).setAnimations(null);
    this.services.get(FindService).setController(null);
    this.services.get(FocusService).setManager(null);
    this.services.get(RouterService).setHistory(null);
    // Decoded bitmaps hold pixels; garbage collection is not prompt
    // about them, so they are closed rather than dropped.
    this.services.get(MediaService).dispose();
    this.services.get(FontService).dispose();
    this.graph.setEnvironmentChangedListener(null);
    this.graph.setDirtyListener(null);
    this.graph.setNodeRemovedListener(null);
    this.frameListener = null;
    // Its listeners are on the root node, which the dispatcher holds by
    // reference; a disposed runtime must not keep either alive.
    this.input.touchScroll.dispose();
    this.resolver.dispose();
    this.renderer.dispose();
  }

  /**
   * Resolves the root definition down to a plain element and builds it.
   *
   * The root is the one component slot the builder cannot anchor for
   * us: anchors are transparent Fragments, and a Fragment is never a
   * valid layout root — it contributes no box, so the layout engine
   * would have nothing to size the tree against. The runtime therefore
   * mounts the root host itself and hands the builder real geometry.
   *
   * Root hosts are still mounted through the resolver, so their
   * onMount() fires from the build pass below, once their nodes exist.
   */
  private buildRoot(rootDefinition: FrameworkChild): void {
    const appElement = this.resolveRootElement(rootDefinition, 0);
    // The app root stretches over the viewport exactly as it did when
    // it was the layout root; the overlay layer floats above it.
    this.root = this.builder.build(
      Stack({ x: 'stretch', y: 'stretch', position: 'relative' }, appElement, createComponent(OverlayLayer))
    );
    const appRoot = this.root.firstChild;
    if (appRoot === null) {
      throw new Error('The app root produced no node.');
    }
    this.appRoot = appRoot;
    this.graph.propagateEnvironment(this.root);
    // The registry the platform's insets go into is an environment
    // value on this node, so a new root, or a root whose environment is
    // rebuilt, may resolve a different one.
    this.detachViewportInsetEnvironment?.();
    this.detachViewportInsetEnvironment = this.environmentNotifier.add(appRoot, () => this.publishViewportInsets());
    this.publishViewportInsets();
  }

  private resolveRootElement(definition: FrameworkChild, depth: number): UiElement {
    if (isObservable(definition)) {
      throw new Error('Root definition cannot be an Observable. Wrap it in a component or static element.');
    }
    if (isComponentLikeElement(definition)) {
      if (depth > MAX_ROOT_COMPONENT_DEPTH) {
        throw new Error(
          `Root component chain exceeded ${MAX_ROOT_COMPONENT_DEPTH} levels without producing an element.`
        );
      }
      const output = this.resolver.resolve(definition, `app:component:${depth}`);
      return this.resolveRootElement(output as FrameworkChild, depth + 1);
    }
    return definition;
  }

  /**
   * Builds the input stack over the freshly built tree.
   *
   * Handlers are registered on the dispatcher by the builder as it
   * reconciles `on*` props; this wires the other half — hit-testing,
   * pointer/wheel/keyboard routing, and focus — so those handlers
   * actually receive events.
   */
  private createInput(): RuntimeInput {
    const root = this.layoutRoot();
    const hitTester = new UiHitTester(this.engine, root);
    this.hitTester = hitTester;
    const focus = this.focusManager;
    focus.setRoot(root);
    const scrollSink = this.createScrollSink();
    // Editing is a default behaviour of the pointer and keyboard
    // controllers for EditableText targets; the shell's text input
    // (beforeinput, composition, paste) reaches the controller directly.
    const editing = new UiEditingController(
      {
        recordFor: node => this.engine.recordFor(node),
        visibleBox: node => this.engine.visibleBox(node),
        toLocal: (node, x, y) => hitTester.toLocal(node, x, y),
        measurer: this.textMeasurer,
        markDirty: (node, flags) => this.graph.markDirty(node, flags),
        reveal: (node, box) => this.revealBox(node, box),
        now
      },
      this.dispatcher,
      focus
    );
    // Text that is not an editable has no model of its own, so its
    // selection is the controller's; it reaches the clipboard through
    // the same ShellService request a component would use.
    const selection = new UiSelectionController(
      {
        recordFor: node => this.engine.recordFor(node),
        visibleBox: node => this.engine.visibleBox(node),
        measurer: this.textMeasurer,
        markDirty: (node, flags) => this.graph.markDirty(node, flags),
        root: () => this.layoutRoot(),
        copy: text => this.services.get(ShellService).copyText(text),
        blurEditable: () => {
          if (editing.focused !== null) {
            focus.blur();
          }
        },
        now
      },
      hitTester
    );
    // Focus moving into a field ends a canvas selection, so only one of
    // the two is ever lit.
    focus.onFocusChange(node => {
      if (node !== null) {
        selection.clear();
      }
    });
    this.selectionController = selection;
    // The browser's find bar cannot see a canvas, so the app gets its
    // own; the active match is a selection, which is why this is built
    // on top of the selection controller rather than beside it.
    const find = new UiFindController(
      {
        recordFor: node => this.engine.recordFor(node),
        measurer: this.textMeasurer,
        markDirty: (node, flags) => this.graph.markDirty(node, flags),
        reveal: (node, box) => this.revealBox(node, box),
        root: () => this.layoutRoot(),
        focus: node => {
          focus.focus(node);
        }
      },
      selection
    );
    this.findController = find;
    this.services.get(FindService).setController(find);
    return {
      dispatcher: this.dispatcher,
      focus,
      editing,
      selection,
      find,
      pointer: new UiPointerController(hitTester, this.dispatcher, {
        // Without this the controller has no recognizer to feed, and
        // `onPan*` / `onDrag*` never fire anywhere in a real app: the
        // events exist, components declare handlers for them, and
        // nothing ever synthesizes one. A `SplitPane` could be moved
        // from the keyboard and not with the pointer.
        gestures: new UiGestureRecognizer(this.dispatcher),
        onPress: node => {
          if (node !== null) {
            focus.focusOnPress(node);
          } else {
            // Nothing under the press, but it was a press: the person is
            // on the pointer, and a ring elsewhere should go.
            focus.noteInput('pointer');
          }
        },
        scrollSink,
        onHoverChange: node => this.handleHoverChange(node),
        editing,
        selection
      }),
      wheel: new UiWheelController(hitTester, this.dispatcher, scrollSink, () => root),
      // Unfocused keys land on the application's root, not the layout
      // root that wraps it: the wrapper is the runtime's, and an app
      // listening for Escape on its own top element would otherwise
      // never hear a key pressed with nothing focused. A getter, because
      // `reload` rebuilds the tree under a controller that lives on.
      keyboard: new UiKeyboardController(this.dispatcher, focus, () => this.appRoot ?? this.layoutRoot(), {
        editing,
        selection,
        find,
        // Enter on a focused button clicks its centre, as an assistive
        // technology's press does.
        activation: {
          clickAt: node => {
            const box = this.engine.visibleBox(node);
            return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          }
        }
      }),
      // Listens at the root, so a pan reaches it only when nothing
      // between the pressed node and here claimed the gesture. That is
      // the opt-out a `Slider` or a `SplitPane` already relies on.
      touchScroll: new UiTouchScroller(this.dispatcher, root, scrollSink)
    };
  }

  /**
   * Receives what an accessibility mirror needs after any frame that
   * changed it: the semantics patches, the boxes that moved, and the
   * focused node when focus moved.
   *
   * The consumer is `SemanticsMirror` — an off-screen DOM tree over the
   * canvas that the platform's assistive technology reads (roadmap
   * F6b). Attaching one is what turns the geometry sweep on; without a
   * listener the runtime keeps the tree and diffs it, and looks at no
   * boxes at all.
   */
  onSemantics(listener: ((update: UiSemanticsUpdate) => void) | null): void {
    this.semanticsListener = listener;
    this.semanticsBoxes.clear();
    if (listener !== null) {
      // Frames that ran while nothing was listening left it stale, and
      // a mirror must not be handed a tree from before them.
      this.semanticsTree();
    }
    if (listener === null || this.semantics.size === 0) {
      // Nothing to catch up on: a listener attached before the first
      // frame hears about the tree when the frame builds it.
      return;
    }
    // A listener attached after the first frame needs the tree that
    // already exists, as one patch per record, with the geometry and
    // the focus that go with it.
    listener({
      patches: [...this.semantics.values()].map(node => ({ op: 'add', node }) as const),
      boxes: this.collectSemanticsBoxes(),
      focused: this.focusManager.focusedNode?.id ?? null
    });
  }

  /**
   * The semantics tree as of the last frame that changed it.
   *
   * Rebuilt here when no mirror was listening and a frame marked it
   * stale, so a test or a devtools panel sees the current tree without
   * every frame having paid to keep one nothing was reading.
   */
  semanticsTree(): UiSemanticsMap {
    if (this.semanticsStale) {
      this.semantics = buildSemanticsTree(this.layoutRoot());
      this.semanticsStale = false;
    }
    return this.semantics;
  }

  /**
   * Something an assistive technology did to a mirrored element,
   * turned back into ordinary input.
   *
   * Deliberately routed through the same controllers a pointer and a
   * keyboard use rather than into components directly: an AT press on
   * a `Checkbox` has to reach the `onClick` the mouse reaches, or the
   * two paths drift and only one of them is tested. `focus` goes
   * through the focus manager, which means an AT cannot escape an open
   * focus trap any more than Tab can.
   */
  applySemanticsAction(action: UiSemanticsAction): void {
    if (this.applyTextRunAction(action)) {
      return;
    }
    const node = this.graph.getNode(action.id);
    if (node === undefined || !this.semantics.has(action.id)) {
      // A stale id: the mirror acted on a node this frame removed.
      return;
    }
    if (action.action === 'focus') {
      this.focusManager.focus(node);
      return;
    }
    if (action.action === 'setValue') {
      // The editing controller edits whatever holds focus, so focus is
      // part of the action rather than a precondition the caller has
      // to arrange.
      this.focusManager.focus(node);
      this.input.editing.replaceText(action.value ?? '');
      return;
    }
    this.focusManager.focus(node);
    const box = this.engine.visibleBox(node);
    this.dispatcher.dispatch(
      new UiPointerEvent(UiEventType.Click, box.x + box.width / 2, box.y + box.height / 2, 1),
      node
    );
  }

  /**
   * An action on an inline link, which is a run and not a node.
   *
   * A run borrows its paragraph's id and adds its position, so the
   * lookup above would miss it and the action would be dropped as
   * stale. Activation calls the run's own `onClick`, which is the same
   * call a press makes in `UiSelectionController`, so a link opened
   * from the keyboard and a link opened with the pointer go through one
   * path rather than two.
   *
   * `focus` and `setValue` are not answered. A run cannot hold focus,
   * because focus is a node in `UiFocusManager`, and a run has no value
   * to set. Returning true for them anyway is deliberate: the id did
   * name a run, so falling through to the node lookup would only find
   * nothing and read as a stale id.
   */
  private applyTextRunAction(action: UiSemanticsAction): boolean {
    const run = textRunOfRecordId(action.id);
    if (run === null) {
      return false;
    }
    if (action.action === 'focus' || action.action === 'setValue') {
      return true;
    }
    const node = this.graph.getNode(run.nodeId);
    if (node !== undefined && this.semantics.has(action.id)) {
      linkOf(node, run.index)?.onClick?.();
    }
    return true;
  }

  /**
   * Rebuilds the semantics tree, and gathers what moved.
   *
   * The two halves have different triggers — meaning changes when a
   * semantics property or the shape of the tree does, position changes
   * whenever anything is laid out or scrolled — so each is asked for
   * separately and an update is sent only if one of them has something
   * to say. `UiSemanticsUpdate` explains why they travel together
   * anyway.
   */
  private updateSemantics(rebuild: boolean, moved: boolean): void {
    let patches: readonly UiSemanticsPatch[] = EMPTY_PATCHES;
    const listener = this.semanticsListener;
    if (rebuild) {
      if (listener === null) {
        // Nobody is reading it. Building and diffing the tree would be
        // a walk of every node for no one, on frames that are now far
        // more common than they were: `text` marks semantics dirty, so
        // any bound label does this. The work moves to whoever asks.
        this.semanticsStale = true;
      } else {
        const next = buildSemanticsTree(this.layoutRoot());
        patches = diffSemantics(this.semantics, next);
        this.semantics = next;
        this.semanticsStale = false;
      }
    }
    if (listener === null) {
      return;
    }
    const boxes = moved || patches.length > 0 ? this.collectSemanticsBoxes() : EMPTY_BOXES;
    const focused = this.focusManager.focusedNode?.id ?? null;
    const focusMoved = focused !== this.lastFocusedId;
    this.lastFocusedId = focused;
    if (patches.length === 0 && boxes.length === 0 && !focusMoved) {
      return;
    }
    listener(focusMoved ? { patches, boxes, focused } : { patches, boxes });
  }

  /**
   * The mirrored nodes whose box differs from the one last sent.
   *
   * Bounded by the semantics tree, which is bounded by the *mounted*
   * nodes — so a 100k-row list costs the fifteen rows it has mounted,
   * the same bound `decisions/0021` gives for the tree walk itself.
   * Ids that have left the tree are dropped here rather than tracked,
   * since a removal patch has already told the mirror about them.
   */
  private collectSemanticsBoxes(): UiSemanticsBox[] {
    const changed: UiSemanticsBox[] = [];
    for (const id of this.semantics.keys()) {
      const node = this.graph.getNode(id);
      if (node === undefined || this.engine.recordFor(node) === undefined) {
        continue;
      }
      const box = this.engine.visibleBox(node);
      const last = this.semanticsBoxes.get(id);
      if (last !== undefined && boxesEqual(last, box)) {
        continue;
      }
      this.semanticsBoxes.set(id, box);
      changed.push({ id, box });
    }
    if (this.semanticsBoxes.size > this.semantics.size) {
      for (const id of this.semanticsBoxes.keys()) {
        if (!this.semantics.has(id)) {
          this.semanticsBoxes.delete(id);
        }
      }
    }
    return changed;
  }

  /** Scrolls every scroll container above `node` so a node-local box is visible. */
  private revealBox(node: UiNode, box: { x: number; y: number; width: number; height: number }): void {
    for (const adjustment of this.engine.revealAdjustments(node, 0, box)) {
      // On every keystroke, so it must land at once: a spring here
      // would leave the caret trailing the text being typed.
      this.smoothScroller.stop(adjustment.container);
      adjustment.container.setProperty('scrollX', adjustment.scrollX);
      adjustment.container.setProperty('scrollY', adjustment.scrollY);
      this.graph.markDirty(adjustment.container, DirtyFlags.Transform);
    }
  }

  /**
   * With the inspector on, a hover change repaints (the overlay follows
   * the pointer) and re-explains the hovered node for the listener.
   */
  private handleHoverChange(node: UiNode | null): void {
    this.sendCursor();
    this.sendScrollability();
    if (!this.inspector.isEnabled || !this.inspector.setHovered(node)) {
      return;
    }
    this.sendInspection();
    if (this.root !== undefined) {
      this.graph.markDirty(this.root, DirtyFlags.Paint);
    }
  }

  /**
   * Scrolling backed directly by layout records and node properties.
   *
   * The layout engine clamps scrollX/scrollY against content size on
   * every pass, so writing the raw offset here is enough.
   */
  private createScrollSink(): ScrollSink {
    return {
      containerState: (node): ScrollContainerState | undefined => {
        const record = this.engine.recordFor(node);
        if (record === undefined) {
          return undefined;
        }
        return {
          scrollX: record.scrollX,
          scrollY: record.scrollY,
          maxScrollX: Math.max(0, record.contentWidth - record.width),
          maxScrollY: Math.max(0, record.contentHeight - record.height),
          horizontal: node.getProperty('direction') === 'row' || node.type === UiNodeType.Row,
          viewportWidth: record.width,
          viewportHeight: record.height
        };
      },
      scrollBy: (node, dx, dy, behavior): void => {
        const record = this.engine.recordFor(node);
        if (record === undefined) {
          return;
        }
        if (behavior === 'smooth') {
          // The smooth path adds to where the container is *going*, so
          // it needs the effective offset only as a starting point.
          if (dx !== 0) {
            this.smoothScroller.scrollBy(node, 'scrollX', dx, record.scrollX);
          }
          if (dy !== 0) {
            this.smoothScroller.scrollBy(node, 'scrollY', dy, record.scrollY);
          }
          return;
        }
        // An instant scroll wins over one in flight rather than racing
        // it: a thumb drag reads the offset back on every pointer move
        // and would chase a moving value.
        this.smoothScroller.stop(node);
        if (dx !== 0) {
          node.setProperty('scrollX', record.scrollX + dx);
        }
        if (dy !== 0) {
          node.setProperty('scrollY', record.scrollY + dy);
        }
        this.graph.markDirty(node, DirtyFlags.Transform);
      },
      scrollContainers: () => this.engine.scrollContainers(),
      revealScrollbars: (node): void => {
        this.engine.revealScrollbars(node);
        this.graph.markDirty(node, DirtyFlags.Paint);
      },
      scrollbar: (node, axis) => {
        const record = this.engine.recordFor(node);
        return record === undefined ? null : scrollbarThumb(record, axis);
      }
    };
  }

  /**
   * Work that must happen before the frame's dirty set is snapshotted.
   *
   * Environment propagation belongs here and nowhere else: rebuilding a
   * node's environment marks its descendants dirty, and those nodes
   * have to be in the frame that is about to be collected. Run after
   * collection it saw an already-drained set and silently did nothing,
   * so a theme change never reached descendants at all.
   */
  /**
   * The phases that run before the frame's dirty set is snapshotted.
   *
   * Both produce dirt of their own — applying a patch updates bound
   * properties, rebuilding an environment marks descendants — and those
   * nodes have to belong to the frame about to be collected. Run after
   * collection, the environment phase saw an already-drained set and
   * silently did nothing, so a theme change never reached descendants.
   */
  private runPreCollectPhases(time: number): void {
    this.phaseTimings = emptyPhaseTimings();

    // Animation first: every phase after this one reads values a tick
    // may have just written. `hasWork` is a set's size, so an app with
    // nothing running reports 0 without so much as reading the clock —
    // and, because `scheduleAnimationTick` arms nothing when the
    // driver is empty, an idle app runs no frames for this to be
    // reported on at all.
    this.phaseTimings.ticks = this.timePhase(
      () => this.visible && this.animations.isRunning,
      () => this.animations.advance(time)
    );
    // Asked after the tick, not before: an animation that finished
    // just now must not arm a frame nothing will use, and one that
    // started during it must.
    this.scheduleAnimationTick(time);

    this.phaseTimings.patches = this.timePhase(
      () => this.replicas.some(replica => replica.hasPendingPatches),
      () => {
        for (const replica of this.replicas) {
          replica.flush();
        }
      }
    );

    this.phaseTimings.environment = this.timePhase(
      () => this.graph.hasEnvironmentDirty(),
      () => this.graph.processEnvironmentDirty()
    );

    // Lazy lists decide which rows to mount from the scroll offset the
    // frame is about to lay out with, so rows a scroll reveals are built,
    // measured and painted on that same frame.
    this.phaseTimings.virtualize = this.timePhase(
      () => this.hasVirtualWindows(),
      () => this.updateVirtualWindows()
    );
  }

  private hasVirtualWindows(): boolean {
    for (const node of this.engine.scrollContainers()) {
      if (node.properties.get(VIRTUAL_WINDOW_PROP) instanceof UiVirtualWindow) {
        return true;
      }
    }
    return false;
  }

  /**
   * Advances every lazy list's window: reports the container's scroll
   * offset and viewport, and the measured extent of each mounted item,
   * then applies any scroll adjustment the window asks for to keep its
   * first item anchored while estimates above it are corrected.
   */
  private updateVirtualWindows(): void {
    for (const node of this.engine.scrollContainers()) {
      const window = node.properties.get(VIRTUAL_WINDOW_PROP);
      if (!(window instanceof UiVirtualWindow)) {
        continue;
      }
      const rec = this.engine.recordFor(node);
      if (rec === undefined) {
        continue;
      }
      const column = window.axis === 'column';
      // A wheel may have written a newer offset than the record holds.
      const scrollProp = node.properties.get(column ? 'scrollY' : 'scrollX');
      const scroll = typeof scrollProp === 'number' ? scrollProp : column ? rec.scrollY : rec.scrollX;
      const measures: VirtualItemMeasure[] = [];
      const lead = this.collectVirtualMeasures(node, column, measures);
      const result = window.update({ scroll, extent: column ? rec.height : rec.width, lead }, measures);
      if (result.scrollAdjust !== 0) {
        const axis = column ? 'scrollY' : 'scrollX';
        node.setProperty(axis, scroll + result.scrollAdjust);
        this.graph.markDirty(node, DirtyFlags.Transform);
        // This is a coordinate correction, not a scroll: the content
        // above moved, so the viewport moves with it to keep the same
        // row under the eye. A running scroll therefore has to have
        // *both* ends shifted — the write above would otherwise be
        // overwritten by the animation's next tick and the list would
        // slip by this much every frame, which is the jitter anchoring
        // exists to prevent.
        this.smoothScroller.adjust(node, axis, result.scrollAdjust);
      }
    }
  }

  /**
   * Measures the mounted items, and returns the extent of the content
   * above the first of them — a lazy grid's header.
   *
   * A lazy grid puts its rows inside one Grid, so that the header and
   * every row share its tracks; the rows are that grid's children
   * rather than the scroll container's, which is why the walk goes
   * through a Grid as it goes through a Fragment.
   */
  private collectVirtualMeasures(parent: UiNode, column: boolean, out: VirtualItemMeasure[]): number {
    let lead = 0;
    for (let child = parent.firstChild; child !== null; child = child.nextSibling) {
      const index = child.properties.get(VIRTUAL_INDEX_PROP);
      if (typeof index !== 'number') {
        if (child.type === UiNodeType.Fragment || child.type === UiNodeType.Grid) {
          lead += this.collectVirtualMeasures(child, column, out);
          continue;
        }
        if (child.properties.get(VIRTUAL_LEAD_PROP) === true) {
          lead += this.extentOf(child, column);
        }
        continue;
      }
      const rec = this.engine.recordFor(child);
      if (rec === undefined) {
        continue;
      }
      out.push({ index, extent: this.extentOf(child, column) });
    }
    return lead;
  }

  /** A node's outer extent along the list's axis. */
  private extentOf(node: UiNode, column: boolean): number {
    const rec = this.engine.recordFor(node);
    if (rec === undefined) {
      return 0;
    }
    return column
      ? rec.measuredHeight + rec.marginTop + rec.marginBottom
      : rec.measuredWidth + rec.marginLeft + rec.marginRight;
  }

  private handleFrame(frame: UiFrame): void {
    const root = this.root;
    if (root === undefined) {
      return;
    }
    const started = now();

    // The tree for this frame exists now. A focus trap taken from a
    // `ref` — which fires before the node has children — enters its
    // subtree here, so a dialog opened this frame gets the caret in
    // it before the frame is laid out and revealed.
    this.focusManager.settleScope();

    const laidOut = frameNeedsLayout(frame);
    this.phaseTimings.layout = this.timePhase(
      () => laidOut,
      () => this.engine.layoutForFrame(frame, this.constraints, root)
    );
    if (laidOut) {
      this.inspector.recordLayout(started);
    }
    // A modifier that follows its node's box hears about it here, after
    // the boxes are final and before anything paints from them. Nothing
    // listening means nothing walked.
    if (!this.layoutNotifier.isEmpty()) {
      this.layoutNotifier.notify(node => {
        const record = this.engine.recordFor(node);
        return {
          box: this.engine.visibleBox(node),
          scrollX: record?.scrollX ?? 0,
          scrollY: record?.scrollY ?? 0
        };
      });
    }

    // After the layout listeners rather than before, because
    // `autoFocus` is one of them: it takes focus on the first layout
    // of the node it is attached to, and every node in a subtree a
    // reload replaced is having its first layout on this frame.
    if (this.restoringFocus && laidOut) {
      this.restoringFocus = false;
      this.restoreFocusAfterReload();
    }

    // Before the semantics phase, not after the frame: the mirror
    // decides whether to move DOM focus from what the editing proxy
    // reports, and a field that gains focus this frame must have been
    // reported by the time it does. Layout has run, so the caret box
    // it carries is this frame's.
    this.sendEditingState();

    // What the tree *means* changes far less often than where it sits,
    // so the tree is rebuilt only when a semantics property or the
    // shape of the tree moved. With an accessibility mirror attached
    // the phase also sweeps the mirrored boxes on any frame that laid
    // out, because an off-screen element that is not over its node
    // gives a screen reader's cursor the wrong rectangle — so this
    // reads 0.00 on an app with no mirror, and on a mirrored app only
    // on a frame that neither moved nor re-meant anything.
    const rebuildSemantics = frameNeedsSemantics(frame);
    this.phaseTimings.semantics = this.timePhase(
      () =>
        rebuildSemantics ||
        (this.semanticsListener !== null && (laidOut || this.focusManager.focusedNode?.id !== this.lastFocusedId)),
      () => this.updateSemantics(rebuildSemantics, laidOut)
    );

    // Render is unconditional once the backend is ready: both backends
    // redraw the whole scene, so any frame that got this far changes
    // pixels. Before WebGPU has a device there is nothing to draw with;
    // a lost device falls back to Canvas2D and repaints.
    if (this.renderer.backend === 'webgpu' && (this.renderer as WebGPURenderer).isLost) {
      this.fallBackToCanvas2D(this.renderer);
    }
    // The inspector's overlay rides along with the frame, so either
    // backend draws it over the finished scene. The hovered node's
    // explanation only changes with layout, so it is re-read then and
    // sent when it differs from what the listener already has.
    const overlay = this.inspector.hasOverlay ? this.inspector.overlay(started) : null;
    this.gpuTimings = null;
    this.phaseTimings.render = this.timePhase(
      () => this.renderer.isReady,
      () =>
        this.renderer.render(root, {
          layout: this.engine,
          text: this.textMeasurer,
          now: started,
          overlay: overlay?.shapes
        })
    );
    if (overlay !== null) {
      if (laidOut) {
        this.sendInspection();
      }
      this.scheduleInspectorRepaint(overlay.nextChange);
    }
    this.sendDevtoolsUpdates(frame);

    const finished = now();
    const elapsed = finished - started;
    this.lastFrameMs = elapsed;
    this.scheduleScrollbarFade(finished);
    this.scheduleCaretBlink(finished);
    // A frame can change the cursor without the pointer moving: the
    // hovered node's `cursor` prop, or the node itself, may have changed.
    this.sendCursor();
    // The same is true of the scroll chain — a container that reached
    // its end, or content that grew under a still cursor.
    this.sendScrollability();
    const metrics: FrameMetrics = {
      frame: frame.id,
      durationMs: elapsed,
      nodes: frame.size,
      measured: this.engine.stats.measured,
      relayoutRoots: this.engine.stats.fullLayout ? 0 : this.engine.stats.relayoutRoots,
      at: finished,
      inputLatencyMs: this.inputLatency.take(epochAt(finished)),
      phases: this.phaseTimings,
      renderer: this.rendererState,
      gpu: this.gpuTimings
    };
    this.frameListener?.(metrics);
    if (this.watchingFrames) {
      this.devtoolsListener?.({ kind: 'frame', metrics });
    }
    // And to any component on this thread that asked to hear frames.
    this.services.get(FrameService).publish(metrics);
  }

  /**
   * Keeps frames coming while something is animating.
   *
   * This is the one problem in F4 with no precedent to copy. The
   * scheduler arms a frame only when a node is marked dirty, and an
   * animation's dirt is made *inside* `beforeCollect` — so by the time
   * a frame ends the set is empty again and nothing would arm the
   * next. Every other "frames nothing asks for" in this class (the
   * caret blink, the scrollbar fade, the heatmap) answers that with a
   * timer, and so does this; what is new is only that the driver is
   * asked how long to wait.
   *
   * Three answers, and each one matters:
   *
   * - **undefined** — nothing is running, so nothing is armed. An idle
   *   app schedules no frames at all, which is the strong reading of
   *   §F4's "`ticks 0.00` when idle": not frames that do nothing, but
   *   no frames.
   * - **now or earlier** — something wants every frame, so the next
   *   one is armed directly on the scheduler. Under
   *   `requestAnimationFrame` that is the display's cadence; a timer
   *   clock gets its own interval, which is what a render worker has.
   * - **later** — nobody wants a frame until then, so one timer waits.
   *   This is what keeps `decisions/0028`'s promise about the
   *   `Spinner`: eight positions means eight wake-ups a second, not
   *   sixty frames drawing seven identical pictures.
   */
  private scheduleAnimationTick(now: number): void {
    if (!this.visible) {
      // A hidden document arms nothing on its own account. This is the
      // whole of "do not draw for nobody", and it is deliberately
      // narrower than stopping the scheduler: a change that genuinely
      // happened — an image finishing its decode, a patch arriving from
      // the application thread — still marks a node dirty and still
      // gets a frame, so the canvas holds a correct picture rather than
      // whatever was on it when the tab went away.
      //
      // Stopping outright was tried first and was wrong in a way worth
      // recording: the first frame is not the first *useful* paint.
      // A route loaded hidden drew once, before its images had decoded,
      // and then stopped — so it held a picture with every photograph
      // missing until something woke it.
      return;
    }
    const next = this.animations.nextTickAt(now);
    if (next === undefined) {
      return;
    }
    if (next <= now) {
      this.scheduler.wake();
      return;
    }
    if (this.animationTimer !== null) {
      return;
    }
    this.animationTimer = setTimeout(
      () => {
        this.animationTimer = null;
        this.scheduler.wake();
      },
      Math.max(1, next - now)
    );
  }

  /**
   * Overlay scrollbars fade after scrolling stops, which needs frames no
   * property change asks for. The engine says when the next change is
   * due; one pending timer marks a repaint for it.
   */
  private scheduleScrollbarFade(now: number): void {
    const next = this.engine.nextScrollbarChange(now);
    if (next === undefined || this.scrollbarTimer !== null) {
      return;
    }
    this.scrollbarTimer = setTimeout(
      () => {
        this.scrollbarTimer = null;
        if (this.root !== undefined) {
          this.graph.markDirty(this.root, DirtyFlags.Paint);
        }
      },
      Math.max(16, next - now)
    );
  }

  /**
   * The caret blinks, which needs frames no property change asks for.
   * The editing controller says when it next toggles; one pending timer
   * repaints the focused editable then. Nothing is scheduled while no
   * editable has focus, a composition holds the caret steady, or the
   * page is hidden.
   */
  private scheduleCaretBlink(now: number): void {
    const next = this.input.editing.nextCaretChange(now);
    if (next === undefined || this.caretTimer !== null) {
      return;
    }
    this.caretTimer = setTimeout(
      () => {
        this.caretTimer = null;
        const focused = this.input.editing.focused;
        if (focused !== null) {
          this.graph.markDirty(focused, DirtyFlags.Paint);
        }
      },
      Math.max(16, next - now)
    );
  }

  /** Hands the listener the focused editable's state, when it changed. */
  private sendEditingState(): void {
    const state = this.input.editing.state();
    if (editingStatesEqual(state, this.lastEditingState)) {
      return;
    }
    this.lastEditingState = state;
    this.editingListener?.(state);
  }

  /**
   * The heatmap cools in steps, which needs frames nothing else asks
   * for; one pending timer marks a repaint for the next step due.
   */
  private scheduleInspectorRepaint(nextChange: number | undefined): void {
    if (nextChange === undefined || this.inspectorTimer !== null) {
      return;
    }
    this.inspectorTimer = setTimeout(
      () => {
        this.inspectorTimer = null;
        if (this.root !== undefined && this.inspector.isEnabled) {
          this.graph.markDirty(this.root, DirtyFlags.Paint);
        }
      },
      Math.max(16, nextChange)
    );
  }

  /** Hands the listener the hovered node's cursor, when it changed. */
  private sendCursor(): void {
    const cursor = resolveCursor(this.input.pointer.hoveredNode);
    if (cursor === this.lastCursor) {
      return;
    }
    this.lastCursor = cursor;
    this.cursorListener?.(cursor);
  }

  /**
   * Hands the listener the pointer's scroll chain, when it changed.
   *
   * Sent from the same two places as the cursor and for the same
   * reason: a hover change moves the chain, and a frame can change it
   * without the pointer moving — a list that reached its end, or
   * content that grew under a still cursor.
   */
  private sendScrollability(): void {
    // Hover first, and the last wheel's own target when nothing is
    // hovered. Scrolling a page slides a canvas under a cursor that
    // never moved, so on that path a wheel is the only evidence the
    // runtime gets that the pointer is over it at all.
    const target = this.input.pointer.hoveredNode ?? this.input.wheel.lastWheelTarget;
    const next = this.input.wheel.scrollabilityOf(target);
    const anything = this.input.wheel.scrollsAnything();
    const last = this.lastScrollability;
    const unchanged =
      next.up === last.up && next.down === last.down && next.left === last.left && next.right === last.right;
    if (unchanged && anything === this.lastScrollsAnything) {
      return;
    }
    this.lastScrollability = next;
    this.lastScrollsAnything = anything;
    this.scrollabilityListener?.(next, anything);
  }

  /** Hands the listener a report on the hovered node, when it changed. */
  private sendInspection(): void {
    // Compared on the explanation rather than on the whole report,
    // because the explanation already changes whenever anything about
    // the node's geometry does and a deep compare of the report would
    // cost more than building it.
    const text = this.inspector.explainHoveredText();
    if (text === this.lastInspection) {
      return;
    }
    this.lastInspection = text;
    const report = this.hoveredReport();
    this.inspectListener?.(report);
    this.devtoolsListener?.({ kind: 'hover', report });
  }

  /** A report on whatever the inspector says is hovered, or null. */
  private hoveredReport(): UiNodeReport | null {
    const node = this.inspector.hoveredNode;
    return node === null ? null : this.inspectNode(node);
  }

  /**
   * What a devtools panel is watching, after a frame: the tree when
   * its shape or text changed, and the selected node's report when
   * anything about it did. Nothing when no panel is attached.
   */
  private sendDevtoolsUpdates(frame: UiFrame): void {
    if (this.devtoolsListener === null) {
      return;
    }
    // A highlighted node that left the tree would keep its last box
    // drawn over whatever took its place.
    const highlighted = this.inspector.highlightedNode;
    if (highlighted !== null && this.graph.getNode(highlighted.id) !== highlighted) {
      this.inspector.setHighlighted(null);
    }
    if (this.watchingTree && (frameChangedTree(frame) || this.graph.subscriptionCount !== this.lastSubscriptions)) {
      this.sendTree();
    }
    if (this.selectedId !== null) {
      this.sendSelectedReport();
    }
  }

  /**
   * The selected node's report, when it differs from the last one
   * sent. A node that has gone is reported as null once, and then the
   * selection is dropped so the panel is not told again.
   */
  private sendSelectedReport(): void {
    const id = this.selectedId;
    if (id === null) {
      return;
    }
    const report = this.inspectNodeById(id);
    if (report === null) {
      this.selectedId = null;
      this.lastSelectedReport = null;
      this.devtoolsListener?.({ kind: 'report', id, report: null });
      return;
    }
    // Serialised rather than deep-compared: the report is plain data
    // by contract, and only one node's worth of it per frame.
    const text = JSON.stringify(report);
    if (text === this.lastSelectedReport) {
      return;
    }
    this.lastSelectedReport = text;
    this.devtoolsListener?.({ kind: 'report', id, report });
  }

  /**
   * Runs a phase when it has work, returning what it cost.
   *
   * A skipped phase reports 0, which is what makes the breakdown
   * useful: a frame doing nothing but scrolling should show zeroes
   * everywhere but render.
   */
  private timePhase(hasWork: () => boolean, run: () => void): number {
    if (!hasWork()) {
      return 0;
    }
    const started = now();
    run();
    return now() - started;
  }

  /** Duration of the most recent frame, in milliseconds. */
  get lastFrameDurationMs(): number {
    return this.lastFrameMs;
  }
}

/**
 * Anything that queues incoming state and applies it on a frame.
 *
 * Structural rather than a base class: a store replica and a channel
 * replica have nothing else in common, and the frame's first phase
 * only ever needs these three members.
 */
export interface PatchSource {
  readonly hasPendingPatches: boolean;
  flush(): void;
  deferPatches(scheduleFlush: () => void): void;
}

export interface FrameMetrics {
  frame: number;
  durationMs: number;
  nodes: number;
  /** Nodes the layout phase measured (memo hits excluded). */
  measured: number;
  /** Relayout boundaries the layout phase started from; 0 when it ran from the root or not at all. */
  relayoutRoots: number;
  /** Milliseconds per phase. A phase with no work reports 0. */
  phases: FramePhaseTimings;
  /** The backend that drew this frame, or `pending` while WebGPU initialises. */
  renderer: RendererBackend | 'pending';
  /**
   * The WebGPU render phase split into its stages — building the render
   * list, uploading buffers, encoding and submitting — or null when
   * Canvas2D drew. Their sum is the render phase's cost on the GPU path.
   */
  gpu: GpuStageTimings | null;
  /**
   * When the frame finished, on the clock of the thread that rendered
   * it. Gaps between consecutive values are the only honest measure of
   * a stall: across a worker boundary the messages themselves queue up
   * behind a blocked main thread and all arrive at once, so arrival
   * times say nothing about when the work happened.
   */
  at: number;
  /**
   * How long the input this frame answers waited, from the moment the
   * shell received it to the moment this frame finished, or null when
   * the frame was not drawn for an input.
   *
   * The companion to `at`, and the measurement `at` cannot make: a
   * shell too busy to forward events costs the person a late response
   * while the render worker, with nothing new to draw, reports a
   * perfectly even frame gap. Null on a host that does not stamp its
   * input — see `GessoRuntime.noteInput`.
   */
  inputLatencyMs: number | null;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Converts a `now()` reading to the cross-thread epoch clock.
 *
 * `performance.now()` counts from this thread's time origin, which in
 * a worker is the worker's own creation; the shell's stamps are
 * epoch-based so that the two can be subtracted. When there is no
 * `performance`, `now()` already returned `Date.now()` and the reading
 * is an epoch already.
 */
function epochAt(reading: number): number {
  return timeOrigin() + reading;
}

/**
 * What to add to a `now()` reading to get an epoch one: zero when
 * `now()` was already `Date.now()`.
 */
function timeOrigin(): number {
  return typeof performance !== 'undefined' ? performance.timeOrigin : 0;
}

function editingStatesEqual(a: EditingState | null, b: EditingState | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.text === b.text &&
    a.selectionStart === b.selectionStart &&
    a.selectionEnd === b.selectionEnd &&
    a.multiline === b.multiline &&
    a.composing === b.composing &&
    a.caret.x === b.caret.x &&
    a.caret.y === b.caret.y &&
    a.caret.width === b.caret.width &&
    a.caret.height === b.caret.height
  );
}

/** A canvas for the text measurer when the draw canvas is not a 2D one. */
function createMeasureCanvas(): CanvasHost {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(1, 1) as unknown as CanvasHost;
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas;
  }
  throw new Error('GessoRuntime: no canvas is available for text measurement; pass `measureCanvas`.');
}

/** Milliseconds per WebGPU stage of one frame. */
export interface GpuStageTimings {
  prepare: number;
  upload: number;
  encode: number;
}

function emptyGpuTimings(): GpuStageTimings {
  return { prepare: 0, upload: 0, encode: 0 };
}

function emptyPhaseTimings(): FramePhaseTimings {
  return { ticks: 0, patches: 0, environment: 0, virtualize: 0, layout: 0, semantics: 0, render: 0 };
}

/**
 * Whether anything in the frame needs measuring or placing.
 *
 * Mirrors what LayoutEngine.layoutForFrame decides internally, so a
 * scroll-only frame is reported as skipping layout rather than
 * spending an immeasurable amount of time deciding to do nothing.
 */
function frameNeedsLayout(frame: UiFrame): boolean {
  return frame.anyFlags(DirtyFlags.Layout | DirtyFlags.Children | DirtyFlags.SubtreeLayout | DirtyFlags.Transform);
}

/**
 * Semantics follow the properties that carry them and the shape of the
 * tree — a removed node marks its parent Children-dirty, which is how
 * a closed dialog leaves the tree.
 */
/** Shared empties, so a frame that changed nothing allocates nothing. */
const EMPTY_PATCHES: readonly UiSemanticsPatch[] = [];
const EMPTY_BOXES: readonly UiSemanticsBox[] = [];

function boxesEqual(a: LayoutBox, b: LayoutBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Whether the frame changed what a tree snapshot shows: a node added,
 * removed or moved, or a text node's text. The same flags the
 * semantics tree rebuilds on, for the same reason: a box that only
 * moved changed neither.
 */
function frameChangedTree(frame: UiFrame): boolean {
  return frameNeedsSemantics(frame);
}

function frameNeedsSemantics(frame: UiFrame): boolean {
  return frame.anyFlags(DirtyFlags.Semantics | DirtyFlags.Children);
}
