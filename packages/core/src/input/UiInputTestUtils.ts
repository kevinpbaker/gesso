import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { Constraints } from '../layout/LayoutTypes';
import { LayoutHarness } from '../layout/LayoutTestUtils';
import { UiHitTester } from './UiHitTester';
import { UiInputDispatcher } from './UiInputDispatcher';
import { UiPointerController, type PointerControllerOptions } from './UiPointerController';
import { UiGestureRecognizer } from './UiGestureRecognizer';
import { UiTouchScroller, type TouchScrollerOptions } from './UiTouchScroller';
import { UiFocusManager } from './UiFocusManager';
import { UiKeyboardController } from './UiKeyboardController';
import { UiWheelController, type ScrollContainerState, type ScrollSink } from './UiWheelController';
import { UiPlatformAdapter, type PlatformEventTarget, type PlatformSurface } from './UiPlatformAdapter';
import type { TextMeasurer } from '../layout/TextMeasurer';

/**
 * Shared harness for input specs.
 *
 * Builds real UiNode trees through UiGraph + LayoutEngine so hit
 * testing, dispatch, focus and gestures are tested against actual
 * layout geometry rather than hand-written boxes.
 */
export class InputTestHarness {
  readonly layout: LayoutHarness;
  readonly root: UiNode;
  readonly dispatcher = new UiInputDispatcher();
  /** Shared, so a spec can read back what a controller scrolled. */
  readonly scrollSink = new HarnessScrollSink(this);

  /** A measurer is needed only by specs whose trees contain real text. */
  constructor(width = 400, height = 400, textMeasurer?: TextMeasurer) {
    this.layout = new LayoutHarness(textMeasurer);
    this.root = this.layout.createNode('app', UiNodeType.Column);
    this.root.setProperty('width', width);
    this.root.setProperty('height', height);
  }

  node(id: string, type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const node = this.layout.createNode(id, type);
    for (const [key, value] of Object.entries(props)) {
      node.setProperty(key, value);
    }
    return node;
  }

  add(parent: UiNode, ...children: UiNode[]): void {
    this.layout.append(parent, ...children);
  }

  layoutTree(): void {
    this.layout.layout(this.root, Constraints.loose(400, 400));
  }

  createHitTester(): UiHitTester {
    return new UiHitTester(this.layout.engine, this.root);
  }

  createPointerController(): UiPointerController {
    return new UiPointerController(this.createHitTester(), this.dispatcher);
  }

  createGestureRecognizer(): UiGestureRecognizer {
    return new UiGestureRecognizer(this.dispatcher);
  }

  createFocusManager(): UiFocusManager {
    return new UiFocusManager(this.root, this.dispatcher);
  }

  createKeyboardController(): UiKeyboardController {
    return new UiKeyboardController(this.dispatcher, this.createFocusManager(), this.root);
  }

  createWheelController(): UiWheelController {
    return new UiWheelController(this.createHitTester(), this.dispatcher, this.scrollSink);
  }

  /**
   * A pointer controller with a gesture recognizer behind it, for the
   * specs that need a real Pan rather than a hand-made one.
   */
  createGesturePointerController(options: PointerControllerOptions = {}): UiPointerController {
    return new UiPointerController(this.createHitTester(), this.dispatcher, {
      gestures: new UiGestureRecognizer(this.dispatcher),
      scrollSink: this.scrollSink,
      ...options
    });
  }

  createTouchScroller(options: TouchScrollerOptions = {}): UiTouchScroller {
    return new UiTouchScroller(this.dispatcher, this.root, this.scrollSink, options);
  }

  createPlatformAdapter(): UiPlatformAdapter {
    return new UiPlatformAdapter({
      pointerController: this.createPointerController(),
      wheelController: this.createWheelController(),
      keyboardController: this.createKeyboardController()
    });
  }

  box(node: UiNode): { x: number; y: number; width: number; height: number } {
    return this.layout.boxOf(node);
  }
}

/**
 * Minimal fake event target for testing the platform adapter.
 */
export class FakeEventTarget implements PlatformEventTarget {
  private readonly listeners: { type: string; listener: (event: Event) => void }[] = [];

  addEventListener(type: string, listener: ((event: Event) => void) | null): void {
    if (listener !== null) {
      this.listeners.push({ type, listener });
    }
  }

  removeEventListener(type: string, listener: ((event: Event) => void) | null): void {
    if (listener === null) return;
    const index = this.listeners.findIndex(entry => entry.type === type && entry.listener === listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  emit(type: string, event: Event): void {
    for (const entry of this.listeners) {
      if (entry.type === type) {
        entry.listener(event);
      }
    }
  }
}

/**
 * Fake PlatformSurface for tests. Emits DOM-like events from plain
 * objects so PointerEvent/WheelEvent/KeyboardEvent constructors are
 * not required in the test environment.
 */
export class FakePlatformSurface implements PlatformSurface {
  readonly pointerTarget = new FakeEventTarget();
  readonly keyboardTarget = new FakeEventTarget();
  localX = 0;
  localY = 0;

  clientToLocal(_clientX: number, _clientY: number): { x: number; y: number } {
    return { x: this.localX, y: this.localY };
  }
}

/**
 * ScrollSink backed by the harness LayoutEngine. Updates the
 * container's scrollX/scrollY properties, then re-lays out so the
 * engine re-reads and clamps the offset, mirroring how the app layer
 * drives scroll through node properties.
 */
export class HarnessScrollSink implements ScrollSink {
  /** Every scroll asked for, in order, so a spec can read the behaviour hint. */
  readonly calls: { node: UiNode; dx: number; dy: number; behavior: string }[] = [];
  /** Containers whose scrollbars were revealed. */
  readonly revealed: UiNode[] = [];

  constructor(private readonly harness: InputTestHarness) {}

  containerState(node: UiNode): ScrollContainerState | undefined {
    const record = this.harness.layout.engine.recordFor(node);
    if (record === undefined) {
      return undefined;
    }
    const horizontal = node.getProperty('direction') === 'row';
    return {
      scrollX: record.scrollX,
      scrollY: record.scrollY,
      maxScrollX: Math.max(0, record.contentWidth - record.width),
      maxScrollY: Math.max(0, record.contentHeight - record.height),
      horizontal,
      viewportWidth: record.width,
      viewportHeight: record.height
    };
  }

  scrollBy(node: UiNode, dx: number, dy: number, behavior: string = 'instant'): void {
    this.calls.push({ node, dx, dy, behavior });
    const record = this.harness.layout.engine.recordFor(node);
    if (record === undefined) {
      return;
    }
    const maxX = Math.max(0, record.contentWidth - record.width);
    const maxY = Math.max(0, record.contentHeight - record.height);
    node.setProperty('scrollX', clamp(record.scrollX + dx, 0, maxX));
    node.setProperty('scrollY', clamp(record.scrollY + dy, 0, maxY));
    this.harness.layoutTree();
  }

  revealScrollbars(node: UiNode): void {
    this.revealed.push(node);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
