---
description: Declaring routes with full paths and typed params, navigating, and what a route change does to the tree.
---

# Routing

Routing happens where the components are. Patterns, params, guards and
screens all live in the render worker; the one thing that crosses to
the thread with an address bar is a url string, outward when the app
navigates and inward when someone presses Back or types an address.
That is the entire wire surface of routing.

The example below has three routes and two of them nest. Press Notes,
walk between the notes, then press Back:

<LiveExample id="routing" height="380" />

## Declaring routes

<<< @/src/examples/RoutingExample.tsx#routes

A path is written out in full, and a nested route says which route it
renders inside by pointing at it. That is the opposite of the usual
arrangement, where a child's path is a fragment relative to its
parent's, and the reason is types: a fragment knows only its own
segment, while the params a screen actually receives include its
ancestors'. `RouteParams<'/notes/:id'>` is a walk over the string, so
the params a guard is given, the params `go` demands and the params
`router.params(route)` returns are one object derived in one place.

`route()` refuses a child whose path does not extend its parent's,
segment by segment, so `/notebooks` cannot claim `/notes` as its
parent. The cost is that a nested path repeats its parent's prefix,
and that is the price being paid for the params.

| In a pattern | Means                                    |
| ------------ | ---------------------------------------- |
| `notes`      | that literal segment                     |
| `:id`        | one segment, captured as `id`            |
| `/*`         | the rest of the path, captured as `rest` |

Nothing else is special: no regular expressions, no optional segments,
no repeats. A pattern whose params the compiler cannot name would give
up the thing this router is for.

Routes reach the runtime through `useRoutes`, in the worker, for the
same reason the patterns never leave it: a route holds a component
class.

<<< @/src/examples/RoutingExampleWorker.ts#register

## One outlet, and nesting is a prop

There is exactly one `RouterOutlet` in an application. It renders the
whole matched chain, built from the inside out: the leaf becomes the
`outlet` prop of its parent's screen, which becomes the `outlet` of the
one above it. A screen places `props.outlet` wherever its children
belong.

<<< @/src/examples/RoutingExample.tsx#layout

`outlet` is an input cell like any other prop, and it is never
optional. When no child route matches, the router feeds the cell an
empty list, so a screen places it unconditionally and gets nothing
rather than an error.

`RouterOutlet` cannot be the application root, because a root may not
be an Observable and a route change is an observable emission. It goes
inside whatever the root renders, which is where an application wants
it anyway.

## Navigating

```tsx
router.go(Note, { id: 'baselines' });
router.go(Home);
router.navigate('/notes/baselines');
```

`go` takes its params as a rest tuple rather than an optional argument.
A route whose path declares no params takes no second argument at all,
which is what makes `go(Home, { id: '1' })` an error instead of a
silent no-op.

| On `RouterService`     | What it gives                                                  |
| ---------------------- | -------------------------------------------------------------- |
| `go(route, params?)`   | Navigates, with the params the path declares                   |
| `navigate(url)`        | Navigates to a url, as a link would                            |
| `back()`, `forward()`  | Walks the history the shell holds                              |
| `url`                  | The current url, path and query, as a cell to bind             |
| `match`                | What that url resolved to, or null                             |
| `params(route)`        | The params of the current match, typed, or null                |
| `observeParams(route)` | The same as an Observable, for binding a title or a field      |
| `isActive(route)`      | True while that route is anywhere in the chain, for a nav item |
| `remember(route, …)`   | A cell a route keeps while its screen does not exist           |
| `forget(route)`        | Drops what a route remembered                                  |
| `answerFor(route, …)`  | A shared slot's value, only while it answers this route        |

`go` takes `{ query }` for what follows the `?`, and both `go` and
`navigate` take `{ replace: true }` to overwrite the current history
entry instead of pushing a new one.

## What a route change does to the tree

The outlet compares chains of route objects, not urls, and three
behaviours fall out of that.

