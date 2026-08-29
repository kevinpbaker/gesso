import { describe, expect, it } from 'vitest';

import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { LayoutEngine } from '../layout/LayoutEngine';
import { Constraints } from '../layout/LayoutTypes';
import { CharacterCountTextMeasurer } from '../layout/TextMeasurer';
import { UiHitTester } from '../input/UiHitTester';
import { noModifiers, type UiModifiers } from '../input/UiInputEvent';
import { UiSelectionController } from './UiSelectionController';
import { selectionRangeOf } from './UiSelectable';

/**
 * 10px glyphs on a 10px font and a 12px line, so a click at x=25 on a
 * line is unambiguously between the second and third character.
 *
 * The page is a column of two paragraphs and a button, wide enough that
 * each paragraph is one line:
 *
 *   y  0..12   'hello world'   (110 wide)
 *   y 12..24   'second line'   (110 wide)
 *   y 24..36   button, label 'Save'
 */
const measurer = new CharacterCountTextMeasurer({ glyphWidth: 1 });

interface Scene {
  root: UiNode;
  first: UiNode;
  second: UiNode;
  label: UiNode;
  controller: UiSelectionController;
  copied: string[];
  blurred: number;
  dirty: UiNode[];
  press(node: UiNode | null, x: number, y: number, modifiers?: UiModifiers): void;
  drag(x: number, y: number): void;
}

function scene(): Scene {
  const graph = new UiGraph();
  const engine = new LayoutEngine(measurer);
  let ids = 0;
  const node = (type: UiNodeType, props: Record<string, unknown> = {}): UiNode => {
    const created = graph.createNode(`n${ids++}`, type);
    for (const [key, value] of Object.entries(props)) {
      created.setProperty(key, value);
    }
    return created;
  };

  const font = { fontSize: 10, lineHeight: 12 };
  const root = node(UiNodeType.Column, { width: 200, height: 200 });
  const first = node(UiNodeType.Text, { text: 'hello world', ...font });
  const second = node(UiNodeType.Text, { text: 'second line', ...font });
  const button = node(UiNodeType.Button);
  const label = node(UiNodeType.Text, { text: 'Save', ...font });
  graph.appendChild(button, label);
  graph.appendChild(root, first);
  graph.appendChild(root, second);
  graph.appendChild(root, button);
  engine.layout(root, Constraints.loose(200, 200));

  const copied: string[] = [];
  const dirty: UiNode[] = [];
  const state = { blurred: 0 };
  const hitTester = new UiHitTester(engine, root);
  const controller = new UiSelectionController(
    {
      recordFor: target => engine.recordFor(target),
      visibleBox: target => engine.visibleBox(target),
      measurer,
      markDirty: target => dirty.push(target),
      root: () => root,
      copy: text => copied.push(text),
      blurEditable: () => state.blurred++,
      now: () => 0
    },
    hitTester,
    { platform: 'other' }
  );

  return {
    root,
    first,
    second,
    label,
    controller,
    copied,
    get blurred() {
      return state.blurred;
    },
    dirty,
    press: (target, x, y, modifiers = noModifiers()) => controller.pointerDown(target, x, y, modifiers),
    drag: (x, y) => controller.pointerMove(x, y)
  };
}

function ranges(scene: Scene): (string | undefined)[] {
  return [scene.first, scene.second, scene.label].map(node => {
    const range = selectionRangeOf(node);
    return range === undefined ? undefined : `${range.start}-${range.end}`;
  });
}

