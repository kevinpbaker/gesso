---
description: 'Link: a control that goes somewhere, with the role that says so, the shell request that stands in for an anchor, in-app destinations that open somewhere new on Cmd-click, its underline modes and its keyboard.'
---

# Link

A control whose press takes you somewhere else. `Link` declares
`role: 'link'`, and that is the whole reason it exists as a component
rather than as a `Button` painted blue.

The distinction is not decoration. `link` tells an assistive technology
that activating this goes somewhere; `button` tells it that something
happens here. A reader who cannot see the coloured words navigates a
page by that difference: links are listed together, announced as links,
and followed with the expectation of arriving. **A link navigates; a
button acts.** "Read the docs", "Release notes" and a breadcrumb are
links. "Save", "Delete", "Show more" and "Sign in" are
[Button](/components/button), even when the design paints them as words
in the accent colour, and `Button` has a `plain` variant for exactly
that painting. When a row of words chooses which panel is showing
rather than going anywhere, [Tabs](/components/tabs) says that more
clearly, and when the press opens a sheet of choices in place,
[Menu](/components/menu) is the control for that.

<LiveExample id="link" height="340" />

<<< @/src/examples/LinkExample.tsx#link

The row along the top is in-app navigation: those links have an
`onPress` and no `href`, so nothing leaves the application and the line
under them says where you are. The sentence below carries an inline
link with an `href`, which asks the shell to open a URL. "Release
notes" has both, and the counter shows that the handler ran before the
tab was asked for. "Sign in" is disabled and refuses everything. The
last one draws its own content, so the words on screen and the name a
reader hears are allowed to differ.

## There is no anchor here

This is a canvas runtime. The tree is painted onto a canvas, usually
from a worker, and there is no `<a>` element anywhere in it: no element
the browser will navigate for you, no default action to prevent, no
status bar showing the target. So a link is an ordinary focusable
control, and following one is a request to the shell:

```ts
const shell = ctx.inject(ShellService);
shell.openUrl(href);
```

The runtime forwards that request to whichever host it has. `GessoApp`
opens the tab directly; `WorkerApp` posts it to the main thread, which
does. The component never touches `window`, which is what lets the same
component run in a worker, in an Electrobun shell and in a test.
[State and services](/guide/state-and-services) is the page about the rest of
that channel.

Where a link goes is `href` or `to`, and `onPress` may sit beside
either.

| What you pass   | What it is                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `href`          | The outbound link: somewhere the shell owns, off this application                                             |
| `to`            | The in-app link: one of this application's own urls, which `RouterService` navigates to                       |
| `onPress`       | Runs first, before `to` is followed or `href` opened: the shape for recording a click before anything moves   |
| `onPress` alone | An in-app link that routes inside its handler. It works, but cannot be opened somewhere new; prefer `to`      |
| `to` and `href` | `to` wins. A link goes to one place, and the one the application can route to is the one it most likely meant |

An in-app link is still a link. Nothing leaves the application, but
what the reader does with it is go somewhere, so the role is the same
and a screen reader lists it with the others.

```tsx
// Outbound.
<Link label="Read the docs" href="https://gesso.dev" />

// In-app: the router does the work, and the link says where it goes.
<Link label="Settings" to="/settings" />

// The same, built from a route, so a missing param is a compile error.
<Link label="BUD-13" to={to(Story, { epic: 'BUD-12', story: 'BUD-13' })} />
```

`to` takes a url, `/epic/BUD-12?story=BUD-13`, or a `RouteTarget` from
`to(route, params, { query })`, the same value a guard redirects with.

## Opening a destination somewhere new

A browser opens an anchor in a new tab when it is clicked with Command
(macOS) or Control (elsewhere) held, or with the middle button, and
people expect the same of anything announced as a link. A `Link` with
`to` does the same:

| How it is activated                                     | `to`                                                       | `href`                    |
| ------------------------------------------------------- | ---------------------------------------------------------- | ------------------------- |
| Click, Enter or Space                                   | `onPress`, then the router navigates in place              | `onPress`, then `openUrl` |
| Cmd-click, Ctrl-click, middle click, Cmd- or Ctrl-Enter | `onPress`, then `ShellService.openRoute`; the screen stays | The same as a plain click |

