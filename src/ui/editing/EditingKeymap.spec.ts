import { describe, expect, it } from 'vitest';

import { noModifiers, type UiModifiers } from '../input/UiInputEvent';
import { commandForKey } from './EditingKeymap';

const mods = (partial: Partial<UiModifiers>): UiModifiers => ({ ...noModifiers(), ...partial });

describe('commandForKey', () => {
  it('moves by grapheme with the arrows and extends with shift', () => {
    expect(commandForKey('ArrowLeft', noModifiers(), 'other', true)).toEqual({
      kind: 'move',
      unit: 'grapheme',
      direction: -1,
      extend: false
    });
    expect(commandForKey('ArrowRight', mods({ shift: true }), 'mac', true)).toEqual({
      kind: 'move',
      unit: 'grapheme',
      direction: 1,
      extend: true
    });
  });

  it('follows the platform for word and line moves', () => {
    expect(commandForKey('ArrowRight', mods({ ctrl: true }), 'other', true)).toMatchObject({ unit: 'word' });
    expect(commandForKey('ArrowRight', mods({ alt: true }), 'mac', true)).toMatchObject({ unit: 'word' });
    expect(commandForKey('ArrowRight', mods({ meta: true }), 'mac', true)).toMatchObject({ unit: 'line' });
    expect(commandForKey('ArrowUp', mods({ meta: true }), 'mac', true)).toMatchObject({ unit: 'document' });
    expect(commandForKey('ArrowUp', noModifiers(), 'other', true)).toMatchObject({ unit: 'vertical', direction: -1 });
    expect(commandForKey('Home', noModifiers(), 'other', true)).toMatchObject({ unit: 'line', direction: -1 });
    expect(commandForKey('End', mods({ ctrl: true }), 'other', true)).toMatchObject({ unit: 'document', direction: 1 });
  });

  it('deletes by grapheme, word and line', () => {
    expect(commandForKey('Backspace', noModifiers(), 'other', true)).toEqual({
      kind: 'delete',
      unit: 'grapheme',
      direction: -1
    });
    expect(commandForKey('Backspace', mods({ ctrl: true }), 'other', true)).toMatchObject({ unit: 'word' });
    expect(commandForKey('Backspace', mods({ alt: true }), 'mac', true)).toMatchObject({ unit: 'word' });
    expect(commandForKey('Backspace', mods({ meta: true }), 'mac', true)).toMatchObject({ unit: 'line' });
    expect(commandForKey('Delete', noModifiers(), 'other', true)).toMatchObject({ direction: 1 });
  });

  it('maps the edit shortcuts with the platform primary modifier', () => {
    expect(commandForKey('a', mods({ ctrl: true }), 'other', true)).toEqual({ kind: 'selectAll' });
    expect(commandForKey('a', mods({ meta: true }), 'mac', true)).toEqual({ kind: 'selectAll' });
    expect(commandForKey('z', mods({ ctrl: true }), 'other', true)).toEqual({ kind: 'undo' });
    expect(commandForKey('Z', mods({ ctrl: true, shift: true }), 'other', true)).toEqual({ kind: 'redo' });
    expect(commandForKey('y', mods({ ctrl: true }), 'other', true)).toEqual({ kind: 'redo' });
    expect(commandForKey('y', mods({ meta: true }), 'mac', true)).toBeNull();
    // Control on a Mac is not the primary modifier: nothing to do.
    expect(commandForKey('a', mods({ ctrl: true }), 'mac', true)).toBeNull();
  });

  it('inserts printable keys only when text comes from keys', () => {
    expect(commandForKey('a', noModifiers(), 'other', true)).toEqual({ kind: 'insert', text: 'a' });
    expect(commandForKey('😀', noModifiers(), 'other', true)).toEqual({ kind: 'insert', text: '😀' });
    expect(commandForKey('a', noModifiers(), 'other', false)).toBeNull();
    expect(commandForKey('Shift', noModifiers(), 'other', true)).toBeNull();
    expect(commandForKey('a', mods({ ctrl: true, alt: true }), 'other', true)).toBeNull();
  });

  it('turns Enter into a newline and leaves modified Enter alone', () => {
    expect(commandForKey('Enter', noModifiers(), 'other', true)).toEqual({ kind: 'newline' });
    expect(commandForKey('Enter', mods({ ctrl: true }), 'other', true)).toBeNull();
  });
});
