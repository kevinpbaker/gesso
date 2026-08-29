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
});
