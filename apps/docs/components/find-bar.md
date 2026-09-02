---
description: 'FindBar: the bar Ctrl+F opens over a Gesso app, stepping the matches a find session found.'
---

# FindBar

The bar a find session shows. Declare one near the root of a screen and
Ctrl/Cmd+F has somewhere to go: a field, a count of what it matched,
and buttons that step through the matches and close the session.

Reach for it in any app with more text on screen than a reader wants to
scan by eye, which is most of them. The browser's own find bar cannot
help here, because a canvas has no document for it to search, so
finding text in a Gesso app is the app's job and this is the part of it
you do not have to write. Every application that wanted find used to
write the same forty lines; the playground's own version was
seventy-six, and deleting it is why this component exists.

For the search itself, what counts as a match and what an active match
does to the selection, see [find](/interaction/find). This page is the
bar.

<LiveExample id="findbar" height="300" />

<<< @/src/examples/FindBarExample.tsx#findbar

Press the button, or Ctrl/Cmd+F with the canvas focused, and search for
`canvas`. Enter steps forward, Shift+Enter steps back, and Escape
closes the session.

## Props

| Prop          | Type     | Default          | What it does                                     |
| ------------- | -------- | ---------------- | ------------------------------------------------ |
| `inset`       | `number` | `12`             | Distance from the top and right edges.           |
| `placeholder` | `string` | `'Find on page'` | The prompt in the query field while it is empty. |

Both are read once, when the component is built, so pass plain values.
`FindBar` takes none of the shared layout props: it places itself.

There is nothing else to configure, and no `open` prop. The bar is
bound to the find session, which is the framework's, so there is
nothing for the application to own.

## Where to put it

`FindBar` positions itself absolutely against the nearest positioned
ancestor, at `inset` from the top and right edges. Put it at the root
of the screen, in a box that is `position="relative"`, beside the
content rather than inside it:

```tsx
<box width={percent(100)} height={percent(100)} position="relative">
  {page}
  <FindBar />
</box>
```

Floating over the page rather than sitting in the flow is deliberate:
opening a find must not reflow the text the reader is looking for. The
spec beside the example asserts the first paragraph does not move when
a session opens.

Declare it once. There is one find session, so two bars would be two
views of it at the same inset, drawn on top of each other.

## Opening a session

The framework binds Ctrl/Cmd+F and Escape, so a session opens and
closes without anything in your screen listening for a key. The bar
shows itself for as long as one is running: `visible` is bound to the
session, so nothing conditionally renders it, and while it is hidden it
is out of the semantics tree as well.

Opening a session also puts the caret in the query field. The bar
registers that field with `FindService` through a `ref`, which is why
the caret lands there on the frame the session opens.

An application can open one itself:

```tsx
const find = ctx.inject(FindService);
<button label="Find" onClick={() => find.openFind()}>
  …
</button>;
```

The example does exactly that, and it has a reason to. In the render
worker the browser keeps Ctrl/Cmd+F for its own find bar unless the
shell is told to cancel it, which is `interceptFind: true` on
`createApp`. It is off by default, because taking the shortcut from an
app with no find bar would leave the reader with neither. This page's
example runs in an embedded canvas that does not set it, so the button
is the reliable way in here; an application that ships a `FindBar`
should turn the flag on.

## Keyboard

The bar is a row of ordinary tab stops: the query field, then the two
step buttons, then the close button. These keys are bound on the field.

| Key             | What it does               |
| --------------- | -------------------------- |
| `Enter`         | Goes to the next match     |
| `Shift`+`Enter` | Goes to the previous match |
| `Escape`        | Closes the session         |

Enter steps rather than submitting because a single line field has
nothing to submit to. Both directions wrap: the last match is followed
by the first.

Ctrl/Cmd+F and Escape are the framework's rather than the bar's, and
apply whether or not the bar has focus.

## Semantics

| What    | Value                                                                        |
| ------- | ---------------------------------------------------------------------------- |
| Role    | `search` on the bar, named `Find on page`                                    |
| Field   | `searchbox` named `Find`, whose value is the query                           |
| Buttons | `Previous match`, `Next match` and `Close find`, in that order               |
| Counter | Plain text, `n of m`, or `No results` when the query matched nothing         |
| Hidden  | While no session is running the bar is invisible and emits no records at all |

The glyphs on the buttons are `‹`, `›` and `✕`, and none of them is the
accessible name: each button carries a `label` that says what it does.

The count is a plain text node with no role of its own, so it is read
in order, when the reader reaches it, rather than interrupting with a
new total on every keystroke.

## What has been checked

The shortcut, the roles and names, typing a query and the count it
produces, stepping with Enter, Shift+Enter and both buttons, the wrap
at each end, closing from the button, and the page not moving when the
bar opens are asserted in the spec beside the example, against the real
runtime with a fake canvas.

Opening the bar by hand was checked in the playground rather than here,
in the render worker on WebGPU: Ctrl+F showed it and the active match
scrolled into view. That was in Chrome, which is the extent of what any
of this has been opened in.

## Next

[Find](/interaction/find) is the engine underneath: what it searches,
what it cannot reach, and what an active match does to the selection.
[TextInput](/components/text-input) is the field to reach for when the
text is being entered rather than searched for.
