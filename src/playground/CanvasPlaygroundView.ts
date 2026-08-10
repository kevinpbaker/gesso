import type { Observable } from 'rxjs';

import { UiAnimationFrameClock } from '../ui/scheduler';
import type { UiNode } from '../ui/graph/UiNode';
import { UiNodeType } from '../ui/graph/UiNodeType';
import { DirtyFlags } from '../ui/graph/DirtyFlags';
import { UiInputDispatcher } from '../ui/input/UiInputDispatcher';
import { UiEventType, UiPointerEvent, UiKeyboardEvent } from '../ui/input/UiInputEvent';
import { UiHitTester } from '../ui/input/UiHitTester';
import { UiPointerController } from '../ui/input/UiPointerController';
import { UiWheelController } from '../ui/input/UiWheelController';
import type { ScrollSink, ScrollContainerState } from '../ui/input/UiWheelController';
import { UiFocusManager } from '../ui/input/UiFocusManager';
import { UiKeyboardController } from '../ui/input/UiKeyboardController';
import { UiPlatformAdapter, CanvasPlatformSurface } from '../ui/input/UiPlatformAdapter';
import { CanvasPreview } from './CanvasPreview';
import { LayoutPlayground } from './LayoutPlayground';
import { mountPlaygroundShell, scrollStatsText } from './PlaygroundControls';
import { createDefinition } from './PlaygroundDefinition';
import { PlaygroundState } from './PlaygroundState';

/**
 * Route that proves the runtime works end-to-end: the same
 * playground scenes the DOM-box route shows are painted by the real
 * library renderer (Canvas2DRenderer) onto a canvas, sharing a
 * canvas-backed text measurer with the layout engine.
 *
 * This version also wires the full input layer: hit testing,
 * dispatch, pointer/wheel/keyboard controllers, focus management
 * and a platform adapter so user interactions (hover, press, click,
 * wheel scroll, Tab navigation) are visible on the canvas.
 *
 * Returns a dispose function so the hash router can swap routes.
 */
export function mountCanvasPlayground(host: HTMLElement): () => void {
  const state = new PlaygroundState();
  const shell = mountPlaygroundShell(host, state);

  const canvas = document.createElement('canvas');
  canvas.className = 'pg-canvas';
  canvas.tabIndex = 0;
  canvas.style.touchAction = 'none';
  shell.preview.appendChild(canvas);

  const preview = new CanvasPreview(canvas);
  const playground = new LayoutPlayground({
    clock: callback => new UiAnimationFrameClock(callback),
    textMeasurer: preview.textMeasurer
  });

  const structural: Observable<unknown>[] = [state.fitPreview$, state.order$, state.stressCount$];
  for (const subject of structural) {
    subject.subscribe(() => {
      playground.rebuild(createDefinition(state));
      rewireFocusableBoxes(playground.layoutRoot);
    });
  }

  playground.setOnUpdate(refresh);
  playground.build(createDefinition(state));
  rewireFocusableBoxes(playground.layoutRoot);

  // -------------------------------------------------------------------------
  // Input layer wiring
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Resize + render
  // -------------------------------------------------------------------------
  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        preview.setLogicalSize(width, height, window.devicePixelRatio);
        playground.relayout(width, height);
      }
    }
  });
  resizeObserver.observe(shell.preview);

  function refresh(): void {
    preview.render(playground.layoutRoot, playground.engine);
    const info = playground.inspect();
    shell.updateMetrics(playground.metrics());
    shell.updateScrollStats(scrollStatsText(info));
  }

  shell.updateSelected('Canvas input demo: hover, press, click, wheel-scroll and Tab are wired.');

  return () => {
    adapter.detach();
    resizeObserver.disconnect();
    playground.dispose();
  };
}

/**
 * Makes the colored demo boxes focusable so Tab navigation can visit
 * them. This keeps the declarative definition free of demo-specific
 * focus flags while still showing keyboard focus on the canvas route.
 */
function rewireFocusableBoxes(root: UiNode): void {
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
  shell: { updateSelected(text: string): void }
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
  return Math.min(max, Math.max(min, value));
}
