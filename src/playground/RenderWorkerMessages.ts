import type { UiModifiers } from '../ui/input/UiInputEvent';
import type { PlaygroundMetrics } from './LayoutPlayground';

/**
 * Messages sent from the main thread to the Canvas render worker.
 */
export type RenderWorkerMessage =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      width: number;
      height: number;
      dpr: number;
      port: MessagePort;
    }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'pointerDown'; x: number; y: number; buttons: number; modifiers: UiModifiers }
  | { type: 'pointerMove'; x: number; y: number; buttons: number; modifiers: UiModifiers }
  | { type: 'pointerUp'; x: number; y: number; buttons: number; modifiers: UiModifiers }
  | { type: 'pointerCancel' }
  | { type: 'wheel'; x: number; y: number; deltaX: number; deltaY: number; modifiers: UiModifiers }
  | { type: 'keyDown'; key: string; modifiers: UiModifiers }
  | { type: 'keyUp'; key: string; modifiers: UiModifiers }
  | { type: 'dispose' };

/**
 * Messages sent from the Canvas render worker back to the main thread.
 */
export type RenderWorkerOutputMessage =
  | { type: 'metrics'; metrics: PlaygroundMetrics }
  | { type: 'scrollStats'; text: string }
  | { type: 'selected'; text: string }
  | { type: 'error'; message: string };
