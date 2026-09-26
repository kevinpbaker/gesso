import type { UiNodeReport } from '../NodeReport';
import type { DevtoolsEvent, DevtoolsRequest } from '../DevtoolsProtocol';
import type {
  UiKeyModifiers,
  EditingState,
  RendererBackend,
  UiInsets,
  UiPointerDevice,
  UiSemanticsAction,
  UiScrollability,
  UiSemanticsUpdate,
  UiFileDropMessage
} from 'gesso-core';
import type { AudioAction, AudioRequest, AudioSample } from '../AudioService';
import type { ColorScheme } from '../colorScheme';
import type { ShellFileRequest, ShellFileResult, ShellStorageOp, ShellStorageResult } from '../ShellService';
import type { FramePhaseTimings, GpuStageTimings, RendererChoice } from '../GessoRuntime';

/**
 * Messages the main-thread shell sends to the render worker.
 *
 * Deliberately small: input, size, and lifecycle. UiElements,
 * component instances, observables and UiNodes never cross the
 * boundary — they are constructed in the worker and stay there.
 */
export type ShellToRuntimeMessage =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      width: number;
      height: number;
      dpr: number;
      renderer?: RendererChoice;
      /**
       * How typed text reaches the runtime: `proxy` when the shell has
       * an editing proxy that sends `beforeInput` and composition (then
       * printable key presses are not text); `keys` (default) when key
       * presses are all there is.
       */
      textInput?: 'proxy' | 'keys';
      /**
       * One end of a channel to the application worker, when the shell
       * spawned one.
       *
       * The shell creates both workers and wires them together once,
       * then stays out of the way — it never sees a patch. Owning the
       * spawn rather than letting the render worker nest a worker
       * inside itself keeps the application alive across a render
       * worker being replaced (a renderer switch), and avoids
       * depending on nested worker support, which is not uniform
       * across the webviews this project targets.
       */
      appPort?: MessagePort;
      /**
       * Whether the shell has an accessibility mirror to feed. False
       * stops the runtime computing the geometry it would need, which
       * is the only per-frame cost the mirror has in here.
       */
      accessibility?: boolean;
    }
  | { type: 'resize'; width: number; height: number; dpr: number }
  /**
   * A devtools panel's request (`DevtoolsProtocol.ts`). The worker
   * answers with `devtools` messages; `console` is handled by the
   * worker host, which owns the global the calls are made on.
   */
  | { type: 'devtools'; request: DevtoolsRequest }
  /**
   * `pointer` is the contact: which device, and which of its
   * simultaneous contacts. Optional, so a shell written before touch
   * existed is read as the mouse it was — every touch behaviour in the
   * runtime is opt-in on this field saying `touch`.
   */
  | {
      type: 'pointerDown';
      x: number;
      y: number;
      buttons: number;
      modifiers: UiKeyModifiers;
      pointer?: UiPointerDevice;
      at?: number;
    }
  | {
      type: 'pointerMove';
      x: number;
      y: number;
      buttons: number;
      modifiers: UiKeyModifiers;
      pointer?: UiPointerDevice;
      at?: number;
    }
  | {
      type: 'pointerUp';
      x: number;
      y: number;
      buttons: number;
      modifiers: UiKeyModifiers;
      pointer?: UiPointerDevice;
      at?: number;
    }
  | { type: 'pointerCancel'; pointer?: UiPointerDevice; at?: number }
  /**
   * `deltaMode` is the DOM's own value, forwarded rather than
   * translated: a wheel delta is a distance in pixels only when it is
   * 0, and Firefox reports lines. Optional, so a shell that predates
   * it is read as pixels — which is what it was assumed to be.
   */
  | {
      type: 'wheel';
      x: number;
      y: number;
      deltaX: number;
      deltaY: number;
      modifiers: UiKeyModifiers;
      deltaMode?: number;
      /**
       * The legacy `wheelDeltaY`. Forwarded because a detented wheel
       * reports it in multiples of 120 and a precision device does
       * not, and only a detented wheel is worth animating.
       */
      wheelDeltaY?: number;
      at?: number;
    }
  | { type: 'keyDown'; key: string; modifiers: UiKeyModifiers; at?: number }
  | { type: 'keyUp'; key: string; modifiers: UiKeyModifiers; at?: number }
  /** A `beforeinput` from the editing proxy, in the DOM's inputType vocabulary. */
  | { type: 'beforeInput'; inputType: string; data: string | null; at?: number }
  | { type: 'compositionStart'; at?: number }
  /** The composition text so far and the caret offset within it. */
  | { type: 'compositionUpdate'; text: string; caret: number; at?: number }
  /** The committed text; empty when the composition was cancelled. */
  | { type: 'compositionEnd'; text: string; at?: number }
  | { type: 'paste'; text: string; at?: number }
  /** The editing proxy lost focus to something outside the app. */
  | { type: 'blur' }
  /** The page was hidden or shown (document.visibilityState). */
  | { type: 'visibility'; visible: boolean }
  /** The surface entered or left fullscreen, however that happened. */
  | { type: 'fullscreenChanged'; active: boolean }
  /**
   * The person's motion preference (`prefers-reduced-motion`), sent
   * once at start-up and again whenever it changes.
   *
   * The first thing this protocol has ever carried that is a
   * *preference* rather than an event or a size. It is inbound because
   * the query needs a window and the animations are in here; see
   * `GessoRuntime.setReducedMotion` for why it is not an environment
   * key.
   */
  | { type: 'reducedMotion'; reduced: boolean }
  /**
   * The appearance the shell is asking for
   * (`prefers-color-scheme`, or an override the host set), sent once at
   * start-up and again whenever it changes.
   *
   * The second preference-shaped message here, and inbound for the same
   * reason as the first — the query needs a window. It differs in who
   * consumes it: reduced motion reaches the animation driver, while
   * nothing in the framework reads this one. It is carried to `ShellService` and no further,
   * because what dark *looks* like is the application's, and a
   * framework that shipped an answer would be shipping a palette.
   *
   * Always resolved to one of the two appearances. `auto` is a thing a
   * host tells a shell, not a thing that crosses.
   */
  | { type: 'colorScheme'; scheme: ColorScheme }
  /**
   * What the window's own chrome is covering on each edge: the safe
   * area a notch or a home indicator takes, and the strip a soft
   * keyboard covers, read from `visualViewport` and the
   * `env(safe-area-inset-*)` custom properties. Sent once at start-up
   * and again whenever they change, which on a phone is every frame of
   * a keyboard sliding up.
   *
   * Inbound for the reason the two above are: `visualViewport` needs a
   * window. Four plain numbers cross, and nothing else, because what to
   * do about a keyboard is a layout question and layout is in here.
   * `GessoRuntime.setViewportInsets` publishes them into the
   * application's inset registry, where they compose by maximum with
   * whatever the application's own floating bars publish; see
   * `UiInsetRegistry` for why by maximum.
   */
  | { type: 'viewportInsets'; insets: UiInsets }
  /**
   * Where the window's address is now: once at start-up, and again for
   * every back, forward or typed address afterwards.
   *
   * The third preference-shaped message on this protocol, and for the
   * same reason as `reducedMotion`: `location` and `history` are the
   * shell's and the routes are in here. A url is the whole of what
   * routing puts on the wire — patterns, params, guards and screens
   * never leave the render thread, because a route holds a component
   * class and a component class cannot be posted anywhere.
   */
  | { type: 'url'; url: string }
  /**
   * What became of a popup the render worker asked for: `opened` is
   * false when the browser refused it, which is a thing an application
   * must be able to route around rather than a failure to log.
   *
   * The only reply on this protocol to a request from the other side,
   * which is why it carries the request's `id` rather than standing on
   * its own like the preference messages above it.
   */
  | { type: 'popupResult'; id: number; opened: boolean }
  /**
   * What the shell found in `localStorage` for a `storage` request
   * (ShellStorage). The second reply on this protocol, and it carries
   * its request's `id` for the same reason `popupResult` does.
   */
  | { type: 'storageResult'; id: number; result: ShellStorageResult }
  /**
   * What the shell did with a file request (ShellService.openFiles and
   * its siblings), under the request's `id`. A file read comes back
   * with its bytes, transferred rather than copied.
   */
  | { type: 'fileResult'; id: number; result: ShellFileResult }
  | { type: 'inspector'; enabled: boolean }
  /**
   * What an assistive technology did to the accessibility mirror: a
   * press, a focus move, or a value set.
   *
   * The fourth preference-shaped asymmetry on this protocol, and the
   * only *input* on it that no device produced. It arrives by id
   * rather than by coordinate because that is what the mirror has: an
   * element standing for a node, with no idea where the person's
   * pointer is or whether there is one. `GessoRuntime.applySemanticsAction`
   * turns it back into the events a pointer and a keyboard produce.
   */
  | { type: 'semanticsAction'; action: UiSemanticsAction }
  /**
   * Files dragged over the canvas from outside the application, and
   * let go on it: `UiDragSession.applyFileDrop` turns the four phases
   * into a drag like any other. On `drop` the files' bytes ride along
   * and are transferred rather than copied; see `attachFileDrop`.
   */
  | UiFileDropMessage
  /**
   * What the shell's audio element is doing: on every state change and
   * about once a second while it plays. The element lives on the shell
   * because no worker can make a sound; `AudioService` is its client
   * and moves the position on between samples. See `AudioSink`.
   */
  | { type: 'audioSample'; sample: AudioSample }
  /**
   * What the platform's media controls asked for (the keyboard's media
   * keys, the OS overlay). Play and pause were already done to the
   * element and arrive as samples too; next and previous are the
   * application's to answer.
   */
  | { type: 'audioAction'; action: AudioAction }
  /**
   * One display refresh, forwarded from the shell's
   * `requestAnimationFrame`.
   *
   * The render worker's frames were paced by a fixed 16ms timer,
   * because `requestAnimationFrame` is tied to the compositor and does
   * not exist off the main thread. That capped every display at
   * roughly sixty and aligned to none of them. The shell runs the loop
   * and forwards the beat; `time` is the rAF timestamp, so the
   * runtime's frame times stay on the same clock the display is on.
   *
   * Sent only between `frameLoop` starting and stopping, so an idle
   * app exchanges nothing.
   */
  | { type: 'tick'; time: number }
  | { type: 'dispose' };

