import { describe, expect, it } from 'vitest';

import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { LayoutEngine } from '../layout/LayoutEngine';
import { Constraints } from '../layout/LayoutTypes';
import { CharacterCountTextMeasurer } from '../layout/TextMeasurer';
import { UiHitTester } from '../input/UiHitTester';
import { resolveCursor } from '../input/UiInteraction';
import { noKeyModifiers } from '../input/UiInputEvent';
import { findMatchesIn } from '../find/TextFind';
import { buildSemanticsTree } from '../semantics/UiSemanticsTree';
import { UiSelectionController } from './UiSelectionController';
import { selectableTextNodes, selectableTextOf } from './UiSelectable';
import { linkHoverOf } from './UiTextLinks';

/**
 * Inline links, and everything that crosses a paragraph made of runs.
 *
 * 10px glyphs on a 10px font and a 12px line, so an x is a character
 * index times ten. The paragraph is one line, 210 wide:
 *
 *   'Read the guide first.'
 *    0        9    14
 *
 * with 'guide' (offsets 9 to 14, x 90 to 140) a link.
 */
const measurer = new CharacterCountTextMeasurer({ glyphWidth: 1 });

const SPANS = [
  { text: 'Read the ' },
  { text: 'guide', color: '#0a58ca', link: { href: '#guide', label: 'the guide' } },
  { text: ' first.' }
];

let scenes = 0;

function scene(spans: readonly unknown[] = SPANS) {
  const suffix = scenes++;
  const graph = new UiGraph();
  const engine = new LayoutEngine(measurer);
  const root = graph.createNode(`root${suffix}`, UiNodeType.Column);
  root.setProperty('width', 400);
  root.setProperty('height', 100);
  const para = graph.createNode(`para${suffix}`, UiNodeType.Text);
  para.setProperty('spans', spans);
  para.setProperty('fontSize', 10);
  para.setProperty('lineHeight', 12);
  graph.appendChild(root, para);
  engine.layout(root, Constraints.loose(400, 100));

  const clicked: string[] = [];
  const dirty: UiNode[] = [];
  const controller = new UiSelectionController(
    {
      recordFor: target => engine.recordFor(target),
      visibleBox: target => engine.visibleBox(target),
      measurer,
      markDirty: target => dirty.push(target),
      root: () => root,
      copy: () => {},
      blurEditable: () => {},
      now: () => 0
    },
    new UiHitTester(engine, root),
    { platform: 'other' }
  );
  return { graph, engine, root, para, controller, clicked, dirty };
}

/** The same paragraph with a handler that records that it ran. */
function clickableScene() {
  const clicked: string[] = [];
  const s = scene([
    { text: 'Read the ' },
    { text: 'guide', color: '#0a58ca', link: { href: '#guide', onClick: () => clicked.push('guide') } },
    { text: ' first.' }
  ]);
  return { ...s, clicked };
}

describe('inline links', () => {
  describe('hover', () => {
    it('lights the run the pointer is on and nothing else', () => {
      const s = scene();
      s.controller.pointerHover(s.para, 100, 6);
      expect(linkHoverOf(s.para)).toBe(1);
      s.controller.pointerHover(s.para, 20, 6);
      expect(linkHoverOf(s.para)).toBe(-1);
    });

    it('marks the node dirty only when the lit run changed', () => {
      const s = scene();
      s.controller.pointerHover(s.para, 100, 6);
      s.controller.pointerHover(s.para, 110, 6);
      expect(s.dirty).toEqual([s.para]);
    });

    it('unlights the run when the pointer leaves the paragraph', () => {
      const s = scene();
      s.controller.pointerHover(s.para, 100, 6);
      s.controller.pointerHover(null, 0, 500);
      expect(linkHoverOf(s.para)).toBe(-1);
    });

    it('shows a pointer cursor over the run and none beside it', () => {
      const s = scene();
      s.controller.pointerHover(s.para, 100, 6);
      expect(resolveCursor(s.para)).toBe('pointer');
      s.controller.pointerHover(s.para, 20, 6);
      expect(resolveCursor(s.para)).toBe(null);
    });
  });

  describe('activation', () => {
    it('runs the handler on a press released where it landed', () => {
      const s = clickableScene();
      s.controller.pointerDown(s.para, 100, 6, noKeyModifiers());
      s.controller.pointerUp();
      expect(s.clicked).toEqual(['guide']);
    });

    it('does not run it for a press on the prose beside the run', () => {
      const s = clickableScene();
      s.controller.pointerDown(s.para, 20, 6, noKeyModifiers());
      s.controller.pointerUp();
      expect(s.clicked).toEqual([]);
    });

    it('does not run it for a press that dragged a selection', () => {
      const s = clickableScene();
      s.controller.pointerDown(s.para, 100, 6, noKeyModifiers());
      s.controller.pointerMove(200, 6);
      s.controller.pointerUp();
      expect(s.clicked).toEqual([]);
      expect(s.controller.hasSelection).toBe(true);
    });

    it('reports the press as consumed so the selection is not the only answer', () => {
      const s = clickableScene();
      expect(s.controller.pointerDown(s.para, 100, 6, noKeyModifiers())).toBe(true);
    });
  });

  describe('the rest of the runtime sees one string', () => {
    it('selects and copies across runs', () => {
      const s = scene();
      s.controller.pointerDown(s.para, 50, 6, noKeyModifiers());
      s.controller.pointerMove(140, 6);
      expect(s.controller.selectedText()).toBe('the guide');
    });

    it('is found by find-in-page across a run boundary', () => {
      const s = scene();
      const matches = findMatchesIn(selectableTextNodes(s.root), selectableTextOf, 'the guide');
      expect(matches.map(match => [match.start, match.end])).toEqual([[5, 14]]);
    });

    it('reads the paragraph as prose around a link in the semantics mirror', () => {
      const s = scene();
      const records = [...buildSemanticsTree(s.root).values()];
      expect(records.map(record => [record.role, record.label])).toEqual([
        ['paragraph', undefined],
        [undefined, 'Read the '],
        ['link', 'the guide'],
        [undefined, ' first.']
      ]);
    });

    it('leaves a paragraph with no links as one record with its whole text', () => {
      const s = scene([{ text: 'Read the ' }, { text: 'guide', fontWeight: 'bold' }, { text: ' first.' }]);
      const records = [...buildSemanticsTree(s.root).values()];
      expect(records.map(record => [record.role, record.label])).toEqual([[undefined, 'Read the guide first.']]);
    });
  });
});
