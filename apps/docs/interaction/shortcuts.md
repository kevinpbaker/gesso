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

Pressing isn't a shortcut either. A bare Enter or Space is skipped
while a button or link has focus, unless the shortcut is that control's
own, so a list's Enter for "open the row under the cursor" doesn't
also fire when the person pressed Enter on a button inside the list.
A button pressed by the keyboard is a default action, applied after the
key has been through every handler, so without this rule an
application-wide Enter would take the key from the very button that
has it.

Nor are a field's editing keys. While a text field has focus it keeps
undo and redo, select all, and moving and deleting by word or line,
whatever the application binds: an application-wide `Mod+Z` would
otherwise undo the app's last change instead of the typing. Other
modified keys (`Mod+S`, `Mod+K`) still reach the registry, and so does
Enter in a single-line field.

## Mod

`Mod` matches **either** Control or Command. The framework runs in a
worker and has no reliable answer to which platform it is on, and the
answer would be wrong for a Mac keyboard plugged into a Linux machine
anyway. An application that genuinely wants one of the two spells it
out: `Ctrl+S` or `Meta+S`.

Printing is different: a person reads a shortcut the way their
platform writes its own. `formatShortcut`, and every binding's
`display`, prints `⇧⌘K` on a Mac and `Ctrl+Shift+K` elsewhere, by the
same platform the editing keys follow (`detectEditingPlatform`, from the
user agent, which a render worker can read too). Pass a platform to
`formatShortcut` to print for another.

## Space

A shortcut string separates the presses of a chord with spaces, so the
space bar cannot be written as itself. `Space` names it, alone or with
modifiers: `shortcut({ registry, keys: 'Space', … })` runs on the space
bar, and `formatShortcut` prints it back as `Space`. Like any bare key,
it is skipped while a text field has focus.

## Symbols

```ts
shortcut({ registry, keys: '?', label: 'Keyboard shortcuts', scoped: false, run: openSheet });
```

A shortcut on punctuation, a digit or a symbol matches the character
the press produced, not the key. `?` is Shift+/ on a US keyboard,
Shift+ß on a German one and Shift+, on a French one, so Shift is not
asked about: `?` and `Shift+?` are the same shortcut, and both work on
every layout. A bare symbol also matches when AltGr typed it, which the
browser reports as Control and Alt together (or Option on a Mac).
Command still means something else, so `Mod+/` stays its own shortcut.

Letters keep their Shift, which is what tells `Shift+L` from `l`.

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