/**
 * Where an error the worker reports came from.
 *
 * The shell cannot see a worker's exceptions, so this is the only
 * thing that tells a developer *what* is broken rather than only what
 * threw — and the four cases have genuinely different consequences:
 *
 *   - `message`   — thrown while handling a message from the shell.
 *     Input or a resize was dropped; the app is otherwise intact.
 *   - `uncaught`  — an exception or a rejected promise nothing caught,
 *     which is almost always a frame. The scheduler had already
 *     drained the dirty set for that frame, so the work it held is
 *     gone and the surface can be stale until something dirties those
 *     nodes again. The most serious of the four.
 *   - `renderer`  — the backend refused to draw (a lost GPU device, a
 *     surface it could not configure). Layout and state are fine.
 *   - `channel`   — a channel's worker or its patch stream threw. The
 *     view is intact; the data behind it stopped.
 *   - `listener`  — one of the application's own event listeners threw.
 *     The dispatcher caught it so the event still reached the rest of
 *     the tree, so this is the one source that costs the running
 *     application nothing but whatever the handler was supposed to do.
 */
export type RuntimeErrorSource =
  | 'message'
  | 'uncaught'
  | 'renderer'
  | 'channel'
  | 'listener'
  /**
   * A frame threw. The frame was abandoned and the clock kept
   * running, so the application is still drawing: this is a report,
   * not an obituary.
   *
   * Its own source because it used to arrive as `message` — the throw
   * escaped into whatever was forwarding the tick — and that both
   * mislabelled it and stopped the application, since nothing re-armed
   * the clock afterwards.
   */
  | 'frame';

