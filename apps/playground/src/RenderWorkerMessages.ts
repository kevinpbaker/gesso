import type { UiKeyModifiers } from '@gesso/core';
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
  | { type: 'pointerDown'; x: number; y: number; buttons: number; modifiers: UiKeyModifiers }
  | { type: 'pointerMove'; x: number; y: number; buttons: number; modifiers: UiKeyModifiers }
  | { type: 'pointerUp'; x: number; y: number; buttons: number; modifiers: UiKeyModifiers }
  | { type: 'pointerCancel' }
  | { type: 'wheel'; x: number; y: number; deltaX: number; deltaY: number; modifiers: UiKeyModifiers }
  | { type: 'keyDown'; key: string; modifiers: UiKeyModifiers }
  | { type: 'keyUp'; key: string; modifiers: UiKeyModifiers }
  | { type: 'dispose' };

/**
 * Messages sent from the Canvas render worker back to the main thread.
 */
export type RenderWorkerOutputMessage =
  | { type: 'metrics'; metrics: PlaygroundMetrics }
  | { type: 'scrollStats'; text: string }
  | { type: 'selected'; text: string }
  | { type: 'error'; message: string };
