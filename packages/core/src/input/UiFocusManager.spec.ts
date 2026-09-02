import { describe, expect, it, vi } from 'vitest';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { UiEventType } from './UiInputEvent';
import { InputTestHarness } from './UiInputTestUtils';
import { UiFocusManager } from './UiFocusManager';
import { UiPointerController } from './UiPointerController';

/**
 * A column stacking, top to bottom:
 *   btn1(0-40), box(40-80), btn2(80-120), btn3(120-160),
 *   disabled(160-200), focusableBox(200-240).
 *
 * Focusable in document order: btn1, btn2, btn3, focusableBox.
 * box is not focusable; disabled is inert.
 */
function setup(): {
  h: InputTestHarness;
  box: UiNode;
  btn1: UiNode;
  btn2: UiNode;
  btn3: UiNode;
  disabled: UiNode;
  focusableBox: UiNode;
  focusManager: UiFocusManager;
} {
  const h = new InputTestHarness();
  const btn1 = h.node('btn1', UiNodeType.Button, { width: 200, height: 40 });
  const box = h.node('box', UiNodeType.Box, { width: 200, height: 40 });
  const btn2 = h.node('btn2', UiNodeType.Button, { width: 200, height: 40 });
  const btn3 = h.node('btn3', UiNodeType.Button, { width: 200, height: 40 });
  const disabled = h.node('disabled', UiNodeType.Button, { width: 200, height: 40, disabled: true });
  const focusableBox = h.node('focusableBox', UiNodeType.Box, { width: 200, height: 40, focusable: true });
  h.add(h.root, btn1, box, btn2, btn3, disabled, focusableBox);
  h.layoutTree();
  const focusManager = h.createFocusManager();
  return { h, box, btn1, btn2, btn3, disabled, focusableBox, focusManager };
}

describe('focus visibility', () => {
  it('is visible for keyboard and programmatic focus, hidden after a pointer press, and back on the next key', () => {
    const { h, btn1, btn2, focusManager } = setup();
    const changes: [string | null, string][] = [];
    focusManager.onFocusChange((node, source) => changes.push([node?.id ?? null, source]));

    expect(focusManager.focusVisible).toBe(false);
    focusManager.focus(btn1);
    expect(focusManager.focusVisible).toBe(true);

    focusManager.focusOnPress(btn2);
    expect(focusManager.focusedNode).toBe(btn2);
    expect(focusManager.focusModality).toBe('pointer');
    expect(focusManager.focusVisible).toBe(false);

    // Focus given by code after a press stays hidden: the person is still on the mouse.
    focusManager.focus(btn1);
    expect(focusManager.focusVisible).toBe(false);

    // A key makes it visible, and the holder is told so it can redraw.
    focusManager.noteInput('keyboard');
    expect(focusManager.focusVisible).toBe(true);
    expect(changes[changes.length - 1]).toEqual(['btn1', 'keyboard']);

    // Saying the same thing twice reports nothing.
    const count = changes.length;
    focusManager.noteInput('keyboard');
    expect(changes.length).toBe(count);

    // A press on nothing focusable still hides the ring.
    focusManager.focusOnPress(h.root);
    expect(focusManager.focusedNode).toBe(btn1);
    expect(focusManager.focusVisible).toBe(false);
    expect(changes[changes.length - 1]).toEqual(['btn1', 'pointer']);
  });

  it('Tab moves focus as keyboard focus', () => {
    const { btn1, focusManager } = setup();
    focusManager.focusOnPress(btn1);
    expect(focusManager.focusVisible).toBe(false);
    focusManager.focusNext();
    expect(focusManager.focusVisible).toBe(true);
    expect(focusManager.focusModality).toBe('keyboard');
  });
});