describe('UiSelectionController', () => {
  describe('pointer', () => {
    it('selects within one node as the pointer drags across it', () => {
      const s = scene();
      s.press(s.first, 20, 5);
      expect(s.controller.hasSelection).toBe(false);
      s.drag(70, 5);
      expect(ranges(s)).toEqual(['2-7', undefined, undefined]);
      expect(s.controller.selectedText()).toBe('llo w');
    });

    it('selects backwards when the drag goes left', () => {
      const s = scene();
      s.press(s.first, 70, 5);
      s.drag(20, 5);
      expect(s.controller.selectedText()).toBe('llo w');
    });

    it('runs a selection across nodes in document order', () => {
      const s = scene();
      s.press(s.first, 60, 5);
      s.drag(30, 17);
      // The tail of the first paragraph, the head of the second, joined
      // by the break a reader would expect when pasting.
      expect(ranges(s)).toEqual(['6-11', '0-3', undefined]);
      expect(s.controller.selectedText()).toBe('world\nsec');
    });

    it('keeps the anchor when the drag turns back on itself', () => {
      const s = scene();
      s.press(s.first, 60, 5);
      s.drag(30, 17);
      s.drag(20, 5);
      expect(ranges(s)).toEqual(['2-6', undefined, undefined]);
    });

    it('extends to the nearest text when the pointer leaves it', () => {
      const s = scene();
      s.press(s.first, 60, 5);
      // Below every paragraph and past the right edge: the drag keeps
      // selecting to the end of the last one it can reach.
      s.drag(190, 190);
      expect(ranges(s)).toEqual(['6-11', '0-11', undefined]);
    });

    it('selects the word under a double press and the line under a third', () => {
      const s = scene();
      s.press(s.first, 25, 5);
      s.press(s.first, 25, 5);
      expect(s.controller.selectedText()).toBe('hello');
      s.press(s.first, 25, 5);
      expect(s.controller.selectedText()).toBe('hello world');
    });

    it('extends from the existing anchor when Shift is held', () => {
      const s = scene();
      s.press(s.first, 20, 5);
      s.press(s.second, 30, 17, { ...noModifiers(), shift: true });
      expect(ranges(s)).toEqual(['2-11', '0-3', undefined]);
    });

    it('clears on a press outside any text, and on empty space', () => {
      const s = scene();
      s.press(s.first, 20, 5);
      s.drag(70, 5);
      expect(s.controller.hasSelection).toBe(true);
      s.press(s.label, 10, 29);
      expect(s.controller.hasSelection).toBe(false);

      s.press(s.first, 20, 5);
      s.drag(70, 5);
      s.press(null, 500, 500);
      expect(s.controller.hasSelection).toBe(false);
    });

    it('never selects a button label', () => {
      const s = scene();
      s.press(s.label, 10, 29);
      s.drag(30, 29);
      expect(ranges(s)).toEqual([undefined, undefined, undefined]);
    });

    it('ends editing when a selection starts, so only one is lit', () => {
      const s = scene();
      s.press(s.first, 20, 5);
      expect(s.blurred).toBe(1);
    });

    it('stops extending after the pointer is released', () => {
      const s = scene();
      s.press(s.first, 20, 5);
      s.drag(70, 5);
      s.controller.pointerUp();
      s.drag(110, 5);
      expect(ranges(s)).toEqual(['2-7', undefined, undefined]);
    });

    it('repaints only the nodes whose range changed', () => {
      const s = scene();
      s.press(s.first, 20, 5);
      s.dirty.length = 0;
      s.drag(70, 5);
      expect(s.dirty).toEqual([s.first]);
      s.dirty.length = 0;
      s.drag(30, 17);
      // The first paragraph grew to its end and the second gained a head.
      expect(s.dirty).toEqual([s.first, s.second]);
    });
  });

  describe('keyboard', () => {
    const ctrl = { ...noModifiers(), ctrl: true };

    it('copies the selection', () => {
      const s = scene();
      s.press(s.first, 60, 5);
      s.drag(30, 17);
      expect(s.controller.handleKey('c', ctrl)).toBe(true);
      expect(s.copied).toEqual(['world\nsec']);
    });

    it('leaves copy alone when nothing is selected', () => {
      const s = scene();
      expect(s.controller.handleKey('c', ctrl)).toBe(false);
      expect(s.copied).toEqual([]);
    });

    it('selects every selectable node, button labels excepted', () => {
      const s = scene();
      expect(s.controller.handleKey('a', ctrl)).toBe(true);
      expect(ranges(s)).toEqual(['0-11', '0-11', undefined]);
      expect(s.controller.selectedText()).toBe('hello world\nsecond line');
    });

    it('clears on Escape, and only when there is something to clear', () => {
      const s = scene();
      expect(s.controller.handleKey('Escape', noModifiers())).toBe(false);
      s.controller.handleKey('a', ctrl);
      expect(s.controller.handleKey('Escape', noModifiers())).toBe(true);
      expect(s.controller.hasSelection).toBe(false);
    });

    it('ignores the same keys without the platform modifier', () => {
      const s = scene();
      s.controller.handleKey('a', ctrl);
      expect(s.controller.handleKey('c', noModifiers())).toBe(false);
      expect(s.controller.handleKey('a', noModifiers())).toBe(false);
      expect(s.copied).toEqual([]);
    });
  });

  describe('lifetime', () => {
    it('drops the selection when one of its nodes leaves the tree', () => {
      const s = scene();
      s.controller.handleKey('a', { ...noModifiers(), ctrl: true });
      expect(s.controller.hasSelection).toBe(true);
      s.controller.handleNodeRemoved(s.second);
      expect(s.controller.hasSelection).toBe(false);
      expect(selectionRangeOf(s.first)).toBeUndefined();
    });

    it('ignores a node that was never part of it', () => {
      const s = scene();
      s.controller.handleKey('a', { ...noModifiers(), ctrl: true });
      s.controller.handleNodeRemoved(s.label);
      expect(s.controller.hasSelection).toBe(true);
    });
  });
});
