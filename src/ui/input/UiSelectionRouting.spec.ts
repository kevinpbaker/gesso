import { describe, expect, it } from 'vitest';

import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { CharacterCountTextMeasurer } from '../layout/TextMeasurer';
import { noKeyModifiers, UiEventType, type UiKeyModifiers } from './UiInputEvent';
import { InputTestHarness } from './UiInputTestUtils';
import { UiKeyboardController } from './UiKeyboardController';
import { UiPointerController } from './UiPointerController';

/**
 * The pointer and keyboard controllers route to a selection the same
 * way they route to an editable: after the app's own listeners, and
 * only when none of them cancelled the event. These specs use a
 * recording stand-in rather than the real controller, so what is tested
 * is the routing rule and not the selection behaviour.
 */
function recorder() {
  const calls: string[] = [];
  return {
    calls,
    selection: {
      pointerDown: (node: UiNode | null, x: number, y: number) => calls.push(`down:${node?.id ?? 'none'}@${x},${y}`),
      pointerMove: (x: number, y: number) => calls.push(`move:${x},${y}`),
      pointerUp: () => calls.push('up'),
      clear: () => calls.push('clear')
    }
  };
}

function scene(): { h: InputTestHarness; label: UiNode; field: UiNode } {
  const h = new InputTestHarness(400, 400, new CharacterCountTextMeasurer({ glyphWidth: 1 }));
  const label = h.node('label', UiNodeType.Text, { text: 'hello', fontSize: 10, lineHeight: 12 });
  const field = h.node('field', UiNodeType.EditableText, { value: 'typed', fontSize: 10, lineHeight: 12 });
  h.add(h.root, label, field);
  h.layoutTree();
  return { h, label, field };
}

describe('selection routing', () => {
  describe('pointer', () => {
    it('offers a press on text to the selection, and a drag with it', () => {
      const { h } = scene();
      const { calls, selection } = recorder();
      const pointer = new UiPointerController(h.createHitTester(), h.dispatcher, { selection });

      pointer.pointerDown(20, 5);
      pointer.pointerMove(40, 5, 1);
      pointer.pointerUp(40, 5);
      expect(calls).toEqual(['down:label@20,5', 'move:40,5', 'up']);
    });

    it('clears instead when the press landed on an editable', () => {
      const { h, field } = scene();
      const { calls, selection } = recorder();
      const pointer = new UiPointerController(h.createHitTester(), h.dispatcher, {
        selection,
        editing: {
          isEditable: node => node === field,
          pointerDown: () => calls.push('edit:down'),
          pointerMove: () => calls.push('edit:move'),
          pointerUp: () => calls.push('edit:up')
        }
      });

      pointer.pointerDown(20, 17);
      pointer.pointerMove(40, 17, 1);
      expect(calls).toEqual(['edit:down', 'clear', 'edit:move']);
    });

    it('clears on a press over empty space', () => {
      const { h } = scene();
      const { calls, selection } = recorder();
      const pointer = new UiPointerController(h.createHitTester(), h.dispatcher, { selection });
      h.root.setProperty('hitTestable', false);

      pointer.pointerDown(390, 390);
      expect(calls).toEqual(['down:none@390,390']);
    });

    it('stays out of the way when a listener cancelled the press', () => {
      const { h, label } = scene();
      const { calls, selection } = recorder();
      const pointer = new UiPointerController(h.createHitTester(), h.dispatcher, { selection });
      h.dispatcher.addEventListener(label, UiEventType.PointerDown, event => event.preventDefault());

      pointer.pointerDown(20, 5);
      pointer.pointerMove(40, 5, 1);
      expect(calls).toEqual([]);
    });

    it('releases the selection when the press is cancelled', () => {
      const { h } = scene();
      const { calls, selection } = recorder();
      const pointer = new UiPointerController(h.createHitTester(), h.dispatcher, { selection });

      pointer.pointerDown(20, 5);
      pointer.pointerCancel();
      expect(calls).toEqual(['down:label@20,5', 'up']);
    });
  });

  describe('keyboard', () => {
    function keyboard(h: InputTestHarness, handled: string[], claim: (key: string) => boolean) {
      return new UiKeyboardController(h.dispatcher, h.createFocusManager(), h.root, {
        selection: {
          handleKey: (key: string, _modifiers: UiKeyModifiers) => {
            handled.push(key);
            return claim(key);
          }
        }
      });
    }

    it('marks a key the selection claimed as handled', () => {
      const { h } = scene();
      const handled: string[] = [];
      const event = keyboard(h, handled, () => true).keyDown('c', { ...noKeyModifiers(), ctrl: true });
      expect(handled).toEqual(['c']);
      expect(event.defaultPrevented).toBe(true);
    });

    it('leaves Tab navigation alone when the selection passes', () => {
      const { h } = scene();
      const handled: string[] = [];
      const event = keyboard(h, handled, () => false).keyDown('Tab');
      expect(handled).toEqual(['Tab']);
      expect(event.defaultPrevented).toBe(false);
    });

    it('never sees a key a listener cancelled', () => {
      const { h } = scene();
      const handled: string[] = [];
      h.dispatcher.addEventListener(h.root, UiEventType.KeyDown, event => event.preventDefault());
      keyboard(h, handled, () => true).keyDown('c', { ...noKeyModifiers(), ctrl: true });
      expect(handled).toEqual([]);
    });
  });
});
