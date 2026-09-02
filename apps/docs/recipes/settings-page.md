---
description: A settings screen built from the component library: grouped controls, one cell behind all of them, and one setting that disables another.
---

# A settings page

A settings screen is the smallest realistic thing an application has
that is made entirely of controls. Nothing on it is hard on its own,
and three decisions decide whether it stays maintainable: where the
state lives, how the groups are expressed, and what happens when one
setting rules another.

This recipe assumes [using components](/guide/using-components), so
that a control taken from the library rather than built by hand is
already the obvious move, and [cells and bindings](/guide/cells-and-bindings)
for what an `internalState` costs per frame.

<LiveExample id="recipesettings" height="560" />

Turn `Email digest` off and watch `Digest frequency` go with it. Move
the slider, type in the name, then press Reset: one write puts every
control back.

## The shape first

Before any element, the record the screen is about:

<<< @/src/examples/RecipeSettingsExample.tsx#shape

Five fields and one default record. Writing this down first is what
makes the rest of the page short: the summary line at the bottom, the
Reset button and the digest rule all read the same object, so none of
them has to know which control produced a change.

## One cell, one reader, one writer

<<< @/src/examples/RecipeSettingsExample.tsx#store

A cell per control would work, and would be worse. Five cells are five
things for Reset to write, five things to hand to whatever saves the
screen, and five places a rule spanning two settings has to look. One
record answers all three.

The cost of a single record is that every write replaces it, so every
subscriber hears about every change. `field` is what contains that:
each control binds to its own value through a `distinctUntilChanged`,
so moving the slider does not re-emit the display name and rebind the
text field. That is the one line to copy if you take nothing else from
this page.

`settingsStore` is an ordinary function, not a service and not a
component. Promote it to a service when a second screen needs the same
values, which is what [state and services](/guide/state-and-services)
is about; until then a function that returns four things is the whole
of it.

## Groups that exist for a screen reader

<<< @/src/examples/RecipeSettingsExample.tsx#group

The border and the heading say "these three belong together" to
somebody looking at the screen. `role="group"` with a `label` says it
to everything else, and it is two props rather than a component. The
spec checks the grouping through the semantics tree, so a panel that
loses its role fails before a reader meets it: see
[semantics](/access/semantics) for what lands in that tree and what
does not.

`Setting` puts a note under each control. The note sets no width, so
it wraps to the panel instead of widening it; [text](/guide/text) has
the rule that makes that true. The control keeps its own `label`, so
the visible name and the accessible name are the same string and
cannot drift apart.

## The screen

<<< @/src/examples/RecipeSettingsExample.tsx#screen

Three things here are worth stopping on.

**Each control is bound, not assigned.** `value={field('fontSize')}` is
a subscription, so a write to the record moves the control, whoever
made the write. That is what lets Reset be a single assignment rather
than a sweep over five controls.

**One control disables another in one expression.** The `Select`'s
`disabled` prop is the digest switch's own value, negated. No handler
coordinates the two, because both fields are in the same record and
one of them can simply be read.

Disabled is not decoration. The [Select](/components/select) declines
the pointer and the keyboard while it is off, and carries `disabled`
on its semantics record, so nothing announces a choice that would go
nowhere. The alternative, leaving the control live and ignoring what
it reports, is the version that produces a bug report.

**Reset binds its own keys.** It is a hand-written `<button>`, and
nothing in the runtime turns Enter on a focused button into a click,
so it carries `keymap({ Enter: reset, ' ': reset })`. Every control
above it comes from the library and needs no such line, which is most
of the argument for using the library. [Keyboard
operability](/access/keyboard) is where that line is drawn.

## Which control for which choice

| The choice                        | The control                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| On or off, applied immediately    | [Switch](/components/switch)                                                             |
| One of three or four, all visible | [RadioGroup](/components/radio-group)                                                    |
| One of many, or a long list       | [Select](/components/select)                                                             |
| A number on a range               | [Slider](/components/slider), or [NumberInput](/components/number-input) for an exact one |
| Free text                         | [TextInput](/components/text-input)                                                      |

A `Switch` and a `Checkbox` are the same control with different
announcements: a screen reader says on and off for one, checked and
unchecked for the other. Use the switch for a preference that takes
effect as it is flipped, and the checkbox for something that will be
submitted later.

## What has been checked

The spec beside the example drives every control through the queries
an assistive technology uses: the three groups and their membership,
the digest rule in both directions, the disabled `Select` refusing
Enter, and Reset restoring all five fields. What it does not cover is
drawing. The canvas above is Canvas2D, and Chrome and other Chromium
browsers are the extent of what this page has been opened in.

## Next

[An appearance setting](/recipes/appearance-setting) is the same
screen with one setting that has to reach outside the application, and
[a dialog flow](/recipes/dialog-flow) is what to do when a setting is
destructive.
