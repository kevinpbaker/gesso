import { describe, expect, it } from 'vitest';

import { EditableTextModel } from './EditableTextModel';

describe('EditableTextModel', () => {
  describe('selection', () => {
    it('starts empty with a caret at 0', () => {
      const model = new EditableTextModel();
      expect(model.text).toBe('');
      expect(model.collapsed).toBe(true);
      expect(model.focus).toBe(0);
    });

    it('clamps offsets to the text', () => {
      const model = new EditableTextModel('abc');
      model.select(-5, 99);
      expect(model.start).toBe(0);
      expect(model.end).toBe(3);
    });

    it('keeps anchor and focus apart from start and end', () => {
      const model = new EditableTextModel('hello');
      model.select(4, 1);
      expect(model.anchor).toBe(4);
      expect(model.focus).toBe(1);
      expect(model.start).toBe(1);
      expect(model.end).toBe(4);
      expect(model.selectedText).toBe('ell');
    });

    it('bumps version on selection change only when something changed', () => {
      const model = new EditableTextModel('abc');
      const before = model.version;
      model.select(0);
      expect(model.version).toBe(before);
      model.select(1);
      expect(model.version).toBe(before + 1);
    });
  });

  describe('moving', () => {
    it('steps by grapheme, never splitting a surrogate pair', () => {
      const model = new EditableTextModel('a😀b');
      model.select(1);
      model.move('grapheme', 1, false);
      expect(model.focus).toBe(3);
      model.move('grapheme', -1, false);
      expect(model.focus).toBe(1);
    });

    it('collapses a range toward the direction of a plain move', () => {
      const model = new EditableTextModel('hello');
      model.select(1, 4);
      model.move('grapheme', -1, false);
      expect(model.focus).toBe(1);
      model.select(1, 4);
      model.move('grapheme', 1, false);
      expect(model.focus).toBe(4);
    });

    it('extends from the anchor with shift', () => {
      const model = new EditableTextModel('hello');
      model.select(2);
      model.move('grapheme', 1, true);
      model.move('grapheme', 1, true);
      expect(model.anchor).toBe(2);
      expect(model.focus).toBe(4);
    });

    it('moves by word over spaces and punctuation', () => {
      const model = new EditableTextModel('one, two  three');
      model.move('word', 1, false);
      expect(model.focus).toBe(3);
      model.move('word', 1, false);
      expect(model.focus).toBe(8);
      model.move('word', 1, false);
      expect(model.focus).toBe(15);
      model.move('word', -1, false);
      expect(model.focus).toBe(10);
      model.move('word', -1, false);
      expect(model.focus).toBe(5);
    });

    it('moves to the hard line ends and the document ends', () => {
      const model = new EditableTextModel('ab\ncd\nef');
      model.select(4);
      model.move('line', -1, false);
      expect(model.focus).toBe(3);
      model.move('line', 1, false);
      expect(model.focus).toBe(5);
      model.move('document', 1, false);
      expect(model.focus).toBe(8);
      model.move('document', -1, false);
      expect(model.focus).toBe(0);
    });
  });

  describe('editing', () => {
    it('inserts at the caret and replaces a selection', () => {
      const model = new EditableTextModel('hello');
      model.select(5);
      model.insertText(' world');
      expect(model.text).toBe('hello world');
      expect(model.focus).toBe(11);
      model.select(0, 5);
      model.insertText('goodbye');
      expect(model.text).toBe('goodbye world');
      expect(model.collapsed).toBe(true);
      expect(model.focus).toBe(7);
    });

    it('deletes backward by grapheme, word and line', () => {
      const model = new EditableTextModel('one two😀');
      model.select(model.text.length);
      model.deleteBackward();
      expect(model.text).toBe('one two');
      model.deleteBackward('word');
      expect(model.text).toBe('one ');
      model.insertText('x\nyz');
      model.deleteBackward('line');
      expect(model.text).toBe('one x\n');
      model.deleteBackward('line');
      expect(model.text).toBe('one x');
    });

    it('deletes forward and the selection', () => {
      const model = new EditableTextModel('abcdef');
      model.select(0);
      model.deleteForward();
      expect(model.text).toBe('bcdef');
      model.select(1, 3);
      model.deleteForward();
      expect(model.text).toBe('bef');
      model.select(3);
      model.deleteForward();
      expect(model.text).toBe('bef');
    });

    it('does nothing at the edges', () => {
      const model = new EditableTextModel('a');
      model.select(0);
      model.deleteBackward();
      expect(model.text).toBe('a');
      expect(model.canUndo).toBe(false);
    });
  });

  describe('undo', () => {
    it('coalesces a run of typing into one entry and a run of backspaces into another', () => {
      const model = new EditableTextModel();
      for (const character of 'hello') {
        model.insertText(character);
      }
      expect(model.text).toBe('hello');
      model.deleteBackward();
      model.deleteBackward();
      expect(model.text).toBe('hel');
      expect(model.undo()).toBe(true);
      expect(model.text).toBe('hello');
      expect(model.undo()).toBe(true);
      expect(model.text).toBe('');
      expect(model.undo()).toBe(false);
    });

    it('breaks the group when the caret moves', () => {
      const model = new EditableTextModel();
      model.insertText('a');
      model.insertText('b');
      model.select(1);
      model.insertText('x');
      expect(model.text).toBe('axb');
      model.undo();
      expect(model.text).toBe('ab');
      model.undo();
      expect(model.text).toBe('');
    });

    it('redoes and drops redo history on a new edit', () => {
      const model = new EditableTextModel();
      model.insertText('a');
      model.breakUndoGroup();
      model.insertText('b');
      model.undo();
      expect(model.text).toBe('a');
      expect(model.redo()).toBe(true);
      expect(model.text).toBe('ab');
      model.undo();
      model.insertText('c');
      expect(model.redo()).toBe(false);
      expect(model.text).toBe('ac');
    });

    it('restores the selection of the undone state', () => {
      const model = new EditableTextModel('hello world');
      model.select(0, 5);
      model.insertText('bye');
      model.undo();
      expect(model.text).toBe('hello world');
      expect(model.start).toBe(0);
      expect(model.end).toBe(5);
    });
  });

  describe('composition', () => {
    it('replaces the composing range on every update and commits once', () => {
      const model = new EditableTextModel('ab');
      model.select(1);
      model.beginComposition();
      model.updateComposition('n', 1);
      expect(model.text).toBe('anb');
      expect(model.composition).toEqual({ start: 1, end: 2 });
      model.updateComposition('ni', 2);
      expect(model.text).toBe('anib');
      expect(model.focus).toBe(3);
      model.commitComposition('你');
      expect(model.text).toBe('a你b');
      expect(model.composing).toBe(false);
      expect(model.focus).toBe(2);
      // One undo entry for the whole composition.
      model.undo();
      expect(model.text).toBe('ab');
      expect(model.undo()).toBe(false);
    });

    it('starts by replacing the selection', () => {
      const model = new EditableTextModel('hello');
      model.select(1, 4);
      model.updateComposition('x');
      expect(model.text).toBe('hxo');
      model.cancelComposition();
      expect(model.text).toBe('hello');
      expect(model.start).toBe(1);
      expect(model.end).toBe(4);
    });

    it('treats a commit with no composition as an insertion', () => {
      const model = new EditableTextModel('a');
      model.select(1);
      model.commitComposition('é');
      expect(model.text).toBe('aé');
    });

    it('places the composition caret where the IME says', () => {
      const model = new EditableTextModel();
      model.updateComposition('abc', 1);
      expect(model.focus).toBe(1);
    });
  });

  describe('replaceText', () => {
    it('keeps the caret where it still fits and drops history', () => {
      const model = new EditableTextModel();
      model.insertText('hello');
      model.select(3);
      model.replaceText('hi');
      expect(model.text).toBe('hi');
      expect(model.focus).toBe(2);
      expect(model.canUndo).toBe(false);
    });

    it('is a no-op for equal text', () => {
      const model = new EditableTextModel();
      model.insertText('a');
      const version = model.version;
      model.replaceText('a');
      expect(model.version).toBe(version);
      expect(model.canUndo).toBe(true);
    });
  });

  /**
   * `**bold** text` with both pairs of markers hidden: the caret sees
   * `bold text`, and the markers are where it cannot stop.
   */
  describe('hidden text', () => {
    const source = '**bold** text';
    const hidden = [
      { start: 0, end: 2 },
      { start: 6, end: 8 }
    ];
    function marked(caret: number): EditableTextModel {
      const model = new EditableTextModel(source);
      model.setHidden(source, hidden);
      model.select(caret);
      return model;
    }

    it('crosses hidden text and one visible grapheme in a single step', () => {
      const model = marked(0);
      model.move('grapheme', 1, false);
      // Past the opening markers and the `b`.
      expect(model.focus).toBe(3);
      model.select(9);
      model.move('grapheme', -1, false);
      // Back over the space, stopping after the markers it came to.
      expect(model.focus).toBe(8);
      // Then over the markers and the `d`, in one press.
      model.move('grapheme', -1, false);
      expect(model.focus).toBe(5);
    });

    it('stops on the side of the hidden text nearest where it started', () => {
      const model = marked(5);
      model.move('grapheme', 1, false);
      // After the `d`, before the closing markers: typing here is still bold.
      expect(model.focus).toBe(6);
      model.move('grapheme', 1, false);
      // Over the markers and the space.
      expect(model.focus).toBe(9);
      model.select(3);
      model.move('grapheme', -1, false);
      // Before the `b`, after the opening markers.
      expect(model.focus).toBe(2);
    });

    it('goes past hidden text to the edge when nothing visible is left that way', () => {
      const model = marked(2);
      expect(model.atVisibleEdge(-1)).toBe(true);
      model.move('grapheme', -1, false);
      expect(model.focus).toBe(0);
      const end = new EditableTextModel('a**');
      end.setHidden('a**', [{ start: 1, end: 3 }]);
      end.select(1);
      expect(end.atVisibleEdge(1)).toBe(true);
      end.move('grapheme', 1, false);
      expect(end.focus).toBe(3);
    });

    it('moves by visible words', () => {
      const model = marked(0);
      model.move('word', 1, false);
      expect(model.focus).toBe(6);
      model.move('word', 1, false);
      expect(model.focus).toBe(13);
      model.move('word', -1, false);
      expect(model.focus).toBe(9);
      model.move('word', -1, false);
      expect(model.focus).toBe(2);
    });

    it('extends a selection over hidden text a step at a time', () => {
      const model = marked(9);
      model.move('grapheme', -1, true);
      model.move('grapheme', -1, true);
      expect(model.selectedText).toBe('d** ');
    });

    it('deletes the visible grapheme before the caret and keeps the hidden text', () => {
      const model = marked(8);
      model.deleteBackward();
      expect(model.text).toBe('**bol** text');
      expect(model.focus).toBe(5);
      model.deleteBackward();
      expect(model.text).toBe('**bo** text');
    });

    it('deletes the visible grapheme after the caret and keeps the hidden text', () => {
      const model = marked(0);
      model.deleteForward();
      expect(model.text).toBe('**old** text');
      model.setHidden(model.text, [
        { start: 0, end: 2 },
        { start: 5, end: 7 }
      ]);
      model.select(4);
      model.deleteForward();
      // `d`, not the markers after it.
      expect(model.text).toBe('**ol** text');
    });

    it('deletes nothing where nothing visible is left that way', () => {
      const model = marked(2);
      model.deleteBackward();
      expect(model.text).toBe(source);
    });

    it('deletes a visible word with the hidden text inside it, not at its ends', () => {
      const text = 'a **b**c';
      const model = new EditableTextModel(text);
      model.setHidden(text, [
        { start: 2, end: 4 },
        { start: 5, end: 7 }
      ]);
      model.select(8);
      model.deleteBackward('word');
      // The word is `bc`: the markers between its letters go with it,
      // the ones before it stay.
      expect(model.text).toBe('a **');
    });

    it('deletes a selection exactly as selected, hidden text and all', () => {
      const model = marked(0);
      model.select(0, 8);
      model.deleteBackward();
      expect(model.text).toBe(' text');
    });

    it('undoes a delete next to hidden text as one step', () => {
      const model = marked(8);
      model.deleteBackward();
      model.setHidden(model.text, [
        { start: 0, end: 2 },
        { start: 5, end: 7 }
      ]);
      model.deleteBackward();
      expect(model.text).toBe('**bo** text');
      model.undo();
      expect(model.text).toBe(source);
    });

    it('keeps an offset the application sets, and moves out of it on the next step', () => {
      const model = marked(1);
      expect(model.focus).toBe(1);
      // The nearer end, and the far one on a tie.
      expect(model.caretOffsetNear(1)).toBe(2);
      expect(model.caretOffsetNear(5)).toBe(5);
      model.move('grapheme', 1, false);
      expect(model.focus).toBe(3);
    });

    it('forgets the ranges once the text is not the one they were given for', () => {
      const model = marked(8);
      model.insertText('!');
      expect(model.hidden).toEqual([]);
      model.move('grapheme', -1, false);
      expect(model.focus).toBe(8);
    });

    it('composes at the caret, beside hidden text, without touching it', () => {
      const model = marked(6);
      model.beginComposition();
      model.updateComposition('er');
      expect(model.text).toBe('**bolder** text');
      model.commitComposition('er');
      expect(model.text).toBe('**bolder** text');
      expect(model.focus).toBe(8);
    });
  });
});
