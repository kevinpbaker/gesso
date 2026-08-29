import { DirtyFlags } from '../ui/graph/DirtyFlags';
import { UiNodeType } from '../ui/graph/UiNodeType';
import type { UiNode } from '../ui/graph/UiNode';
import { UiInputDispatcher } from '../ui/input/UiInputDispatcher';
import { UiEventType, UiKeyboardEvent, UiPointerEvent } from '../ui/input/UiInputEvent';
import { UiHitTester } from '../ui/input/UiHitTester';
import { UiPointerController } from '../ui/input/UiPointerController';
import { UiWheelController } from '../ui/input/UiWheelController';
import type { ScrollContainerState, ScrollSink } from '../ui/input/UiWheelController';
import { UiFocusManager } from '../ui/input/UiFocusManager';
import { UiKeyboardController } from '../ui/input/UiKeyboardController';
import { UiTimerFrameClock } from '../ui/scheduler';
import { CanvasPreview } from './CanvasPreview';
import { LayoutPlayground } from './LayoutPlayground';
import { scrollStatsText } from './scrollStats';
import { createDefinition } from './PlaygroundDefinition';
import { rewireFocusableBoxes } from './PlaygroundInput';
import { PlaygroundState } from './PlaygroundState';
import {
  applyPatch,
  applyPatchToState,
  stateToSnapshot,
  type DataRenderPortMessage,
  type PlaygroundStateSnapshot,
  type StatePatch
} from './StatePatch';
import type { RenderWorkerMessage, RenderWorkerOutputMessage } from './RenderWorkerMessages';

/**
 * Render worker entry point for the Canvas Playground.
 *
 * Receives operation-based state patches from the data worker over a
 * dedicated MessagePort, applies them to a local PlaygroundState replica,
 * and renders. The heavy observable pipelines live in the data worker,
 * so this thread only does UI work: graph reconciliation, layout,
 * hit-testing, and Canvas2D rasterization.
 */

interface WorkerInput {
  pointerController: UiPointerController;
  wheelController: UiWheelController;
  keyboardController: UiKeyboardController;
}

let preview: CanvasPreview | undefined;
let playground: LayoutPlayground | undefined;
let state: PlaygroundState | undefined;
let localSnapshot: PlaygroundStateSnapshot | undefined;
let input: WorkerInput | undefined;
let dataPort: MessagePort | undefined;

