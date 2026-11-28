import { UndoStack } from 'gesso-framework/worker';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { createMemoryRelay, type MemoryRelay } from './memoryRelay';
import { createRoom, type Room } from './room';
import { bindUndo } from './undo';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

const rooms: Room[] = [];
let relay: MemoryRelay | undefined;

afterEach(() => {
  for (const room of rooms.splice(0)) {
    room.destroy();
  }
  relay?.destroy();
  relay = undefined;
});

const local = (): Room => {
  const room = createRoom(new Y.Doc(), { network: null });
  rooms.push(room);
  return room;
};

const titles = (room: Room): string[] => room.doc.getArray<string>('titles').toArray();
const add = (room: Room, title: string, label = `Add ${title}`): void =>
  room.transact(label, () => room.doc.getArray<string>('titles').push([title]));

describe('bindUndo', () => {
  it('puts each labelled edit on the stack, and undoes and redoes it', () => {
    const room = local();
    const stack = new UndoStack();
    bindUndo(room, stack);

    add(room, 'one');
    add(room, 'two');

    expect(stack.undoLabel.value).toBe('Add two');
    stack.undo();
    expect(titles(room)).toEqual(['one']);
    expect(stack.undoLabel.value).toBe('Add one');
    expect(stack.redoLabel.value).toBe('Add two');

    stack.redo();
    expect(titles(room)).toEqual(['one', 'two']);
  });

  it('makes one entry of a run under the same label', () => {
    const room = local();
    const stack = new UndoStack();
    bindUndo(room, stack);

    for (const letter of ['h', 'e', 'y']) {
      add(room, letter, 'Typing');
    }
    add(room, '!', 'Punctuate');

    stack.undo();
    expect(titles(room)).toEqual(['h', 'e', 'y']);
    stack.undo();
    expect(titles(room)).toEqual([]);
    expect(stack.canUndo.value).toBe(false);
  });

  it('labels an edit made outside transact with the fallback', () => {
    const room = local();
    const stack = new UndoStack();
    bindUndo(room, stack, { label: 'Change' });

    room.doc.getArray<string>('titles').push(['raw']);

    expect(stack.undoLabel.value).toBe('Change');
  });

  it('undoes this person’s edit and leaves the other person’s standing', async () => {
    relay = createMemoryRelay();
    const ada = createRoom(new Y.Doc(), { transport: relay.transport('board'), network: null });
    const ben = createRoom(new Y.Doc(), { transport: relay.transport('board'), network: null });
    rooms.push(ada, ben);
    const adaStack = new UndoStack();
    bindUndo(ada, adaStack);
    await settle();

    add(ada, 'Ada wrote this');
    await settle();
    add(ben, 'Ben wrote this');
    await settle();
    expect(titles(ada)).toHaveLength(2);

    adaStack.undo();
    await settle();

    expect(titles(ada)).toEqual(['Ben wrote this']);
    expect(titles(ben)).toEqual(['Ben wrote this']);
    // A remote edit is never an entry on this person's stack.
    expect(adaStack.canUndo.value).toBe(false);
  });

  it('stops recording once disposed', () => {
    const room = local();
    const stack = new UndoStack();
    const bound = bindUndo(room, stack);
    add(room, 'before');
    bound.dispose();
    add(room, 'after');

    expect(stack.undoLabel.value).toBe('Add before');
    stack.undo();
    expect(titles(room)).toEqual(['before', 'after']);
  });

  it('refuses a room it did not make', () => {
    const fake = { doc: new Y.Doc() } as unknown as Room;
    expect(() => bindUndo(fake, new UndoStack())).toThrow('bindUndo needs a room made by createRoom.');
  });
});
