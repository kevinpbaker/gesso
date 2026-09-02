---
description: An app that owns its own light, dark and system setting, resolved against what the shell reports and provided as the root's theme.
---

# An app with an appearance setting

Most applications end up wanting three choices rather than two: light,
dark, and follow the system. The framework reports what the platform
is in and stops there, on purpose, because what dark looks like is the
application's decision. So the third choice is the interesting one:
`system` is not a colour, it is a deferral, and keeping it a deferral
is the whole of this recipe.

It assumes [light and dark](/guide/appearance) for how a theme reaches
a component, and [shell services](/structure/shell-services) for where
the platform's answer comes from.

<LiveExample id="recipeappearance" height="320" />

Choose Light or Dark and the canvas stops following the page's own
toggle in the navigation bar. Choose `Match the system` and it starts
again, in whichever appearance the page is in at that moment.

## The choice is not the answer

<<< @/src/examples/RecipeAppearanceExample.tsx#choice

Three values, one of which means "ask somebody else". The temptation
is to resolve `system` at the moment it is chosen, storing whatever
the platform said and having two values to deal with instead of three.
Do not: the platform can change its mind while the application is
open, on a schedule or when someone flips a switch in the operating
system, and a setting that was resolved once cannot follow that.

## Two inputs, one rule

<<< @/src/examples/RecipeAppearanceExample.tsx#resolve

`ShellService.colorScheme` is an Observable the shell writes and the
application only reads. Combining it with the setting is two lines,
and the rule between them is one: an explicit choice wins, and
`system` passes the question through.

`distinctUntilChanged` earns its place here more than in most
pipelines. The answer feeds an environment value that every node below
inherits, so an unchanged answer that still emitted would rebind the
whole subtree. Both inputs re-emit on their own schedule, so without
it that happens for real.

Where the setting is _stored_ is not the framework's business and this
example does not pretend otherwise: it holds the choice in an
`internalState`, which lasts as long as the screen. A real application
puts it wherever its other preferences live, which is a service when
one thread owns it and a channel when it crosses one. [State and
services](/guide/state-and-services) and [channels and the
barrier](/structure/channels-and-the-barrier) are the two shapes.

## Providing it at the root

<<< @/src/examples/RecipeAppearanceExample.tsx#app

`theme` is an environment value: provided on one node, inherited by
everything below it, and rebound rather than rebuilt when it changes,
because it is an ordinary prop that accepts an Observable. That is why
the radio group inside changes appearance without knowing the setting
exists, and why nothing in this file names a colour that is not a
token. [Themes and the
environment](/appearance/themes-and-the-environment) is the mechanism
in full.

Two details are easy to get wrong.

**`textStyle` has to go with it.** A theme's palette answers a colour
_token_, so `color="text"` follows the theme. Text that names no
colour at all takes its colour from the type scale in the environment
instead, so a root that provides only `theme` leaves every unstyled
line painting the light theme's black on a dark background. The spec
asserts both properties on the root for that reason. [The type
scale](/appearance/typography) has the rest of what is in there.

**Providing it again overrides it.** This example is mounted inside
the documentation site's own themed root, and the box above overrides
that root for its subtree. Scoped rather than global is what makes a
deliberately dark panel inside a light application possible, and it is
also why an overlay, which is drawn outside the tree that declared it,
has to be handed an environment explicitly.

## What has been checked

The spec drives both inputs: `setColorScheme` for what the shell
reports, and the arrow keys on the radio group for what the reader
chooses. It asserts the resolved answer through the theme the root is
actually providing rather than through the sentence on screen, and it
covers the case the deferral exists for: choosing `system` again after
an explicit choice, with the platform having changed in between.

What it does not cover is the appearance being reported by a real
shell, or how any of it is drawn. The canvas above is Canvas2D, and
Chrome and other Chromium browsers are the extent of what this page
has been opened in.

## Next

[A settings page](/recipes/settings-page) is where a control like this
one belongs, and [shell services](/structure/shell-services) is what
else arrives from the thread with a window.