An `href` behaves the same either way, because `openUrl` already opens
outside the application and there is nowhere newer to send it. A link
with only `onPress` runs `onPress` and nothing more, because its
destination is inside a function the link cannot see into.

What "somewhere new" means is the shell's to decide, because only the
shell knows which address shows the application at a given route.
`openRoute` names the router's url, and the shell turns it into a
place:

| Shell                                      | What a Cmd-click on an in-app link opens                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| A browser, `path` mode                     | A new tab at the app's origin and that path                                                    |
| A browser, `hash` mode                     | A new tab at the same page with the fragment set to (`base` +) the url                         |
| `memory` mode, or a history with no `href` | No address exists, so the link is followed in place, as a plain click would                    |
| A host with `onOpenRoute`                  | Whatever the host says: an app embedded in Jira opens a Jira tab through Forge's `router.open` |
| An Electrobun window                       | A new window of the application, starting at that route                                        |

[Routing](/structure/routing#links-and-opening-a-screen-somewhere-new)
has the shell's half, and [desktop windows](/structure/desktop-windows)
has the window's.

**Command or Control, on every platform.** The render thread is a
worker and has no reliable answer to which platform it is on, so a
link accepts either key, the same choice `Mod` makes in a keyboard
shortcut. The one place that shows is a Mac's Control-click, which the
system treats as a secondary click: a browser opens a context menu for
it on an anchor, and here it opens the destination somewhere new.

**The middle button is read from the press.** A click is dispatched on
release, and carries the buttons held at the release, which is none. So
the link notes the buttons of the press that started it, and the click
that ends that press reads them.

## Props

| Prop        | Type                    | Default   | What it does                                                                       |
| ----------- | ----------------------- | --------- | ---------------------------------------------------------------------------------- |
| `label`     | `string`                | `''`      | The words on it, and its accessible name                                           |
| `href`      | `string`                | none      | Opened through `ShellService` when the link is activated                           |
| `to`        | `string \| RouteTarget` | none      | An in-app destination: navigated to in place, or opened somewhere new on Cmd-click |
| `onPress`   | `() => void`            | none      | Called on activation, before `to` is followed or `href` opened                     |
| `underline` | `LinkUnderline`         | `'hover'` | The rule under the words: `always`, `hover` or `none`                              |
| `disabled`  | `boolean`               | `false`   | Refuses activation, and paints the words in the disabled ink                       |
| `children`  | `UiChild`               | none      | Content instead of the label's text; `label` stays the accessible name             |
| `ref`       | `UiNodeRef`             | none      | Receives the node that is the link, for focusing it or anchoring something to it   |

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too.

Nothing on a link is read once. [Button](/components/button) reads its
variant once because a variant picks a modifier and a modifier list is
fixed for the life of an element; a link's modifiers are its focus ring
and whatever the caller attached, and `underline` only decides what a
bound cell computes. So every prop here follows a cell as it changes,
and no caller ever needs to change a link's `key` to change how it
looks.

## The rule under it

`underline` is drawn with the real `textDecoration` property, so it
sits where the font says a rule should sit rather than being a hairline
box laid out beside the words.

| Value      | When to reach for it                                                                    |
| ---------- | --------------------------------------------------------------------------------------- |
| `'hover'`  | The default. Colour at rest, a rule when the pointer confirms what you are pointing at  |
| `'always'` | A link inside running text, where colour alone will not separate a word from a sentence |
| `'none'`   | A link that is already obviously one: a navigation row, a footer, a breadcrumb          |

A body of prose with permanently underlined links is hard to read, and
a link with no rule at all is hard to find, which is why the default
sits between the two.

The rule is bound to the words this component draws. A caller who
supplies `children` is drawing their own content and decorates it
themselves, exactly as a caller who supplies `children` to a button
colours their own content.

## Keyboard

| Key                         | What it does                                                           |
| --------------------------- | ---------------------------------------------------------------------- |
| `Enter`                     | Follows the link. Bound by the component, and consumed                 |
| `Cmd-Enter` or `Ctrl-Enter` | Opens a `to` destination somewhere new; an `href` opens as on `Enter`  |
| `Space`                     | Follows the link, through the runtime's own default for a focused link |
| `Tab`                       | Not bound: focus moves on as it normally would                         |

`Enter` is the component's key, because Enter is what activates a
native anchor and Space is not: on a web page Space is the reader's
page down, and a link that swallowed it would turn "keep reading" into
a navigation away from the thing being read. So the keymap has one row.

Space activates it anyway, and the table says so rather than pretending
otherwise. The runtime's keyboard controller presses any focused node
whose role is `button` or `link` on Enter or Space by synthesising a
click, and that default is cancellable by consuming the key. Enter runs
through the component's keymap, which consumes it, so the default does
not fire a second time. Space falls through, and the link is followed.

The component declines to bind Space to a no op purely to suppress
that, for two reasons. The reason to withhold Space from a link is the
page scroll it would steal, and there is no page scroll here: nothing
in this runtime listens for Space, and a scroller is scrolled by the
wheel and by its own keys. And an assistive technology that maps its
activation gesture onto Space would find a link that answered nothing,
which is a worse defect than a link that answers one key more than an
anchor does.

A disabled link takes neither key.

## Semantics

| What       | Value                                                               |
| ---------- | ------------------------------------------------------------------- |
| Role       | `link`, always                                                      |
| Name       | `label`, including when `children` draws something else             |
| States     | none                                                                |
| `disabled` | The element's own property, which is where the mirror reads it from |

`disabled` is never a semantic state here. It is a property of the
element that is the link, the accessibility mirror reads it there, and
saying it twice would be the empty `states` array the library already
had to fix once.

A disabled link stays focusable, as every disabled control in this
library does, because a control the keyboard cannot reach is a control
whose disabled state nobody is ever told about.

## Colour is a palette name, not a prop

A link's resting ink is `controlAccent`, so it reads as a link under
whatever theme it lands in, and a disabled one is
`controlForegroundDisabled`. Both are palette names resolved at paint
against the inherited theme, not colours and not props. There is no
colour prop on this component and there will not be one. Restyling a
link is a theme provider around it, the mechanism [themes and the
environment](/appearance/themes-and-the-environment) describes.

The rule under the words is not driven by the `interactive` modifier,
which is how [Button](/components/button) answers the pointer, and the
reason is worth knowing before you try it. A modifier writes properties
on the node it is attached to, and the node that is the link is the
row, while the thing that needs the rule is the text inside it.
`textDecoration` is an inherited property, but inheritance here
resolves from the environment rather than from a parent node's
property, so a decoration written on the row never reaches the words.
The link keeps `onPointerEnter` and `onPointerLeave`, holds one boolean
of its own, and binds the decoration on the text.

## What this page was checked against

`Link.spec.ts` mounts the component with `gesso-testing` and asserts
that it announces itself as a link and not a button, that an `href` is
opened as an `openUrl` request to the shell, that `onPress` alone sends
no request at all, that `onPress` runs before the URL when a link has
both, that a `to` link navigates the router in place on a plain click
and on Enter, that Cmd-click, Ctrl-click, a middle click and Cmd-Enter
send one `openRoute` request and leave the router where it was, that
`onPress` runs first either way, that a `RouteTarget` becomes the url
the router would build, that `to` wins over `href`, that an `href`
opens the same way with a modifier held or the middle button pressed,
that Enter activates it exactly once, that Space activates it
through the runtime default the component leaves alone, that Tab
reaches it, that the rule appears and disappears with the pointer and
that `always` and `none` behave, that the ink is `controlAccent` and
the disabled ink is `controlForegroundDisabled`, that a disabled link
refuses the pointer, the key and the rule and declares no semantic
state, and that `children` replaces the words while `label` stays the
name. `LinkExample.spec.ts` asserts what the example above claims, by
role and name.

## Next

[Button](/components/button) is the one to reach for when the press
acts rather than navigates, and [Tabs](/components/tabs) is the one for
a row of words that chooses which panel is showing rather than going
anywhere.