describe('UiFocusManager', () => {
  it('focuses a focusable node and dispatches Focus to it', () => {
    const { h, btn1, focusManager } = setup();
    const focus = vi.fn();
    h.dispatcher.addEventListener(btn1, UiEventType.Focus, focus);

    expect(focusManager.focus(btn1)).toBe(true);

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.calls[0][0].relatedNode).toBeNull();
    expect(focusManager.focusedNode).toBe(btn1);
    expect(focusManager.hasFocus()).toBe(true);
  });

  it('refuses to focus non-focusable nodes', () => {
    const { h, box, focusManager } = setup();
    const focus = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.Focus, focus);

    expect(focusManager.focus(box)).toBe(false);
    expect(focus).not.toHaveBeenCalled();
    expect(focusManager.focusedNode).toBeNull();
  });

  it('refuses to focus inert nodes', () => {
    const { h, disabled, focusManager } = setup();
    const focus = vi.fn();
    h.dispatcher.addEventListener(disabled, UiEventType.Focus, focus);

    expect(focusManager.focus(disabled)).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it('moves focus with Blur on the old node then Focus on the new', () => {
    const { h, btn1, btn2, focusManager } = setup();
    focusManager.focus(btn1);
    const blur = vi.fn();
    const focus = vi.fn();
    h.dispatcher.addEventListener(btn1, UiEventType.Blur, blur);
    h.dispatcher.addEventListener(btn2, UiEventType.Focus, focus);

    expect(focusManager.focus(btn2)).toBe(true);

    expect(blur).toHaveBeenCalledTimes(1);
    expect(blur.mock.calls[0][0].relatedNode).toBe(btn2);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.calls[0][0].relatedNode).toBe(btn1);
    expect(focusManager.focusedNode).toBe(btn2);
  });

  it('focusing the focused node is a no-op', () => {
    const { h, btn1, focusManager } = setup();
    focusManager.focus(btn1);
    const focus = vi.fn();
    h.dispatcher.addEventListener(btn1, UiEventType.Focus, focus);

    expect(focusManager.focus(btn1)).toBe(true);
    expect(focus).not.toHaveBeenCalled();
  });

  it('blur drops focus and dispatches Blur with a null related node', () => {
    const { h, btn1, focusManager } = setup();
    focusManager.focus(btn1);
    const blur = vi.fn();
    h.dispatcher.addEventListener(btn1, UiEventType.Blur, blur);

    focusManager.blur();

    expect(blur).toHaveBeenCalledTimes(1);
    expect(blur.mock.calls[0][0].relatedNode).toBeNull();
    expect(focusManager.focusedNode).toBeNull();
    expect(focusManager.hasFocus()).toBe(false);
  });

  it('blur with no focus is a no-op', () => {
    const { focusManager } = setup();
    focusManager.blur();
    expect(focusManager.focusedNode).toBeNull();
  });

  it('focusNext walks focusables in document order and wraps', () => {
    const { btn1, btn2, btn3, focusableBox, focusManager } = setup();
    focusManager.focus(btn1);

    focusManager.focusNext();
    expect(focusManager.focusedNode).toBe(btn2);
    focusManager.focusNext();
    expect(focusManager.focusedNode).toBe(btn3);
    focusManager.focusNext();
    expect(focusManager.focusedNode).toBe(focusableBox);
    focusManager.focusNext();
    expect(focusManager.focusedNode).toBe(btn1);
  });

  it('focusNext from nothing focuses the first focusable', () => {
    const { btn1, focusManager } = setup();
    focusManager.focusNext();
    expect(focusManager.focusedNode).toBe(btn1);
  });

  it('focusPrevious from nothing focuses the last focusable', () => {
    const { focusableBox, focusManager } = setup();
    focusManager.focusPrevious();
    expect(focusManager.focusedNode).toBe(focusableBox);
  });

  it('focusPrevious walks backwards and wraps', () => {
    const { btn1, btn2, focusableBox, focusManager } = setup();
    focusManager.focus(btn2);

    focusManager.focusPrevious();
    expect(focusManager.focusedNode).toBe(btn1);
    focusManager.focusPrevious();
    expect(focusManager.focusedNode).toBe(focusableBox);
  });

  it('focusOnPress focuses only focusable targets', () => {
    const { box, btn2, focusManager } = setup();
    focusManager.focusOnPress(btn2);
    expect(focusManager.focusedNode).toBe(btn2);
    focusManager.blur();
    // `box` has no focusable ancestor either, so nothing is focused:
    // pressing the page background is not a request to blur.
    focusManager.focusOnPress(box);
    expect(focusManager.focusedNode).toBeNull();
  });

  it('says what moved focus, so only a keyboard reveals its target', () => {
    // The runtime scrolls the focused node into view, which keyboard
    // navigation cannot do without — a control the person cannot see is
    // a control they cannot use. A press is the opposite case: they can
    // already see what they pressed, it is under their cursor, and
    // revealing it scrolls the page out from under a pointer that is
    // still resting there. A half-visible 562px card scrolled 511px on
    // the press, which read as the card jumping up the screen.
    const { btn1, btn2, focusManager } = setup();
    const sources: string[] = [];
    focusManager.onFocusChange((_node, source) => sources.push(source));

    focusManager.focusOnPress(btn1);
    expect(sources).toEqual(['pointer']);

    // Everything else keeps the reveal: tab navigation, which reports
    // itself as the keyboard it is, and a component calling `focus()`
    // itself, which is what `element.focus()` does in a browser too.
    focusManager.focusNext();
    expect(focusManager.focusedNode).toBe(btn2);
    expect(sources).toEqual(['pointer', 'keyboard']);

    focusManager.focus(btn1);
    expect(sources).toEqual(['pointer', 'keyboard', 'program']);
  });

  it('focusOnPress walks up to the nearest focusable ancestor', () => {
    const { h, focusableBox, focusManager } = setup();
    // A container that is one tab stop — a tablist, a table — is
    // pressed through the content inside it, which is not focusable
    // itself. Without the walk the container never takes focus and its
    // arrow keys are dead after a mouse press.
    const inner = h.node('inner', UiNodeType.Box, { width: 100, height: 20 });
    const text = h.node('text', UiNodeType.Text, { text: 'Props' });
    h.add(focusableBox, inner);
    h.add(inner, text);
    h.layoutTree();

    focusManager.focusOnPress(text);

    expect(focusManager.focusedNode).toBe(focusableBox);
  });

  it('focuses via onPress after pointerdown, unless defaultPrevented', () => {
    const { h, btn1, btn2, focusManager } = setup();
    const controller = new UiPointerController(h.createHitTester(), h.dispatcher, {
      onPress: node => focusManager.focusOnPress(node)
    });

    controller.pointerDown(100, 20); // btn1
    expect(focusManager.focusedNode).toBe(btn1);
    controller.pointerUp(100, 20);

    focusManager.blur();
    h.dispatcher.addEventListener(btn2, UiEventType.PointerDown, event => event.preventDefault());
    controller.pointerDown(100, 100); // btn2
    expect(focusManager.focusedNode).toBeNull();
    controller.pointerUp(100, 100);

    // Pressing the plain box focuses nothing.
    controller.pointerDown(100, 60); // box
    expect(focusManager.focusedNode).toBeNull();
    controller.pointerUp(100, 60);
  });
});
