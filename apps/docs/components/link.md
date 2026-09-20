---
description: 'Link: a control that goes somewhere, with the role that says so, the shell request that stands in for an anchor, its underline modes and its keyboard.'
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
middle click, no status bar showing the target. So a link is an
ordinary focusable control, and following one is a request to the
shell:

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

`href` and `onPress` are separate questions, and both may be answered.

| What you pass   | What it is                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `href` alone    | The outbound link: somewhere the shell owns, off this application                                |
| `onPress` alone | The in-app link. The destination is a screen you draw, so route inside the handler               |
| Both            | `onPress` runs first, then the URL opens: the shape for recording a click before the tab appears |

An in-app link is still a link. Nothing leaves the application, but
what the reader does with it is go somewhere, so the role is the same
and a screen reader lists it with the others.

```tsx
// Outbound.
<Link label="Read the docs" href="https://gesso.dev" />

// In-app: the router does the work, and the link says where it goes.
<Link label="Settings" onPress={() => router.go('/settings')} />
```

## Props

| Prop        | Type            | Default   | What it does                                                                     |
| ----------- | --------------- | --------- | -------------------------------------------------------------------------------- |
| `label`     | `string`        | `''`      | The words on it, and its accessible name                                         |
| `href`      | `string`        | none      | Opened through `ShellService` when the link is activated                         |
| `onPress`   | `() => void`    | none      | Called on activation, before `href` is opened                                    |
| `underline` | `LinkUnderline` | `'hover'` | The rule under the words: `always`, `hover` or `none`                            |
| `disabled`  | `boolean`       | `false`   | Refuses activation, and paints the words in the disabled ink                     |
| `children`  | `UiChild`       | none      | Content instead of the label's text; `label` stays the accessible name           |
| `ref`       | `UiNodeRef`     | none      | Receives the node that is the link, for focusing it or anchoring something to it |

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

| Key     | What it does                                                           |
| ------- | ---------------------------------------------------------------------- |
| `Enter` | Follows the link. Bound by the component, and consumed                 |
| `Space` | Follows the link, through the runtime's own default for a focused link |
| `Tab`   | Not bound: focus moves on as it normally would                         |

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
both, that Enter activates it exactly once, that Space activates it
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