**A new chain replaces the screens below the point where the two
differ.** Going from `/` to `/notes/wrapping` builds the layout and the
note; going back to `/` releases both.

**A layout above the change is not rebuilt.** The chain is keyed by
path, so the layout's host is reused and only its `outlet` input is
pushed a new value. It is mounted once and stays mounted while its
children come and go, which is why the rail in the example keeps the
toggle you set on it. A sidebar keeping its scroll position is the same
property.

**A navigation that changes only params rebuilds nothing at all.**
`/notes/wrapping` to `/notes/baselines` is the same chain of the same
objects, so the outlet emits nothing; the screen stays mounted and
follows the change through `observeParams`.

<<< @/src/examples/RoutingExample.tsx#leaf

That last one is worth holding onto, because it cuts both ways. State
the screen keeps is still there after the navigation, which is right
for a reading width or a scroll position and wrong for anything that
belongs to the record being shown. Read that from the params. This is
also why params are read from the service rather than handed down as a
prop: a prop would have had to be rebuilt to deliver them, and rebuilding
is exactly what did not happen.

## State that outlives a screen

A screen is built when its route matches and destroyed when it stops
matching, so everything the screen keeps in its body goes with it. That
is right for almost everything and wrong for the handful of values whose
whole purpose is to survive the round trip: where the list was scrolled
to, which row the keyboard was on, the text in a filter field. Coming
back lands at the top of the list, which is not where the person left.

The router keeps those:

```ts
const scroll = router.remember(Home, 'scroll', 0);

<scrollview scrollY={scroll} modifiers={[scrollPosition({ onChange: at => (scroll.value = at.y) })]}>
```

Two halves, and they are deliberately different mechanisms.
`scrollPosition` **reports** where the list has got to, because the
runtime moves that offset behind the application's back and nothing else
could say. `scrollY` **puts it back**, as an ordinary binding, so a
container built again after Back is laid out where it was left before it
paints. That last part is what also makes a shared element work in both
directions: a morph is measured from where an element is seen, and a
card only morphs back into itself if the list underneath it is where it
was.

`initial` is used the first time the key is asked for and ignored
afterwards, and the cell is scoped to the route, so two screens may both
call their offset `scroll`. `forget(route)` drops what a route
remembered, for a sign-out or a list whose contents are no longer the
ones the offset was measured against. A `null` route is the router's own
scope, for the few values that belong to the navigation rather than to
one screen.

This is a facility and not an architecture. What belongs here is the
screen-shaped remainder that exists only to put a screen back where it
was. Anything that must survive a reload, or that another part of the
application acts on, is still state on
[a channel](/structure/channels-and-the-barrier).

## Which page is this

A channel key that holds "the track page" holds whichever track was
asked for last. A screen arriving during a transition asks for its own
and is handed the previous one until the answer lands, which is a frame
or two of the wrong cover, and worse than it looks: an artwork element
that mounts carrying the previous track's shared name claims that name
and never claims its own, so a second trip between two pages does not
animate at all.

`answerFor` is the router filtering a shared slot down to this route's
own question. Both sides name the same thing in the application's own
words, and the router compares them:

```ts
const track = router.answerFor(Track, page.view.track, {
  asks: params => `/${params.handle}/${params.slug}`.toLowerCase(),
  answers: entry => entry.path.toLowerCase()
});
```

It follows the **current** params, so a walk from one track to another,
which keeps the same screen mounted because the chain did not change,
asks the new question rather than the one the body read once. And when
the route stops matching, the cell keeps what it last held instead of
emptying: a screen is still on screen while it leaves, and a departing
page whose artwork blanks for the last frames of its own fade is a
flicker, not a fix.

## Guards

A guard is an action that runs before its route is shown. It returns
`true` to allow the navigation, `false` to cancel it and leave the
current url alone, or a target built with `to(route, params)` to
redirect. Guards run outermost first, so a layout refuses for its whole
branch, and they run on urls the shell reports as well as on
navigations from a component: an address someone typed is exactly the
navigation a guard exists for.

