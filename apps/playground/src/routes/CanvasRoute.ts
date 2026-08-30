import { mountPlaygroundPanel, type ControlDispatcher } from '../PlaygroundPanel';
import { PlaygroundState } from '../PlaygroundState';
import { applyPatch, applyPatchToState, stateToSnapshot, type PlaygroundStateSnapshot } from '../StatePatch';
import type { DataWorkerMessage, DataWorkerOutputMessage } from '../DataWorkerMessages';
import type { RenderWorkerMessage, RenderWorkerOutputMessage } from '../RenderWorkerMessages';
import { createPreviewCanvas, observeSize } from '../shell/dom';

const FALLBACK_SIZE = 600;

/**
 * Route that proves the runtime works end to end, across three
 * threads:
 *
 *   - Main thread: the page shell and controls, and nothing else.
 *   - Data worker: owns PlaygroundState and every RxJS pipeline,
 *     including a synthetic heavy computation.
 *   - Render worker: receives operation-based state patches, applies
 *     them to a local replica, then runs layout, hit-testing and
 *     Canvas2D rendering against a transferred OffscreenCanvas.
 *
 * Control changes go to the data worker. It emits minimal patches
 * that flow both back here, to keep the controls truthful, and
 * directly to the render worker over a MessageChannel that never
 * touches this thread.
 */
export function mountCanvasRoute(host: HTMLElement): () => void {
  const state = new PlaygroundState();

  let dataWorker: Worker | undefined;
  let renderWorker: Worker | undefined;

  const dispatch: ControlDispatcher = (path, value) => {
    dataWorker?.postMessage({ type: 'control', op: { op: 'set', path, value } } satisfies DataWorkerMessage);
  };

  const panel = mountPlaygroundPanel(host, 'canvas', state, dispatch);
  const canvas = createPreviewCanvas(panel.preview);

  if (!supportsOffscreenCanvas(canvas)) {
    panel.updateSelected('OffscreenCanvas is not supported in this browser, so this route cannot run.');
    return () => panel.dispose();
  }

  const offscreen = canvas.transferControlToOffscreen();
  dataWorker = new Worker(new URL('../DataWorker.ts', import.meta.url), { type: 'module' });
  renderWorker = new Worker(new URL('../CanvasPlaygroundWorker.ts', import.meta.url), { type: 'module' });

  // 1. Give the data worker a port connected to the render worker.
  const channel = new MessageChannel();
  dataWorker.postMessage({ type: 'connectRender', port: channel.port1 } satisfies DataWorkerMessage, [channel.port1]);

  // 2. Hand the render worker the canvas and the other end of that port.
  const previewRect = panel.preview.getBoundingClientRect();
  renderWorker.postMessage(
    {
      type: 'init',
      canvas: offscreen,
      width: previewRect.width > 0 ? previewRect.width : FALLBACK_SIZE,
      height: previewRect.height > 0 ? previewRect.height : FALLBACK_SIZE,
      dpr: window.devicePixelRatio,
      port: channel.port2
    } satisfies RenderWorkerMessage,
    [offscreen, channel.port2]
  );

  // 3. Start the data worker, which produces the first patch.
  dataWorker.postMessage({ type: 'init' } satisfies DataWorkerMessage);

  let localSnapshot: PlaygroundStateSnapshot = stateToSnapshot(state);

  const onDataMessage = (event: MessageEvent<DataWorkerOutputMessage>): void => {
    const message = event.data;
    if (message.type === 'patch') {
      localSnapshot = applyPatch(localSnapshot, message.patch);
      applyPatchToState(state, localSnapshot);
    } else if (message.type === 'error') {
      panel.updateSelected(`Data worker error: ${message.message}`);
    }
  };
  dataWorker.addEventListener('message', onDataMessage);

  const onRenderMessage = (event: MessageEvent<RenderWorkerOutputMessage>): void => {
    const message = event.data;
    switch (message.type) {
      case 'metrics':
        panel.updateMetrics(message.metrics);
        break;
      case 'scrollStats':
        panel.updateScrollStats(message.text);
        break;
      case 'selected':
        panel.updateSelected(message.text);
        break;
      case 'error':
        panel.updateSelected(`Render worker error: ${message.message}`);
        break;
    }
  };
  renderWorker.addEventListener('message', onRenderMessage);

  const size = observeSize(panel.preview, (width, height) => {
    renderWorker?.postMessage({
      type: 'resize',
      width,
      height,
      dpr: window.devicePixelRatio
    } satisfies RenderWorkerMessage);
  });

  const detachInput = forwardInput(canvas, message => renderWorker?.postMessage(message));

  panel.updateSelected('Hover, press, click, wheel-scroll and Tab are all wired through the worker.');

  return () => {
    detachInput();
    size.stop();
    dataWorker?.postMessage({ type: 'dispose' } satisfies DataWorkerMessage);
    renderWorker?.postMessage({ type: 'dispose' } satisfies RenderWorkerMessage);
    dataWorker?.removeEventListener('message', onDataMessage);
    renderWorker?.removeEventListener('message', onRenderMessage);
    dataWorker?.terminate();
    renderWorker?.terminate();
    dataWorker = undefined;
    renderWorker = undefined;
    panel.dispose();
  };
}

/**
 * Forwards the canvas's input events to the render worker in the
 * worker's own coordinate space.
 *
 * The worker has no DOM and therefore no way to resolve a client
 * coordinate, so every position is converted against the canvas rect
 * before it is posted. Returns a function that detaches every
 * listener, including the two on `window`, which would otherwise
 * outlive the route.
 */
function forwardInput(canvas: HTMLCanvasElement, post: (message: RenderWorkerMessage) => void): () => void {
  const modifiersOf = (event: MouseEvent | KeyboardEvent | WheelEvent) => ({
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    meta: event.metaKey
  });

  const localPoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const pointerHandler = (type: 'pointerDown' | 'pointerMove' | 'pointerUp') => (event: PointerEvent) => {
    const local = localPoint(event.clientX, event.clientY);
    post({ type, x: local.x, y: local.y, buttons: event.buttons, modifiers: modifiersOf(event) });
  };

  const onPointerDown = pointerHandler('pointerDown');
  const onPointerMove = pointerHandler('pointerMove');
  const onPointerUp = pointerHandler('pointerUp');
  const onPointerCancel = (): void => post({ type: 'pointerCancel' });

  const onWheel = (event: WheelEvent): void => {
    // The scene scrolls, not the page.
    event.preventDefault();
    const local = localPoint(event.clientX, event.clientY);
    post({
      type: 'wheel',
      x: local.x,
      y: local.y,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      modifiers: modifiersOf(event)
    });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    // Focus is moved by the runtime's own focus manager, so Tab must
    // not also walk the browser's focus order out of the canvas.
    if (event.key === 'Tab') {
      event.preventDefault();
    }
    post({ type: 'keyDown', key: event.key, modifiers: modifiersOf(event) });
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    post({ type: 'keyUp', key: event.key, modifiers: modifiersOf(event) });
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  };
}

function supportsOffscreenCanvas(canvas: HTMLCanvasElement): boolean {
  return typeof OffscreenCanvas !== 'undefined' && typeof canvas.transferControlToOffscreen === 'function';
}
