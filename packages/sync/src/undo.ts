import type { UndoStack } from 'gesso-framework/worker';
import * as Y from 'yjs';

import { SyncRoom, type Room } from './room';

export interface BindUndoOptions {
  /** What the undo covers: the whole document by default, or some of its types. */
  // oxlint-disable-next-line no-explicit-any -- the event handlers make `AbstractType` invariant.
  readonly scope?: Y.Doc | Y.AbstractType<any> | readonly Y.AbstractType<any>[];
  /**
   * Edits with the same label within this many ms become one entry, as
   * a run of keystrokes does. 500 by default, as `Y.UndoManager`.
   */
  readonly captureTimeout?: number;
  /** The label for an edit made outside `room.transact`. `Edit` by default. */
  readonly label?: string;
}

export interface BoundUndo {
  /** The Yjs undo manager underneath, for its events. Undo through the `UndoStack`, not through this. */
  readonly manager: Y.UndoManager;
  /** Stops recording. Entries already on the stack do nothing after this. */
  dispose(): void;
}

/**
 * Puts the room's local edits on an `UndoStack`, one entry per edit.
 *
 *   const undo = new UndoStack();
 *   bindUndo(room, undo);
 *   room.transact('Rename board', () => meta.set('name', name));
 *   undo.undo(); // the rename, and only the rename
 *
 * Undoing a shared document cannot be an inverse operation recorded by
 * hand, as `UndoStack` entries usually are: "put the old title back"
 * would also wipe out a title somebody else typed since. So each entry
 * calls `Y.UndoManager`, which removes this person's own change and
 * leaves everyone else's standing. The stack's labels, its menu cells
 * and Mod+Z work as they do for any other entry.
 *
 * Each `room.transact` with a new label starts a new entry. The same
 * label within `captureTimeout` extends the entry, which is how a run
 * of typing becomes one undo.
 */
export function bindUndo(room: Room, stack: UndoStack, options: BindUndoOptions = {}): BoundUndo {
  if (!(room instanceof SyncRoom)) {
    throw new Error('bindUndo needs a room made by createRoom.');
  }
  const scope = options.scope ?? room.doc;
  const manager = new Y.UndoManager(scope as Y.Doc, {
    captureTimeout: options.captureTimeout ?? 500,
    trackedOrigins: new Set<unknown>([null, room.origin])
  });
  const fallback = options.label ?? 'Edit';
  let replaying = false;
  let disposed = false;
  let lastLabel: string | null = null;

  const labelOf = (origin: unknown): string | null => {
    if (origin === room.origin) {
      return room.currentLabel ?? fallback;
    }
    return origin === null ? fallback : null;
  };

  const beforeTransaction = (transaction: Y.Transaction): void => {
    const label = labelOf(transaction.origin);
    if (label === null) {
      return;
    }
    if (label !== lastLabel) {
      manager.stopCapturing();
    }
    lastLabel = label;
  };
  room.doc.on('beforeTransaction', beforeTransaction);

  const replay = (step: () => void): void => {
    if (disposed) {
      return;
    }
    replaying = true;
    try {
      step();
    } finally {
      replaying = false;
      // What follows an undo starts its own entry, as it does on the stack.
      lastLabel = null;
    }
  };

  manager.on('stack-item-added', (event: { type: 'undo' | 'redo'; origin: unknown }) => {
    if (replaying || disposed || event.type !== 'undo') {
      return;
    }
    stack.push({
      label: lastLabel ?? fallback,
      undo: () => replay(() => manager.undo()),
      redo: () => replay(() => manager.redo())
    });
  });

  return {
    manager,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      room.doc.off('beforeTransaction', beforeTransaction);
      manager.clear();
      manager.destroy();
    }
  };
}
