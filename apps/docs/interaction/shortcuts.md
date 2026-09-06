---
description: A scoped, prioritised shortcut registry with chords, that a component or a route registers into and a palette can list.
---

# Shortcuts

Both of the applications built on Gesso put one `onKeyDown` on the root
and switched on the current route. That shape has three problems, and
the registry exists for all three.

A screen cannot add a key without editing a file it does not own. Two
screens that want the same key have no way to say which wins. And
nothing can list what is available, because the keys only ever existed
inside a handler's control flow, so neither application has a palette or
a help sheet and neither could grow one.

## The shape

```ts
const registry = new UiShortcutRegistry();

<column modifiers={[shortcuts({ registry })]}>
  <box modifiers={[shortcut({ registry, keys: 'Mod+K', label: 'Show every shortcut', scoped: false, run: open })]} />
```

`shortcuts` goes on the application's root, once, and is the only thing
that listens. The registry itself listens to nothing, which is what lets
it stay a plain object a spec can drive directly and keeps it from
needing the dispatcher or the focus manager injected.

`shortcut` registers one command for as long as its element exists. That
is the single thing the root handler could not give you: the lifetime of
a shortcut is the lifetime of the thing it acts on, so a screen cannot
leave a command behind when it is replaced.

## Where a key is heard

The root listener is in the **bubble** phase, so a key reaches the
registry only after the focused node and everything above it have had
it. A text field that handles its own Escape keeps it and a dialog that
takes Enter keeps that, with no list of exceptions anywhere in the
registry.

A key a shortcut takes is marked `preventDefault()`, which is what the
keyboard controller reads before applying its own defaults, so a
shortcut on Tab is not also a tab navigation.

## Typing is not a shortcut

A shortcut with no modifier at all is skipped while a text field has
focus. Without that rule an application with `n` for "new note" becomes
an application you cannot type the letter n into, which is the failure
every home-grown key handler eventually ships.

## Mod

`Mod` matches **either** Control or Command. The framework runs in a
worker and has no reliable answer to which platform it is on, and the
answer would be wrong for a Mac keyboard plugged into a Linux machine
anyway. An application that genuinely wants one of the two spells it
out: `Ctrl+S` or `Meta+S`.

`formatShortcut` prints `Mod` as `Ctrl`, not as a platform glyph, for
the same reason. An application that knows what it is running on can
format the parsed `steps` itself.

## Scope

```ts
shortcut({ registry, keys: 'Delete', label: 'Remove the chosen row', run: remove });
```

By default a shortcut is live only while focus is inside the element it
is attached to. That is what makes "Delete removes the selected row"
safe to register: the table registers it, and it stops existing the
moment the person tabs into the search field. `scoped: false` registers
it application-wide with the element's lifetime, which is what a route
wants.

When two live shortcuts want the same keys, the deeper scope wins,
without either of them naming a number. `priority` is for the case where
that is not the answer: a route taking a key the application had.

`when` is a last check before it runs, for a command that is not always
available.

## Chords

```ts
shortcut({ registry, keys: 'g b', label: 'Go to the board', scoped: false, run: goToBoard });
```

Space separates the presses of a chord. The first key is reported as
taken, so nothing else acts on a `g` that was the beginning of a
command, and the rest of the sequence has 1200 ms to arrive. A `g`
pressed into a page and then forgotten does not swallow a key a minute
later.

`+` separates the modifiers of one press, and the last segment is always
the key however it is spelled, so `Mod++` is Mod and the plus key.

## A palette

```ts
registry.active(focusedNode).map(binding => row(binding.display, binding.label, binding.group));
```

`active` returns what would run right now, in the order the registry
would try them. It is the same computation the key handler makes, so a
palette cannot show a command that would not fire and cannot hide one
that would.

Each binding carries `display`, the keys written the way they should be
shown, and the `label` and `group` the application gave it, so a palette
or a help sheet needs no second table of descriptions.

The focused node is the one the palette lists against. Inside the
handler it comes from the event's `target`, because the keyboard
controller routes a key to the focused node and to the root when nothing
is focused; a palette that wants the same answer follows focus itself.