/**
 * Messages the render worker sends back.
 *
 * The shell owns no UI state, so this carries only observability:
 * readiness, frame timings, and errors that would otherwise be
 * invisible inside a worker.
 */
export type RuntimeToShellMessage =
  | { type: 'ready' }
  | {
      type: 'frame';
      frame: number;
      durationMs: number;
      nodes: number;
      measured: number;
      relayoutRoots: number;
      at: number;
      inputLatencyMs: number | null;
      phases: FramePhaseTimings;
      renderer: RendererBackend | 'pending';
      gpu: GpuStageTimings | null;
    }
  | { type: 'error'; message: string; stack?: string; source: RuntimeErrorSource }
  /** A report on the hovered node while the inspector is on; null when nothing is hovered. */
  | { type: 'inspect'; report: UiNodeReport | null }
  /** An answer to a devtools request, or an update to something a panel is watching. */
  | { type: 'devtools'; event: DevtoolsEvent }
  /** The CSS cursor the hovered node asks for; null for the default arrow. */
  | { type: 'cursor'; cursor: string | null }
  /**
   * Which way the runtime could scroll under the pointer, and whether
   * it has anything scrollable at all.
   *
   * Pushed ahead of the wheel it answers for, because the shell has
   * to decide `preventDefault()` synchronously and the runtime is a
   * message away. Without it the shell must either swallow every
   * wheel — making the canvas a scroll trap in the page around it —
   * or swallow none, and let one wheel scroll twice.
   *
   * `scrollsAnything` is the coarser tree-level answer, and drives
   * the canvas's `touch-action`: that is latched when a finger lands,
   * so there is no hover position it could have been derived from.
   */
  | { type: 'scrollability'; scrollability: UiScrollability; scrollsAnything: boolean }
  /**
   * The focused editable's text, selection and caret box for the
   * editing proxy to mirror; null when no editable has focus.
   */
  | { type: 'editing'; state: EditingState | null }
  /** Put text on the clipboard (ShellService.copyText). */
  | { type: 'clipboard'; text: string }
  /** Open a URL in a new tab (ShellService.openUrl). */
  | { type: 'openUrl'; url: string }
  | { type: 'fullscreen'; enter: boolean }
  /**
   * Open a sized, named window and report back whether the browser
   * allowed it (ShellService.openPopup).
   *
   * The only shell request that is answered. `id` pairs this with the
   * `popupResult` that comes back; the shell must send exactly one per
   * request, because the promise waiting on it settles once.
   *
   * Sent ahead of any slow work on purpose: the browser grants a window
   * only while the click that prompted it is still fresh, so a render
   * worker that resolves a url first will find the window refused.
   */
  | { type: 'popup'; id: number; url: string; name: string; width: number; height: number }
  /**
   * Read, write, remove or list in `localStorage`, which lives on the
   * window and nowhere else (ShellStorage).
   *
   * Answered, like `popup`, and `id` pairs the two. The shell performs
   * exactly the call it is given and decides nothing about the key,
   * which is what keeps it the dumb half of the thread model.
   */
  | { type: 'storage'; id: number; op: ShellStorageOp; key: string; value?: string }
  /**
   * Open, save, reopen, list or forget files (ShellService.openFiles
   * and its siblings). Answered with `fileResult`. Sent at once, like
   * `popup`, because a picker is shown only while the click that asked
   * for it is fresh.
   */
  | { type: 'file'; id: number; request: ShellFileRequest }
  /** The router navigated; the shell owns the address bar (RouterService). */
  | { type: 'history'; action: 'push' | 'replace' | 'back' | 'forward'; url?: string }
  /** Load, play, pause, seek, set the volume or the OS metadata (AudioService). */
  | { type: 'audio'; request: AudioRequest }
  /**
   * What the accessibility mirror needs to keep up with this frame:
   * the semantics patches, the boxes that moved, and the focused node
   * when focus moved.
   *
   * Sent only while the shell has a mirror attached — a `SemanticsMirror`
   * subscribes by existing, and a runtime nobody is mirroring computes
   * no geometry at all. Records and boxes travel at different cadences
   * and are one message anyway; `UiSemanticsUpdate` says why.
   */
  /**
   * Whether the runtime currently wants display refreshes.
   *
   * The shell answers by running or stopping a `requestAnimationFrame`
   * loop that sends `tick`. It is a state rather than a per-frame
   * request because a request-per-frame costs a round trip inside
   * every frame: a request that reaches the shell after that vsync's
   * callback has run waits for the next one, and the frame rate
   * halves.
   */
  | { type: 'frameLoop'; running: boolean }
  /**
   * One `resize` has been applied, and the shell may send the next.
   *
   * A resize is the one shell message whose handling costs a full
   * layout, and `ResizeObserver` delivers one per refresh while a
   * window edge is dragged. A worker slower than the display therefore
   * accumulates a queue of sizes it must lay out and paint in turn,
   * every one of them already wrong, and the lag grows for as long as
   * the drag lasts rather than settling.
   *
   * So the shell keeps at most one resize in flight and remembers only
   * the latest size it has not sent. This message is what lets it: the
   * worker has drained the previous one, so the current size can go
   * now. Nothing is dropped that anyone can see — the last size always
   * gets sent, because it is the one held back.
   *
   * The dimensions ride along so the shell can tell an acknowledgement
   * of the size it is holding from one it has already superseded.
   */
  | { type: 'resized'; width: number; height: number; dpr: number }
  | { type: 'semantics'; update: UiSemanticsUpdate };

