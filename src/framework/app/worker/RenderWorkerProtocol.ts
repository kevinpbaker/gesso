import type { UiModifiers } from '../../../ui/input/UiInputEvent';
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
  | { type: 'init'; canvas: OffscreenCanvas; width: number; height: number; dpr: number; renderer?: RendererChoice }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'pointerDown'; x: number; y: number; buttons: number; modifiers: UiModifiers }
  | { type: 'pointerMove'; x: number; y: number; buttons: number; modifiers: UiModifiers }
  | { type: 'pointerUp'; x: number; y: number; buttons: number; modifiers: UiModifiers }
  | { type: 'pointerCancel' }
  | { type: 'wheel'; x: number; y: number; deltaX: number; deltaY: number; modifiers: UiModifiers }
  | { type: 'keyDown'; key: string; modifiers: UiModifiers }
  | { type: 'keyUp'; key: string; modifiers: UiModifiers }
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
  | { type: 'cursor'; cursor: string | null };

export function modifiersFrom(event: {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): UiModifiers {
  return { shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey, meta: event.metaKey };
}
