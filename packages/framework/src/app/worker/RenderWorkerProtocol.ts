import type { UiKeyModifiers, EditingState, RendererBackend, UiSemanticsAction, UiSemanticsUpdate } from '@gesso/core';
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
  | { type: 'pointerDown'; x: number; y: number; buttons: number; modifiers: UiKeyModifiers; at?: number }
  | { type: 'pointerMove'; x: number; y: number; buttons: number; modifiers: UiKeyModifiers; at?: number }
  | { type: 'pointerUp'; x: number; y: number; buttons: number; modifiers: UiKeyModifiers; at?: number }
  | { type: 'pointerCancel'; at?: number }
  | { type: 'wheel'; x: number; y: number; deltaX: number; deltaY: number; modifiers: UiKeyModifiers; at?: number }
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
   * Where the window's address is now: once at start-up, and again for
   * every back, forward or typed address afterwards.
   *
   * The second preference-shaped message on this protocol, and for the
   * same reason as `reducedMotion`: `location` and `history` are the
   * shell's and the routes are in here. A url is the whole of what
   * routing puts on the wire — patterns, params, guards and screens
   * never leave the render thread, because a route holds a component
   * class and a component class cannot be posted anywhere.
   */
  | { type: 'url'; url: string }
  | { type: 'inspector'; enabled: boolean }
  /**
   * What an assistive technology did to the accessibility mirror: a
   * press, a focus move, or a value set.
   *
   * The third preference-shaped asymmetry on this protocol, and the
   * only *input* on it that no device produced. It arrives by id
   * rather than by coordinate because that is what the mirror has: an
   * element standing for a node, with no idea where the person's
   * pointer is or whether there is one. `GessoRuntime.applySemanticsAction`
   * turns it back into the events a pointer and a keyboard produce.
   */
  | { type: 'semanticsAction'; action: UiSemanticsAction }
  | { type: 'dispose' };

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
  | { type: 'error'; message: string; stack?: string }
  /** The hovered node's layout explanation while the inspector is on; null when nothing is hovered. */
  | { type: 'inspect'; text: string | null }
  /** The CSS cursor the hovered node asks for; null for the default arrow. */
  | { type: 'cursor'; cursor: string | null }
  /**
   * The focused editable's text, selection and caret box for the
   * editing proxy to mirror; null when no editable has focus.
   */
  | { type: 'editing'; state: EditingState | null }
  /** Put text on the clipboard (ShellService.copyText). */
  | { type: 'clipboard'; text: string }
  /** Open a URL in a new tab (ShellService.openUrl). */
  | { type: 'openUrl'; url: string }
  /** The router navigated; the shell owns the address bar (RouterService). */
  | { type: 'history'; action: 'push' | 'replace' | 'back' | 'forward'; url?: string }
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
