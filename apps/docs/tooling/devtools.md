---
description: What @gesso/devtools gives you, how each tool is mounted, and why they are DOM over the canvas rather than drawn inside it.
---

# Devtools

A canvas application is opaque to the browser. The elements panel shows
one `<canvas>`, breakpoints land in a worker whose console the page
cannot read, and an exception leaves the last good frame on screen
looking like nothing happened. `@gesso/devtools` is four tools that
answer the questions the browser's own would have answered, and a fifth
that puts the answers where a developer already looks.

| Tool           | The question it answers                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Error overlay  | What threw, where, and what it cost the running application                                      |
| Node inspector | What is this thing under the pointer, and who decided its values                                 |
| Frame profiler | Where did the last three seconds of frames go                                                    |
| Action log     | What has this application done, and what did the screen look like then                           |
| Devtools panel | All of it, in a Chrome devtools tab or a pane: [the devtools panel](/tooling/the-devtools-panel) |

## They are DOM, over the canvas

Every one of the four is an element in a shadow root, appended to the
element the application was mounted into. None of them is drawn into
the scene. The panel is the exception, and it is outside the page
altogether.

That is deliberate, and the reason is the same in all four cases: a
panel drawn inside the scene would be part of the scene it is
describing. It would take part in layout, it would appear in the
inspector's own heatmap, and its own repaints would show up in the
profiler as work the application did. Keeping them outside the canvas
keeps the measurement honest.

They also mount over the app's element rather than the viewport,
because a Gesso application is not necessarily the whole page. This
site embeds several on one page.

## Turning them on

They are ordinary functions that take the host element. Nothing in the
framework knows they exist, and an application that never calls them
does not include them.

<<< @/src/examples/DevtoolsSetup.ts#panels

Each returns a handle with `dispose()`, and each is fed from the
application it is watching:

<<< @/src/examples/DevtoolsSetup.ts#app

The inspector and the profiler are read, not operated, so they take no
pointer events at all: the person is hovering the canvas underneath and
a panel that swallowed the pointer would erase the thing it exists to
show. The action log is the exception, because clicking a step is how
you use it.

<<< @/src/examples/DevtoolsSetup.ts#toggles

## The error overlay

The one to wire first, and the only one that is useful without being
switched on. A worker's uncaught exception reaches nothing by default:
the frame that threw was armed by a timer, so there is no message
handler to catch it, and the console it lands in belongs to a thread
the page cannot read.

<<< @/src/examples/DevtoolsSetup.ts#overlay

`report` has the exact shape `createApp` wants for `onError`, which is
why it is passed by reference above. `captureWindowErrors()` adds the
main thread's own uncaught errors, and returns the function that
detaches them again.

Every error carries a source, and the overlay says what each one costs
the application that is still running:

| Source     | What it means                                                                    |
| ---------- | -------------------------------------------------------------------------------- |
| `message`  | A component threw while handling a message from the shell                        |
| `uncaught` | Nothing caught it: it happened during a frame, so what is on screen may be stale |
| `renderer` | The backend could not draw                                                       |
| `listener` | An event handler threw; the rest of the frame was unaffected                     |
| `channel`  | A command or a projection failed on the other side of a barrier                  |
| `window`   | The host page threw, outside any Gesso code                                      |

Stacks are mapped through the source maps the overlay decodes itself,
and the failing line is quoted with a caret under the column.

## In a production build

Do not ship them. They are development tooling: the profiler keeps a
few seconds of frames, the action log keeps every command and patch,
and the inspector turns on the layout engine's measure trace, which the
engine otherwise does not pay for.

The honest arrangement is the one every bundler already supports:

```ts
if (import.meta.env.DEV) {
  const { mountErrorOverlay } = await import('@gesso/devtools');
  // ...
}
```

A dynamic import inside a `DEV` branch leaves the package out of the
production bundle entirely, and it is what
[`@gesso/vite-plugin`](/tooling/vite-plugin) emits for the overlay if
you let it. What a shipped build should do with the reports instead is
[reporting errors](/tooling/reporting-errors).

## What they do not do

None of the four can change the running application. The inspector
reports a node and cannot edit it; the action log can put the view back
to an earlier moment but cannot rewind the store that produced it; the
profiler measures and does not sample a stack. Each page below says
where its own limits are.