self.onmessage = (event: MessageEvent<RenderWorkerMessage>) => {
  const message = event.data;
  try {
    switch (message.type) {
      case 'init':
        handleInit(message);
        break;
      case 'resize':
        handleResize(message.width, message.height, message.dpr);
        break;
      case 'pointerDown':
        input?.pointerController.pointerDown(message.x, message.y, message.buttons, message.modifiers);
        break;
      case 'pointerMove':
        input?.pointerController.pointerMove(message.x, message.y, message.buttons, message.modifiers);
        break;
      case 'pointerUp':
        input?.pointerController.pointerUp(message.x, message.y, message.buttons, message.modifiers);
        break;
      case 'pointerCancel':
        input?.pointerController.pointerCancel();
        break;
      case 'wheel':
        input?.wheelController.wheel(message.x, message.y, message.deltaX, message.deltaY, message.modifiers);
        break;
      case 'keyDown':
        input?.keyboardController.keyDown(message.key, message.modifiers);
        break;
      case 'keyUp':
        input?.keyboardController.keyUp(message.key, message.modifiers);
        break;
      case 'dispose':
        dispose();
        break;
    }
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

function post(message: RenderWorkerOutputMessage): void {
  self.postMessage(message);
}

function postToData(message: DataRenderPortMessage): void {
  dataPort?.postMessage(message);
}

function handleInit(init: Extract<RenderWorkerMessage, { type: 'init' }>): void {
  dispose();

  dataPort = init.port;
  dataPort.onmessage = (event: MessageEvent<DataRenderPortMessage>) => {
    if (event.data.type === 'patch') {
      applyPatchFromDataWorker(event.data.patch);
    }
  };

  preview = new CanvasPreview(init.canvas);
  preview.setLogicalSize(init.width, init.height, init.dpr);

  playground = new LayoutPlayground({
    clock: callback => new UiTimerFrameClock(callback),
    textMeasurer: preview.textMeasurer
  });

  state = new PlaygroundState();
  localSnapshot = stateToSnapshot(state);

  playground.build(createDefinition(state));
  rewireFocusableBoxes(playground.layoutRoot);

  input = wireWorkerInput(playground, state);

  playground.setOnUpdate(() => {
    if (preview === undefined || playground === undefined) {
      return;
    }
    preview.render(playground.layoutRoot, playground.engine);
    const info = playground.inspect();
    post({ type: 'metrics', metrics: playground.metrics() });
    post({ type: 'scrollStats', text: scrollStatsText(info) });
  });

  playground.relayout(init.width, init.height);
}

function handleResize(width: number, height: number, dpr: number): void {
  preview?.setLogicalSize(width, height, dpr);
  playground?.relayout(width, height);
}

function applyPatchFromDataWorker(patch: StatePatch): void {
  if (state === undefined || playground === undefined || localSnapshot === undefined) {
    return;
  }
  localSnapshot = applyPatch(localSnapshot, patch);
  const needsRebuild = applyPatchToState(state, localSnapshot);
  if (needsRebuild) {
    playground.rebuild(createDefinition(state));
    rewireFocusableBoxes(playground.layoutRoot);
  }
}

function dispose(): void {
  input = undefined;
  playground?.dispose();
  playground = undefined;
  preview = undefined;
  state = undefined;
  localSnapshot = undefined;
  dataPort = undefined;
}

function wireWorkerInput(playground: LayoutPlayground, state: PlaygroundState): WorkerInput {
  const dispatcher = new UiInputDispatcher();
  const root = playground.layoutRoot;
  const hitTester = new UiHitTester(playground.engine, root);
  const focusManager = new UiFocusManager(root, dispatcher);
  const keyboardController = new UiKeyboardController(dispatcher, focusManager, root, { tabNavigation: false });
  const pointerController = new UiPointerController(hitTester, dispatcher, {
    onPress: node => {
      if (node !== null) {
        focusManager.focusOnPress(node);
      }
      post({ type: 'selected', text: node === null ? 'Pressed empty space' : `Pressed ${node.id}` });
    }
  });
  const wheelController = new UiWheelController(hitTester, dispatcher, createWorkerScrollSink(playground, state));

  wireWorkerVisualFeedback(playground, dispatcher, pointerController, focusManager);

  return { pointerController, wheelController, keyboardController };
}

function createWorkerScrollSink(playground: LayoutPlayground, state: PlaygroundState): ScrollSink {
  return {
    containerState(node): ScrollContainerState | undefined {
      const record = playground.engine.recordFor(node);
      if (record === undefined) {
        return undefined;
      }
      const horizontal = node.getProperty('direction') === 'row';
      return {
        scrollX: record.scrollX,
        scrollY: record.scrollY,
        maxScrollX: Math.max(0, record.contentWidth - record.width),
        maxScrollY: Math.max(0, record.contentHeight - record.height),
        horizontal
      };
    },
    scrollBy(node, dx, dy): void {
      const record = playground.engine.recordFor(node);
      if (record === undefined) {
        return;
      }
      if (dy !== 0) {
        const maxY = Math.max(0, record.contentHeight - record.height);
        const nextY = clamp(record.scrollY + dy, 0, maxY);
        // Update locally for immediate visual feedback, then sync to the
        // data worker so it stays the source of truth.
        state.scrollY$.next(nextY);
        postToData({ type: 'control', op: { op: 'set', path: 'scrollY', value: nextY } });
      }
      if (dx !== 0) {
        const maxX = Math.max(0, record.contentWidth - record.width);
        const nextX = clamp(record.scrollX + dx, 0, maxX);
        node.setProperty('scrollX', nextX);
        playground.graph.markDirty(node, DirtyFlags.Properties);
      }
    }
  };
}

function wireWorkerVisualFeedback(
  playground: LayoutPlayground,
  dispatcher: UiInputDispatcher,
  pointerController: UiPointerController,
  focusManager: UiFocusManager
): void {
  const root = playground.layoutRoot;
  const originals = new WeakMap<
    UiNode,
    { opacity?: number; backgroundColor?: unknown; borderColor?: unknown; borderWidth?: number }
  >();

  let hovered: UiNode | null = null;
  let pressed: UiNode | null = null;
  let focused: UiNode | null = null;

  function isVisualNode(node: UiNode | null): boolean {
    return node !== null && (node.type === UiNodeType.Box || node.type === UiNodeType.Button);
  }

  function mark(node: UiNode | null): void {
    if (node !== null) {
      playground.graph.markDirty(node, DirtyFlags.Properties);
    }
  }

  function setOpacity(node: UiNode, opacity: number): void {
    const rec = originals.get(node) ?? {};
    if (!('opacity' in rec)) {
      rec.opacity = (node.getProperty('opacity') as number | undefined) ?? 1;
      originals.set(node, rec);
    }
    node.setProperty('opacity', opacity);
    mark(node);
  }

  function restoreOpacity(node: UiNode): void {
    const rec = originals.get(node);
    const value = rec?.opacity ?? 1;
    node.setProperty('opacity', value);
    mark(node);
  }

  function setBackground(node: UiNode, color: string): void {
    const rec = originals.get(node) ?? {};
    if (!('backgroundColor' in rec)) {
      rec.backgroundColor = node.getProperty('backgroundColor');
      originals.set(node, rec);
    }
    node.setProperty('backgroundColor', color);
    mark(node);
  }

  function restoreBackground(node: UiNode): void {
    const rec = originals.get(node);
    node.setProperty('backgroundColor', rec?.backgroundColor);
    mark(node);
  }

  function setBorder(node: UiNode, color: string, width: number): void {
    const rec = originals.get(node) ?? {};
    if (!('borderColor' in rec)) {
      rec.borderColor = node.getProperty('borderColor');
    }
    if (!('borderWidth' in rec)) {
      rec.borderWidth = (node.getProperty('borderWidth') as number | undefined) ?? 0;
    }
    originals.set(node, rec);
    node.setProperty('borderColor', color);
    node.setProperty('borderWidth', width);
    mark(node);
  }

  function restoreBorder(node: UiNode): void {
    const rec = originals.get(node);
    node.setProperty('borderColor', rec?.borderColor);
    node.setProperty('borderWidth', rec?.borderWidth ?? 0);
    mark(node);
  }

  function setHover(next: UiNode | null): void {
    if (hovered === next) {
      return;
    }
    if (isVisualNode(hovered)) {
      restoreOpacity(hovered!);
    }
    hovered = next;
    if (isVisualNode(hovered)) {
      setOpacity(hovered!, 0.7);
    }
  }

  function setPressed(next: UiNode | null): void {
    if (pressed === next) {
      return;
    }
    if (pressed !== null) {
      restoreBackground(pressed);
    }
    pressed = next;
    if (isVisualNode(pressed)) {
      setBackground(pressed!, '#f59e0b');
    }
  }

  function setFocus(next: UiNode | null): void {
    if (focused === next) {
      return;
    }
    if (focused !== null) {
      restoreBorder(focused);
    }
    focused = next;
    if (isVisualNode(focused)) {
      setBorder(focused!, '#f59e0b', 2);
    }
  }

  function updateFocusHighlight(): void {
    setFocus(focusManager.focusedNode);
  }

  dispatcher.addEventListener(root, UiEventType.PointerMove, () => {
    setHover(pointerController.hoveredNode);
  });

  dispatcher.addEventListener(root, UiEventType.PointerDown, event => {
    const target = (event as UiPointerEvent).target;
    setPressed(target);
  });

  dispatcher.addEventListener(root, UiEventType.PointerUp, () => {
    setPressed(null);
  });

  dispatcher.addEventListener(root, UiEventType.PointerCancel, () => {
    setPressed(null);
  });

  dispatcher.addEventListener(root, UiEventType.Click, event => {
    const target = (event as UiPointerEvent).target;
    post({ type: 'selected', text: target === null ? 'Click on empty space' : `Click on ${target.id}` });
  });

  dispatcher.addEventListener(root, UiEventType.KeyDown, event => {
    const keyEvent = event as UiKeyboardEvent;
    if (keyEvent.key === 'Tab') {
      keyEvent.preventDefault();
      if (keyEvent.modifiers.shift) {
        focusManager.focusPrevious();
      } else {
        focusManager.focusNext();
      }
      updateFocusHighlight();
    }
    const focusedId = focusManager.focusedNode?.id ?? 'none';
    post({ type: 'selected', text: `Key ${keyEvent.key} · focus=${focusedId}` });
  });

  dispatcher.addEventListener(root, UiEventType.Wheel, event => {
    const wheel = event as unknown as { deltaX: number; deltaY: number; target: UiNode | null };
    post({
      type: 'selected',
      text: `Wheel dx=${wheel.deltaX} dy=${wheel.deltaY} target=${wheel.target?.id ?? 'none'}`
    });
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(value, min));
}
