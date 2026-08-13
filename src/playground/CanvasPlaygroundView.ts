import { mountPlaygroundShell, type ControlDispatcher } from './PlaygroundControls';
import { PlaygroundState } from './PlaygroundState';
import { applyPatch, applyPatchToState, stateToSnapshot, type PlaygroundStateSnapshot } from './StatePatch';
import type { DataWorkerMessage, DataWorkerOutputMessage } from './DataWorkerMessages';
import type { RenderWorkerMessage, RenderWorkerOutputMessage } from './RenderWorkerMessages';

/**
 * Route that proves the runtime works end-to-end: the same
 * playground scenes the DOM-box route shows are painted by the real
 * library renderer (Canvas2DRenderer) onto a canvas, sharing a
 * canvas-backed text measurer with the layout engine.
 *
 * This version uses three threads:
 *
 *   - Main thread: DOM shell + controls.
 *   - Data worker: owns PlaygroundState and all RxJS observable
 *     pipelines, including a synthetic heavy computation.
 *   - Render worker: receives operation-based state patches from the
 *     data worker, applies them to a local state replica, then runs
 *     layout, hit-testing, and Canvas2D rendering.
 *
 * Control changes are sent to the data worker. The data worker emits
 * minimal state patches that flow both to the main thread (to keep
 * controls in sync) and directly to the render worker over a
 * MessageChannel.
 *
 * Returns a dispose function so the hash router can swap routes.
 */
export function mountCanvasPlayground(host: HTMLElement): () => void {
  const state = new PlaygroundState();

  let dataWorker: Worker | undefined;
  let renderWorker: Worker | undefined;

  const dispatch: ControlDispatcher = (path, value) => {
    dataWorker?.postMessage({ type: 'control', op: { op: 'set', path, value } } as DataWorkerMessage);
  };

  const shell = mountPlaygroundShell(host, state, dispatch);

  const canvas = document.createElement('canvas');
  canvas.className = 'pg-canvas';
  canvas.tabIndex = 0;
  canvas.style.touchAction = 'none';
  shell.preview.appendChild(canvas);

  if (!supportsOffscreenCanvas(canvas)) {
    shell.updateSelected('OffscreenCanvas is not supported in this browser.');
    return () => {};
  }

  const offscreen = canvas.transferControlToOffscreen();
  dataWorker = new Worker(new URL('./DataWorker.ts', import.meta.url), { type: 'module' });
  renderWorker = new Worker(new URL('./CanvasPlaygroundWorker.ts', import.meta.url), { type: 'module' });

  const channel = new MessageChannel();

  // 1. Give the data worker a port connected to the render worker.
  dataWorker.postMessage({ type: 'connectRender', port: channel.port1 } as DataWorkerMessage, [channel.port1]);

  // 2. Initialize the render worker with the canvas and the other port.
  const previewRect = shell.preview.getBoundingClientRect();
  const initialWidth = previewRect.width > 0 ? previewRect.width : 600;
  const initialHeight = previewRect.height > 0 ? previewRect.height : 600;
  renderWorker.postMessage(
    {
      type: 'init',
      canvas: offscreen,
      width: initialWidth,
      height: initialHeight,
      dpr: window.devicePixelRatio,
      port: channel.port2
    } as RenderWorkerMessage,
    [offscreen, channel.port2]
  );

  // 3. Initialize the data worker. This triggers the first patch.
  dataWorker.postMessage({ type: 'init' } as DataWorkerMessage);

  let localSnapshot: PlaygroundStateSnapshot = stateToSnapshot(state);

  const onDataMessage = (event: MessageEvent<DataWorkerOutputMessage>): void => {
    const message = event.data;
    if (message.type === 'patch') {
      localSnapshot = applyPatch(localSnapshot, message.patch);
      applyPatchToState(state, localSnapshot);
    } else if (message.type === 'error') {
      shell.updateSelected(`Data worker error: ${message.message}`);
    }
  };
  dataWorker.addEventListener('message', onDataMessage);

  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        renderWorker?.postMessage({
          type: 'resize',
          width,
          height,
          dpr: window.devicePixelRatio
        } as RenderWorkerMessage);
      }
    }
  });
  resizeObserver.observe(shell.preview);

  const modifiersFromEvent = (event: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }) => ({
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    meta: event.metaKey
  });

  const clientToLocal = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const onPointerDown = (event: PointerEvent): void => {
    const local = clientToLocal(event.clientX, event.clientY);
    renderWorker?.postMessage({
      type: 'pointerDown',
      x: local.x,
      y: local.y,
      buttons: event.buttons,
      modifiers: modifiersFromEvent(event)
    } as RenderWorkerMessage);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const local = clientToLocal(event.clientX, event.clientY);
    renderWorker?.postMessage({
      type: 'pointerMove',
      x: local.x,
      y: local.y,
      buttons: event.buttons,
      modifiers: modifiersFromEvent(event)
    } as RenderWorkerMessage);
  };

  const onPointerUp = (event: PointerEvent): void => {
    const local = clientToLocal(event.clientX, event.clientY);
    renderWorker?.postMessage({
      type: 'pointerUp',
      x: local.x,
      y: local.y,
      buttons: event.buttons,
      modifiers: modifiersFromEvent(event)
    } as RenderWorkerMessage);
  };

  const onPointerCancel = (): void => {
    renderWorker?.postMessage({ type: 'pointerCancel' } as RenderWorkerMessage);
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const local = clientToLocal(event.clientX, event.clientY);
    renderWorker?.postMessage({
      type: 'wheel',
      x: local.x,
      y: local.y,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      modifiers: modifiersFromEvent(event)
    } as RenderWorkerMessage);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') {
      event.preventDefault();
    }
    renderWorker?.postMessage({
      type: 'keyDown',
      key: event.key,
      modifiers: modifiersFromEvent(event)
    } as RenderWorkerMessage);
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    renderWorker?.postMessage({
      type: 'keyUp',
      key: event.key,
      modifiers: modifiersFromEvent(event)
    } as RenderWorkerMessage);
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const onRenderMessage = (event: MessageEvent<RenderWorkerOutputMessage>): void => {
    const message = event.data;
    switch (message.type) {
      case 'metrics':
        shell.updateMetrics(message.metrics);
        break;
      case 'scrollStats':
        shell.updateScrollStats(message.text);
        break;
      case 'selected':
        shell.updateSelected(message.text);
        break;
      case 'error':
        shell.updateSelected(`Render worker error: ${message.message}`);
        break;
    }
  };
  renderWorker.addEventListener('message', onRenderMessage);

  shell.updateSelected('Canvas input demo: hover, press, click, wheel-scroll and Tab are wired.');

  return () => {
    dataWorker?.postMessage({ type: 'dispose' } as DataWorkerMessage);
    renderWorker?.postMessage({ type: 'dispose' } as RenderWorkerMessage);
    dataWorker?.terminate();
    renderWorker?.terminate();
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    dataWorker?.removeEventListener('message', onDataMessage);
    renderWorker?.removeEventListener('message', onRenderMessage);
    dataWorker = undefined;
    renderWorker = undefined;
  };
}

function supportsOffscreenCanvas(canvas: HTMLCanvasElement): boolean {
  return typeof OffscreenCanvas !== 'undefined' && typeof canvas.transferControlToOffscreen === 'function';
}
