---
description: 'Somewhere to put a drag down: typed payloads, drop zones that show their state, a list that reorders as the carried row crosses it, auto-scroll, and the shape a file dragged in from the desktop arrives in.'
---

# Drag and drop

`draggable` moves a node's transform and stops. That is enough for a
card that goes back where it was and nothing at all for a card that goes
somewhere, so every application that needed a drag to _mean_ something
wrote its own hit testing over its own coordinates. Segue's queue did,
over a row-height constant and a rounded division that were only correct
for rows of one fixed height.

Three modifiers replace that, over one session per graph.

## What is being carried

A payload is a type and some data:

```ts
interface UiDragPayload {
  readonly type: string;
  readonly data: unknown;
}
```

`type` is the application's own vocabulary, `'queue/track'` or
`'board/card'`, and a drop target says which types it accepts. Matching
on a string rather than on a class is not laziness: a file dragged in
from the desktop arrives as a message that crossed the worker barrier,
and a message cannot carry a prototype. Making the ordinary case plain
data is what lets the extraordinary one use the same road.

## A source, and a target

```ts
<box
  modifiers={[
    draggable({ keepOffset: false, dragging: { opacity: 0.7 } }),
    dragSource({ payload: { type: 'board/card', data: card.id } })
  ]}>
```

Two modifiers, because they are two jobs. `draggable` moves a node and
knows nothing about what it is; `dragSource` knows what is being carried
and moves nothing. Splitting them is also what lets a drag source be
something that does not move at all, like a swatch that stays put while
a colour is carried off it.

```ts
<column
  modifiers={[
    dropTarget({
      accepts: 'board/card',
      onDrop: payload => move(String(payload.data), 'done'),
      over: { borderColor: 'accent', backgroundColor: 'surfaceRaised' }
    })
  ]}>
```

`accepts` takes a type, a list of types, or a predicate for a zone whose
answer depends on the data. `onDrop` returns what the drop did
(`'move'`, `'copy'`, `'link'`), which the source hears; returning
nothing means `'move'`, which is what almost every drop is.

`over` is the state a drop zone has to show. It is written by the
modifier rather than left to the application because the state is the
modifier's: an application cannot see "something I would take is over
me" without keeping a second copy of the drag.

The zone reports `layoutBox()`, which is where the node is _seen_, so a
row scrolled half off the top of a list is half a drop target, exactly
as it looks.

### Which zone wins

The deepest zone whose box contains the point and that accepts the
payload, breaking a tie by registration order. Depth rather than paint
order, because a drop target is a region rather than a drawing: a row
inside a list is inside the list, and dropping on the row is the more
specific answer. A zone that will not take the payload is passed over
rather than blocking the one behind it, so a page of mixed zones behaves
the way a person expects.

## The drop reports back

```ts
dragSource({
  payload: () => ({ type: 'board/card', data: card.id }),
  onEnd: (result, velocity) => {
    if (result === null) {
      // Let go over nothing that would take it: spring it home at the
      // speed it was travelling.
      spring(offset, 0, { velocity: velocity.y });
    }
  }
});
```

`result` is null when the drag was let go over nothing, which is the
case the source has to handle by putting the node back. `velocity` is
pixels per second, from the gesture that ended, ready for the spring
that catches it.

## A list that reorders

```ts
reorderable({ list: 'queue', index, onMove: (from, to) => queue.move(from, to) });
```

One modifier on the row rather than a component around the list, because
a reorderable list is not a widget: it is a list whose rows happen to be
draggable, and every application's rows look different. The row is a
drag source and a drop target at once over the same session, so a row
that hears an accepted payload enter it knows both indices and calls
`onMove` immediately.

The order commits **as the drag crosses each row**, not at the end. What
is on screen is then always the real order rather than a preview of one,
there is no second "committed" order to keep in step, and a drag
abandoned half way leaves something coherent behind. Put
[`animateLayout`](/appearance/motion) on the rows that are not being
carried and the FLIP is the framework's.

The carried row is placed from its own layout box, not from how far the
pointer has moved. The obvious way, translating by the pointer's travel,
works until the first reorder, at which point the row has _also_ been
moved by the layout and the two movements add up, so the row runs away
from the finger at twice the speed. Holding the grab point instead makes
the placement `pointer - grab - layoutBox().y`, recomputed on every move
and on every layout, which corrects itself on the frame the reorder
happens and needs no row-height constant.

A crossing waits for the layout it caused. Two pointer moves inside one
frame would otherwise have the second decided against boxes the first
has already invalidated.

## Auto-scroll

```ts
dropTarget({ accepts: 'gesso/reorder', onDrop: () => 'move', autoScroll: { edge: 40, speed: 700 } });
```

On a scroll container, a drag held near an edge scrolls it. It has to be
driven by a timer rather than by pointer movement, because the gesture a
person makes is to hold the card still at the top of the list and wait,
which produces no pointer events at all. Without it the only rows a
long list can reach are the ones already on screen.

## Files dragged in from the desktop

A file drop arrives from the shell as plain data, in the same four
phases a drag inside the application goes through:

```ts
interface UiFileDropMessage {
  readonly type: 'fileDrop';
  readonly phase: 'enter' | 'over' | 'leave' | 'drop';
  readonly x: number;
  readonly y: number;
  readonly files: readonly UiDroppedFile[];
}

interface UiDroppedFile {
  readonly name: string;
  readonly mediaType: string;
  readonly size: number;
  readonly lastModified: number;
  readonly bytes?: ArrayBuffer;
}
```

Every field is plain data, because recognition belongs in the render
worker and the shell is holding a `File` object it cannot send. The
bytes are an `ArrayBuffer` so a large file is transferred rather than
copied, and they are optional because the platform lets a page read only
the names and types until the drop actually happens.

`UiDragSession.applyFileDrop` turns the message into an ordinary drag,
so a zone written for the payload type `gesso/files` is a zone like any
other and never learns where the drag came from:

```ts
dropTarget({
  accepts: 'gesso/files',
  onDrop: payload => {
    for (const file of payload.data as readonly UiDroppedFile[]) {
      importFile(file);
    }
    return 'copy';
  }
});
```

Both browser shells post the message: `createApp`'s worker shell and
`createSyncApp`'s single-thread one listen for `dragenter`, `dragover`,
`dragleave` and `drop` on the canvas, for drags that carry files and
no others. While a drag is in flight the browser lets a page see each
file's type and nothing more, so `name` is empty and `bytes` absent
until the drop, when the files arrive whole; the worker shell
transfers their buffers rather than copying them.
