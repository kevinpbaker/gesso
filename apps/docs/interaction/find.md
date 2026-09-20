---
description: "Find in an application's own text: the bar, the session a component drives, what is searched and what is not, and how text opts in or out."
---

# Find

The browser's find bar searches the rendered DOM. A canvas has none, so
`Ctrl+F` over a Gesso application would open a bar that finds nothing,
and there is no API to hook into it. Find is therefore the
application's: an engine over the same text
[selection](/interaction/selection) already knows about, and a bar the
component library provides.

<LiveExample id="find" height="340" />

<<< @/src/examples/FindExample.tsx#page

## The bar

`FindBar` from `gesso-components` is the whole user interface. It
takes no wiring: it injects the session, shows itself while one is
open, searches on every keystroke, and steps through the matches.

| Prop          | Type     | Default          | What it does                       |
| ------------- | -------- | ---------------- | ---------------------------------- |
| `inset`       | `number` | `12`             | Distance from the top and right    |
| `placeholder` | `string` | `'Find on page'` | The query field's placeholder text |

It positions itself absolutely, so put it inside a
`position="relative"` box: opening a session then floats the bar over
the content rather than reflowing the page under it.

The counter beside the field reads `1 of 2` while there are matches and
`No results` when the query found none.

| Key           | In the bar         |
| ------------- | ------------------ |
| `Enter`       | Next match         |
| `Shift+Enter` | Previous match     |
| `Escape`      | Closes the session |

Enter is available because a single-line editable declines it: the
command is resolved and then handed back, so it stays an ordinary key
the application can answer. The two arrows and the close button do the
same three things with the pointer.

For assistive technology the bar is a `search` named "Find on page",
the field is a `searchbox` named "Find", and the buttons are named
"Previous match", "Next match" and "Close find".

## The session

`FindService` is the reactive face of the search, injected like any
other service. A bar that is not this one binds to the same four cells
and dispatches the same actions.

| State         | What it holds                                             |
| ------------- | --------------------------------------------------------- |
| `open`        | Whether a session is running; a bar shows itself for this |
| `query`       | The query the matches are for                             |
| `matchCount`  | How many there are                                        |
| `activeMatch` | Which one is active, 1-based for display, or 0 for none   |

| Action                     | What it does                                     |
| -------------------------- | ------------------------------------------------ |
| `openFind()`               | Starts a session and puts the caret in the field |
| `close()`                  | Ends it and drops the highlights                 |
| `search(query, matchCase)` | Runs a query and activates the first match       |
| `next()` / `previous()`    | Steps, wrapping at both ends                     |
| `refresh()`                | Re-runs the current query over the tree as it is |
| `setField(node)`           | Registers the query field, as a `ref`            |

`setField` is why opening a session can put the caret in the bar on the
frame it opens. An application's tree is built, and its `ref`s fire,
before the runtime installs the find controller, so the service holds
the node until there is a controller to hand it to.

## What is searched

The corpus is the node tree: every string a selection could cover, in
reading order. That means text opts in and out of find exactly as it
opts in and out of a selection, through
[`selectable`](/interaction/selection). The line in the example above
sets `selectable={false}`, so the word it shares with the two
paragraphs is not a third match.

It also means the bar cannot find itself. Its counter opts out, and its
query field is an editable rather than a `<text>`, which is not in the
corpus at all.

- **A match is found within one node, never across two.** A page of
  HTML matches across inline elements; a `<text>` is a paragraph rather
  than a span, so there is no seam to cross.
- **Matches do not overlap.** The scan resumes after each one, so "aa"
  in "aaa" is a single match, as it is in a browser.
- **Case is ignored** unless the search is given `matchCase`. The bar
  does not offer that; `FindService.search(query, true)` does.
- **Only drawn text counts.** A paragraph capped by `maxLines` shows
  part of itself, and a match in the part it does not show is dropped
  rather than counted, so `3 of 7` never includes something the person
  cannot be shown.

## The active match, and the rest

The active match is a real selection, made through the selection
controller rather than invented as a second kind of highlight. It
therefore looks like every other selection, `Ctrl/Cmd+C` copies it, and
revealing it uses the same scrolling any other reveal does: the
ancestors scroll until the match's first line is visible, with eight
pixels of room around it.

Every other match carries a softer highlight of its own, the theme's
`secondary` at 0.3 opacity against the selection's `primary` at 0.35,
overridable per node with `matchColor`. Both renderers draw the matches
first and the selection over them, so the active one reads as the
strongest thing on the page.

Stepping wraps at both ends, and `refresh()` keeps the person on the
match they were on when it survived the change, rather than sending
them back to the top.

## The shortcut

`Ctrl/Cmd+F` opens a session and Escape closes one, as keyboard
defaults beside the selection's. They run after the application's own
`onKeyDown` listeners, and find runs before the selection, so Escape
closes the bar and a second Escape drops the match it left selected.

Cancelling the browser's own `Ctrl+F` is the shell's decision, because
the worker's answer cannot come back in time to cancel a default.
`createApp` takes `interceptFind`, and it is off by default: taking the
shortcut from an application that has no find bar would leave the
person with neither.

```ts
createApp({ renderWorker: () => new Worker(url), interceptFind: true });
```

A single-thread application needs no flag. With the runtime on the main
thread the platform adapter cancels whatever the application claimed,
because there is no barrier in the way.

The example on this page runs in a render worker with the flag off, so
the button opens the session rather than the shortcut. That is also
what `openFind()` is for: a menu item, a toolbar button, or a
keystroke an application defines for itself.

## Limits

**Text that is not currently a node is not searched.** A
[lazy list](/components/lazy-list) materialises only its visible
window, so rows that have not been built have nothing to match. This is
the same reach an off-screen DOM mirror would have, and the engine
takes no supplementary source, so an application that wants its whole
dataset searched has to search the data itself.

**The matches do not follow content that changes under them.** An
application that edits text while a session is open calls `refresh()`.
Watching every text node for changes would cost something every frame
to serve a case that only arises while a bar is open.

**Closing leaves the last match selected**, as browsers do, and the
highlights on the others go with the session.

**Not here:** whole-word and regular-expression queries, replace, and
match marks in a scrollbar gutter.

**Where this was checked.** The engine, the service and this page's
example have specs, and a renderer parity case draws three matches with
the active one selected over its own highlight on both backends. The
bar itself was checked by hand in a render worker on WebGPU: `Ctrl+F`
opened it, and the count stepped with the active match scrolled into
view. That is one browser on one machine; nothing here has been
verified anywhere else.

## Next

[Selection](/interaction/selection) is the model underneath this one:
the same corpus, the same highlight, and the clipboard the active match
copies through.