Guards are synchronous by design. An asynchronous guard has to leave
the application somewhere while it waits, and "somewhere" is a screen,
which makes the waiting a route's job rather than the router's.
Navigate to a loading route and navigate on from it.

Where a redirect leaves the history depends on which direction the
navigation came from, and the router does not treat the two the same:

- A redirect of a navigation **from inside the app pushes**. Nothing is
  written to the history until a navigation settles, so the refused url
  was never an entry, and Back returns to the screen the person left.
- A redirect of a url **the shell reported replaces**. The address bar
  had already committed to the refused url before the guard saw it, so
  Back must not land on a url that will only be refused again.

An unmatched url is not a redirect. Declare `notFound` and its screen
is what shows while the url stands, so a reload lands in the same
place. Without one, `match` is null and the outlet renders nothing,
which is a blank screen.

## The url, and Back and Forward

The shell's half of routing is one thing: it reports the url the window
is at, once at start-up and again for every back, forward or typed
address, and it performs the pushes the router asks for. It holds no
routes and resolves nothing.

| Mode     | Where the url lives                                  |
| -------- | ---------------------------------------------------- |
| `path`   | `pushState` against the document's path. The default |
| `hash`   | the fragment, after an optional `base`               |
| `memory` | nowhere. No window involvement at all                |

`hash` mode is for an application sharing a page with something else
that owns the path, and for a static host that will not rewrite unknown
paths onto the app. `memory` mode is not a degraded mode: it is what a
window with no address bar wants, and what every test gets.

```ts
createApp({ renderWorker: () => new Worker(/* … */), history: { mode: 'hash', base: 'app' } }).mount('#app');
```

`router.back()` and `router.forward()` ask the shell to walk its
history, and the url that comes back is resolved like any other.

Which mode an app runs in is the shell's decision, made once where the
app is created, and the example on this page is a case of it. A live
example is a guest on a documentation page whose address bar belongs to
VitePress, so this site starts every embedded app in `memory` mode. The
example's Back button walks a history of its own, and the example's own
code says nothing about any of that: it declares routes and navigates,
exactly as an application would.

## Screen transitions and shared elements

An outlet with no `transition` swaps screens on the frame the url
changes. Given one, the chain is rendered through `Presence`, which
keeps the departing screen mounted until its exit animation is over:

```tsx
<RouterOutlet transition={{ enter: { opacity: 0 }, exit: { opacity: 0 }, timing: { duration: 'fast' } }} />
```

`mode` decides whether the two screens overlap while they cross
(`together`, the default) or the departing one finishes leaving first
(`wait`).

A shared element needs nothing from the outlet. `sharedElement` pairs
elements by name across whatever tree change is happening, and a route
change is one, so an element that appears under the same name on both
screens continues from where the old one was standing. See
[shared elements](/appearance/shared-elements) for the motion half of
this.

**Do not combine `enter` or `exit` with shared elements.** A screen's
opacity multiplies onto everything inside it, morphing elements
included, so during a cross-fade there are frames where neither copy is
fully on screen and whatever is behind them shows through. They are
alternatives: either the screens cross-fade, which is right when
nothing is shared, or the shared elements carry the change and the
screens swap under them.

## Limits

- **Nothing in this repository navigates in `path` mode.** The
  playground runs in `hash` mode and this site's live examples run in
  `memory`, so pushState navigation is covered by `shellHistory`'s own
  spec against a fake window and by nothing else.
- **Only Chrome.** `pushState`, `popstate` and `hashchange` behave the
  same on WKWebView and WebView2 by specification, but nothing here has
  run on either.

## Next

[Channels and the barrier](/structure/channels-and-the-barrier) is
where the state a screen shows comes from, once it is more than the
screen's own.
