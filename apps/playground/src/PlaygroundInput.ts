import {
  type UiNode,
  UiNodeType,
  DirtyFlags,
  UiInputDispatcher,
  UiEventType,
  UiPointerEvent,
  UiKeyboardEvent,
  UiHitTester,
  UiPointerController,
  UiWheelController,
  type ScrollSink,
  type ScrollContainerState,
  UiFocusManager,
  UiKeyboardController,
  UiPlatformAdapter,
  CanvasPlatformSurface
} from '@gesso/core';
import type { LayoutPlayground } from './LayoutPlayground';
import type { PlaygroundState } from './PlaygroundState';

export interface PlaygroundInputShell {
  updateSelected(text: string): void;
}

/**
 * Wires the full input layer to a playground preview surface.
 *
 * This is renderer-agnostic: it only needs the canvas element (for
 * pointer/wheel events) and the shared playground state/engine. The
 * same wiring works for the Canvas2D and WebGPU routes.
 */
export function wirePlaygroundInput(
  playground: LayoutPlayground,
  state: PlaygroundState,
  canvas: HTMLCanvasElement,
  shell: PlaygroundInputShell
): () => void {
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
      shell.updateSelected(node === null ? 'Pressed empty space' : `Pressed ${node.id}`);
    }
  });
  const wheelController = new UiWheelController(hitTester, dispatcher, createScrollSink(playground, state));
  const adapter = new UiPlatformAdapter({
    pointerController,
    wheelController,
    keyboardController
  });
  adapter.attach(new CanvasPlatformSurface(canvas));

  wireVisualFeedback(playground, dispatcher, pointerController, focusManager, shell);

  return () => {
    adapter.detach();
  };
}

export function rewireFocusableBoxes(root: UiNode): void {
  const visit = (node: UiNode): void => {
    if (node.type === UiNodeType.Box) {
      const bg = node.getProperty('backgroundColor');
      if (bg === '#1f6feb' || bg === '#6f42c1') {
        node.setProperty('focusable', true);
      }
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(root);
}

function createScrollSink(playground: LayoutPlayground, state: PlaygroundState): ScrollSink {
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
        state.scrollY$.next(clamp(record.scrollY + dy, 0, maxY));
      }
      if (dx !== 0) {
        const maxX = Math.max(0, record.contentWidth - record.width);
        node.setProperty('scrollX', clamp(record.scrollX + dx, 0, maxX));
        playground.graph.markDirty(node, DirtyFlags.Properties);
      }
    }
  };
}

function wireVisualFeedback(
  playground: LayoutPlayground,
  dispatcher: UiInputDispatcher,
  pointerController: UiPointerController,
  focusManager: UiFocusManager,
  shell: PlaygroundInputShell
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
    shell.updateSelected(target === null ? 'Click on empty space' : `Click on ${target.id}`);
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
    shell.updateSelected(`Key ${keyEvent.key} · focus=${focusedId}`);
  });

  dispatcher.addEventListener(root, UiEventType.Wheel, event => {
    const wheel = event as unknown as { deltaX: number; deltaY: number; target: UiNode | null };
    shell.updateSelected(`Wheel dx=${wheel.deltaX} dy=${wheel.deltaY} target=${wheel.target?.id ?? 'none'}`);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(value, min));
}