/**
 * The set of shell messages that carry a user input.
 *
 * The shell stamps these with `at` and the runtime measures against
 * them; everything else in the protocol is a size, a preference or a
 * lifecycle signal and has no latency to speak of.
 */
const INPUT_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'pointerDown',
  'pointerMove',
  'pointerUp',
  'pointerCancel',
  'wheel',
  'keyDown',
  'keyUp',
  'beforeInput',
  'compositionStart',
  'compositionUpdate',
  'compositionEnd',
  'paste'
]);

export function isInputMessage(message: ShellToRuntimeMessage): message is ShellToRuntimeMessage & { at?: number } {
  return INPUT_MESSAGE_TYPES.has(message.type);
}

/**
 * Milliseconds since the Unix epoch, at `performance.now()`'s
 * resolution.
 *
 * Input latency is the one measurement in this protocol that spans two
 * threads, and `performance.now()` cannot span them: a worker's time
 * origin is its own creation, not the document's, so the shell's
 * reading and the worker's reading are counted from different
 * moments. Adding `timeOrigin` puts both on one clock.
 *
 * `FrameMetrics.at` deliberately does *not* use this — it is only ever
 * subtracted from another reading taken on the same thread, and its
 * docblock explains why that is the honest measure of a stall.
 */
export function epochNow(): number {
  if (typeof performance === 'undefined') {
    return Date.now();
  }
  return performance.timeOrigin + performance.now();
}

/**
 * When a DOM event actually happened, on the same epoch clock.
 *
 * `event.timeStamp` is set by the browser when it creates the event,
 * not when a listener runs, and that difference is the whole point of
 * this measurement: a shell busy for two seconds runs its listener two
 * seconds late, and stamping inside the listener would record the
 * delay as zero. Reading the event's own clock is what makes a blocked
 * shell visible.
 */
export function epochFromEvent(event: { timeStamp: number }): number {
  if (typeof performance === 'undefined') {
    return Date.now();
  }
  return performance.timeOrigin + event.timeStamp;
}

export function modifiersFrom(event: {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): UiKeyModifiers {
  return { shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey, meta: event.metaKey };
}
