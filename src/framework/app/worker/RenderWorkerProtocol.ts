import type { UiKeyModifiers } from '../../../ui/input/UiInputEvent';
import type { EditingState } from '../../../ui/input/UiEditingController';
import type { FramePhaseTimings, GpuStageTimings, RendererChoice } from '../NodalRuntime';
import type { RendererBackend } from '../../../ui/rendering';

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
    }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'pointerDown'; x: number; y: number; buttons: number; modifiers: UiKeyModifiers }
  | { type: 'pointerMove'; x: number; y: number; buttons: number; modifiers: UiKeyModifiers }
  | { type: 'pointerUp'; x: number; y: number; buttons: number; modifiers: UiKeyModifiers }
  | { type: 'pointerCancel' }
  | { type: 'wheel'; x: number; y: number; deltaX: number; deltaY: number; modifiers: UiKeyModifiers }
  | { type: 'keyDown'; key: string; modifiers: UiKeyModifiers }
  | { type: 'keyUp'; key: string; modifiers: UiKeyModifiers }
  /** A `beforeinput` from the editing proxy, in the DOM's inputType vocabulary. */
  | { type: 'beforeInput'; inputType: string; data: string | null }
  | { type: 'compositionStart' }
  /** The composition text so far and the caret offset within it. */
  | { type: 'compositionUpdate'; text: string; caret: number }
  /** The committed text; empty when the composition was cancelled. */
  | { type: 'compositionEnd'; text: string }
  | { type: 'paste'; text: string }
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
   * `NodalRuntime.setReducedMotion` for why it is not an environment
   * key.
   */
  | { type: 'reducedMotion'; reduced: boolean }
  | { type: 'inspector'; enabled: boolean }
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
  /** Put text on the clipboard (ShellStore.copyText). */
  | { type: 'clipboard'; text: string }
  /** Open a URL in a new tab (ShellStore.openUrl). */
  | { type: 'openUrl'; url: string };

export function modifiersFrom(event: {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): UiKeyModifiers {
  return { shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey, meta: event.metaKey };
}
