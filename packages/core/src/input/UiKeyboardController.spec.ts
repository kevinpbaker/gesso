import { describe, expect, it, vi } from 'vitest';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { UiEventType } from './UiInputEvent';
import { InputTestHarness } from './UiInputTestUtils';
import { UiFocusManager } from './UiFocusManager';
import { UiKeyboardController } from './UiKeyboardController';

function setup(): {
  h: InputTestHarness;
  btn1: UiNode;
  btn2: UiNode;
  focusManager: UiFocusManager;
  keyboard: UiKeyboardController;
} {
  const h = new InputTestHarness();
  const btn1 = h.node('btn1', UiNodeType.Button, { width: 200, height: 40 });
  const btn2 = h.node('btn2', UiNodeType.Button, { width: 200, height: 40 });
  h.add(h.root, btn1, btn2);
  h.layoutTree();
  const focusManager = h.createFocusManager();
  const keyboard = new UiKeyboardController(h.dispatcher, focusManager, h.root);
  return { h, btn1, btn2, focusManager, keyboard };
}

describe('UiKeyboardController', () => {
  it('dispatches KeyDown to the focused node and bubbles', () => {
    const { h, btn1, focusManager, keyboard } = setup();
    focusManager.focus(btn1);
    const keyDown = vi.fn();
    const rootKey = vi.fn();
    h.dispatcher.addEventListener(btn1, UiEventType.KeyDown, keyDown);
    h.dispatcher.addEventListener(h.root, UiEventType.KeyDown, rootKey);

    keyboard.keyDown('Enter');

    expect(keyDown).toHaveBeenCalledTimes(1);
    expect(keyDown.mock.calls[0][0].target).toBe(btn1);
    expect(rootKey).toHaveBeenCalledTimes(1);
  });

  it('presses a focused button on Enter and on Space, as a click', () => {
    const { h, btn1, focusManager, keyboard } = setup();
    focusManager.focus(btn1);
    const click = vi.fn();
    h.dispatcher.addEventListener(btn1, UiEventType.Click, click);

    expect(keyboard.keyDown('Enter').defaultPrevented).toBe(true);
    expect(keyboard.keyDown(' ').defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledTimes(2);
    expect(click.mock.calls[0][0].target).toBe(btn1);

    // A key the button's own handler claimed is not also a press.
    h.dispatcher.addEventListener(btn1, UiEventType.KeyDown, event => event.preventDefault());
    keyboard.keyDown('Enter');
    expect(click).toHaveBeenCalledTimes(2);

    // Other keys press nothing.
    keyboard.keyDown('a');
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('presses nothing that is not a button, or that is disabled', () => {
    const { h, btn1, focusManager, keyboard } = setup();
    const click = vi.fn();
    const plain = h.node('plain', UiNodeType.Box, { width: 10, height: 10, focusable: true });
    h.add(h.root, plain);
    h.dispatcher.addEventListener(plain, UiEventType.Click, click);
    focusManager.focus(plain);
    keyboard.keyDown('Enter');
    expect(click).not.toHaveBeenCalled();

    btn1.setProperty('disabled', true);
    h.dispatcher.addEventListener(btn1, UiEventType.Click, click);
    focusManager.focus(btn1);
    keyboard.keyDown('Enter');
    expect(click).not.toHaveBeenCalled();
  });

  it('routes KeyDown to the root when nothing is focused', () => {
    const { h, keyboard } = setup();
    const rootKey = vi.fn();
    h.dispatcher.addEventListener(h.root, UiEventType.KeyDown, rootKey);

    keyboard.keyDown('a');

    expect(rootKey).toHaveBeenCalledTimes(1);
  });

  it('routes unfocused keys to the node a root getter returns, and bubbles from there', () => {
    const { h, btn1 } = setup();
    const keyboard = new UiKeyboardController(h.dispatcher, h.createFocusManager(), () => btn1);
    const onButton = vi.fn();
    const onRoot = vi.fn();
    h.dispatcher.addEventListener(btn1, UiEventType.KeyDown, onButton);
    h.dispatcher.addEventListener(h.root, UiEventType.KeyDown, onRoot);

    keyboard.keyDown('Escape');

    expect(onButton).toHaveBeenCalledTimes(1);
    expect(onButton.mock.calls[0][0].target).toBe(btn1);
    expect(onRoot).toHaveBeenCalledTimes(1);
  });

  it('dispatches KeyUp to the focused node', () => {
    const { h, btn1, focusManager, keyboard } = setup();
    focusManager.focus(btn1);
    const keyUp = vi.fn();
    h.dispatcher.addEventListener(btn1, UiEventType.KeyUp, keyUp);

    keyboard.keyUp('Enter');

    expect(keyUp).toHaveBeenCalledTimes(1);
    expect(keyUp.mock.calls[0][0].target).toBe(btn1);
  });

  it('carries the key and modifiers on dispatched events', () => {
    const { h, btn1, focusManager, keyboard } = setup();
    focusManager.focus(btn1);
    const seen: { key: string; shift: boolean }[] = [];
    h.dispatcher.addEventListener(btn1, UiEventType.KeyDown, event => {
      const keyEvent = event as import('./UiInputEvent').UiKeyboardEvent;
      seen.push({ key: keyEvent.key, shift: keyEvent.modifiers.shift });
    });

    keyboard.keyDown('Tab', { shift: true, ctrl: false, alt: false, meta: false });

    expect(seen).toEqual([{ key: 'Tab', shift: true }]);
  });

  it('Tab moves focus to the next focusable node', () => {
    const { btn1, btn2, focusManager, keyboard } = setup();
    focusManager.focus(btn1);

    keyboard.keyDown('Tab');

    expect(focusManager.focusedNode).toBe(btn2);
  });

  it('Shift+Tab moves focus to the previous focusable node', () => {
    const { btn1, btn2, focusManager, keyboard } = setup();
    focusManager.focus(btn2);

    keyboard.keyDown('Tab', { shift: true, ctrl: false, alt: false, meta: false });

    expect(focusManager.focusedNode).toBe(btn1);
  });

  it('a defaultPrevented Tab does not navigate', () => {
    const { h, btn1, focusManager, keyboard } = setup();
    focusManager.focus(btn1);
    h.dispatcher.addEventListener(h.root, UiEventType.KeyDown, event => event.preventDefault());

    keyboard.keyDown('Tab');

    expect(focusManager.focusedNode).toBe(btn1);
  });

  it('does not navigate Tab when tab navigation is disabled', () => {
    const { h, btn1, focusManager } = setup();
    const keyboard = new UiKeyboardController(h.dispatcher, focusManager, h.root, {
      tabNavigation: false
    });
    focusManager.focus(btn1);

    keyboard.keyDown('Tab');

    expect(focusManager.focusedNode).toBe(btn1);
  });
});
