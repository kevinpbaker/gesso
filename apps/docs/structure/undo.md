---
description: 'An application-level undo stack: named transactions, coalescing, redo, and the one keyboard path that shares Mod+Z with a text field.'
---

# Undo and redo

`UndoStack` is a stack of named transactions. A component records what
it did and how to unmake it; a menu item, a button or a keyboard
shortcut drives the stack.

```ts
import { UndoStack } from 'gesso-framework';

const undo = ctx.inject(UndoStack);

queue.send.remove(at);
undo.push({
  label: `Remove ${track.title}`,
  undo: () => queue.send.addToQueue(track.id),
  redo: () => queue.send.remove(at)
});
```

Nothing in the stack listens to anything, and it knows nothing about
your state: the two functions are the whole of the coupling. That is
what lets it sit on either thread, and it is why it stays a helper
rather than becoming a data layer.

## Registering it

The stack is an ordinary service, so an application registers one and
every screen injects the same one:

```ts
renderRoot(AppRoot).useService(UndoStack);
```

An application that wants a stack per document makes its own with
`new UndoStack()` and passes it down instead.

## Write an entry as a position, not as a step

Each `undo` and `redo` should look its subject up at the moment it
runs and put it somewhere absolute:

```ts
const moveTo = (id: string, position: number): void => {
  const at = queue.view.order.value.indexOf(id);
  if (at !== -1 && at !== position) {
    queue.send.move({ from: at, to: position });
  }
};

undo.push({
  label: `Move ${track.title}`,
  coalesce: `move:${track.id}`,
  undo: () => moveTo(track.id, from),
  redo: () => moveTo(track.id, to)
});
```

"Put this row back at index 3" is still true after four more changes.
"Move it back by one" is not, and coalescing is what makes the
difference matter.

## Coalescing

A drag reports a crossing per row and a typed name reports a
keystroke. Neither is a change a person means to undo one step at a
time, so entries pushed one after another under the same `coalesce`
key become one entry: the first one's `undo`, the last one's `redo`,
and everything between them dropped.

That is a memory rule as much as a usability one. A stack that pushed
one entry per crossing would hold a hundred closures over a hundred
versions of the list by the time the pointer came up.

`endRun()` closes the run, so the next push starts its own entry
whatever its key. Call it when the gesture ends:

```ts
reorderable({
  list: 'queue',
  index,
  onMove: commit,
  onDragChange: dragging => {
    if (!dragging) {
      undo.endRun();
    }
  }
});
```

An `undo()` also ends the run, and so does a `transact`.

## Groups

`transact` is the other way of putting several changes under one
entry, for a change an application makes as several calls and a person
made as one press:

```ts
undo.transact('Tidy up', () => {
  for (const id of selected) {
    remove(id);
  }
});
```

Undoing runs the group's undos in reverse and redoing runs its redos
in order. Unlike coalescing, a group keeps every step, because a group
is written down as a group rather than discovered from a run of
similar pushes.

## Reading the stack

`canUndo`, `canRedo`, `undoLabel` and `redoLabel` are cells, so a menu
follows them:

```tsx
<Menu
  items={[
    {
      value: 'undo',
      label: computed(() => `Undo ${undo.undoLabel.value ?? ''}`),
      disabled: computed(() => !undo.canUndo.value)
    }
  ]}
/>
```

The labels change once per entry rather than once per push, so a menu
bound to them does not redraw sixty times during a drag.

## Keyboard

`registerUndoShortcuts` puts Mod+Z and Mod+Shift+Z (and Mod+Y) on the
application's shortcut registry, which is the same registry a command
palette lists:

```ts
const registry = new UiShortcutRegistry();
const focus = ctx.inject(FocusService);

ctx.onUnmount(
  registerUndoShortcuts({
    registry,
    stack: ctx.inject(UndoStack),
    focused: () => focus.focused.value,
    group: 'Edit'
  })
);
```

and the root element feeds the registry with `shortcuts({ registry })`.
See [Shortcuts](/interaction/shortcuts).

`focused` is not optional in practice. A text field has its own undo,
over its own text, and the keyboard controller applies an editable's
keys **after** the event has been dispatched, so a root shortcut would
otherwise take Mod+Z before the field ever saw it. Given a way to read
the focused node, the shortcut steps aside whenever focus is inside
something being typed into.

## Two undo stacks, and why

A `TextInput` keeps a stack of snapshots of its own string, and it has
to: only the field knows where the caret was, which run of typing
coalesces with which, and what an IME composition is doing.
`UndoStack` is a stack of inverse operations over whatever your
application's state is, and it cannot see inside a field at all.

They meet at one key press and the focused field wins. Undo in a field
undoes typing; undo everywhere else undoes the application's last
change.

## Optimistic writes

An undo of an optimistic change is another optimistic change, so it
composes with [`mutate`](/recipes/loading-and-saving) rather than
setting the cell behind it:

```ts
const like = mutate(this.liked, toggled, id => api.favourite(id));
const toggleLike = undoable(undo, like, id => id, { label: id => `Like ${id}` });
```

A commit that refuses records nothing: `mutate` has already put the
cell back, so the change did not happen and there is nothing to undo.

## What does not belong on the stack

A change whose subject is gone. Emptying a queue, closing a document,
replacing a signed-out account's library: every entry naming something
that no longer exists would be an undo of something the person cannot
see. Call `clear()` and forget the history, which is what a text model
does when its text is replaced outright.
