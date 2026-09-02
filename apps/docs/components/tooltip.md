---
description: 'Tooltip: a label that appears beside a control after a pause, as a modifier on the element or a component around it.'
---

# Tooltip

A label that appears beside something after a pause. Reach for it when
a control has a name too short to be self-explanatory: an icon button,
an abbreviated column heading, a badge whose meaning is not obvious. It
is a supplement, never the only place something is said, because it
appears only for a reader who hovers or tabs onto the trigger.

There are two ways to attach one, and they are one implementation. The
modifier, `tooltip()`, listens to the element it is attached to and
adds nothing to the tree. The `Tooltip` component wraps its child in a
box, because a component cannot add a listener to a node it does not
render, and that box is a real node that takes part in layout. Prefer
the modifier; use the component when the trigger is a child you were
handed rather than an element you write.

For a message the user did not ask for, a [toast](/components/toast)
announces itself instead of waiting to be hovered.

<LiveExample id="tooltip" height="260" />

<<< @/src/examples/TooltipExample.tsx#tooltip

Hover any button and wait, or tab onto one. `Delete` has a delay of 0
and is up on the first frame. The badge at the bottom is the wrapping
form, and takes no focus, so a pointer is the only way to reach it.

## The modifier

```tsx
const saveTip = tooltip(ctx, { text: 'Writes the note to the server' });
<button label="Save" modifiers={[saveTip]}>
  …
</button>;
```

| Option      | Type               | Default | What it does                                          |
| ----------- | ------------------ | ------- | ----------------------------------------------------- |
| `text`      | `string`           | none    | What the tooltip says. An empty string opens nothing. |
| `placement` | `OverlayPlacement` | `'top'` | Which side of the trigger it sits on.                 |
| `delay`     | `number`           | `400`   | Milliseconds the pointer must rest before it opens.   |

The component's context is the first argument, before the options,
because a modifier cannot inject a service: it has no component of its
own to inject into, and the overlay layer is per runtime. So the
component that renders the element hands over its own overlay entry,
which is also what closes the tooltip when that component unmounts.

Build the modifier once, in the component body, and pass the same value
every time. A modifier's arguments are compared by identity, so a fresh
object per frame detaches and re-attaches the listeners on every frame.
The body runs once, so a `const` in it is exactly right.

The options are plain values rather than Observables. A tooltip whose
text changes while it is open is reopened with the new text; one that
is closed stays closed, because a re-render is not a hover.

## The component

| Prop        | Type               | Default       | What it does                                             |
| ----------- | ------------------ | ------------- | -------------------------------------------------------- |
| `text`      | `string`           | `''`          | What the tooltip says. Empty opens nothing.              |
| `placement` | `OverlayPlacement` | `'top'`       | Which side of the wrapper it sits on.                    |
| `delay`     | `number`           | `400`         | Milliseconds the pointer must rest before it opens.      |
| `children`  | `UiChild`          | an empty text | The trigger, wrapped in the box that does the listening. |

`text`, `placement` and `delay` may each be a plain value or an
Observable of one, and are read when the tooltip opens: a new value
takes effect the next time it does. The child is read once, when the
component is built, because the component body runs once.

`Tooltip` takes none of the shared layout props, so the box it wraps
the child in sizes itself to that child and is placed by whatever holds
it. That box is the anchor, which is why the tooltip is measured
against the wrapper rather than against the child inside it.

`tooltipContent(text)` is exported as well. It is the box both forms
open, and it exists so the two cannot drift into two tooltips that look
different.

### Placement

`placement` takes any of `top`, `bottom`, `left`, `right`, each also
with a `-start` or `-end` suffix: twelve values in all. The tooltip is
placed six pixels off the anchor. Placement is a property of the
overlay entry rather than something this component computes, so the
engine tracks the anchor through a scroll and flips the tooltip at the
edge of the viewport without anything here watching layout.

## Keyboard

`Tooltip` binds no keys, and neither the tooltip nor the wrapper is a
tab stop. A tooltip that could be tabbed into would be a trap with no
way out.

| Event         | What happens                                              |
| ------------- | --------------------------------------------------------- |
| Pointer enter | Opens after `delay`                                       |
| Pointer leave | Closes, and cancels a pending open that had not fired yet |
| Pointer down  | Closes                                                    |
| Focus         | Opens at once, with no delay, so a keyboard reaches it    |
| Blur          | Closes                                                    |

Focus opening it is why the trigger should be focusable in the first
place. A tooltip on a box nothing can reach with Tab is a tooltip half
the people using the screen cannot read.

One consequence is worth knowing: pressing a focusable trigger closes
the tooltip and the focus that follows the press opens it again, so it
stays up while that control holds the keyboard. On a trigger that takes
no focus, a press closes it and it stays closed. Both are asserted in
the spec beside the example.

## Semantics

| What    | Value                                                                   |
| ------- | ----------------------------------------------------------------------- |
| Role    | `tooltip`, on the box that opens                                        |
| Name    | `text`                                                                  |
| States  | None                                                                    |
| Focus   | Never taken. The tooltip is read, not visited                           |
| Pointer | `pointerEvents: 'none'`, so it never intercepts a press meant for below |

The tooltip is a separate record in the semantics tree. It does not
become the trigger's accessible description, so give the trigger its
own `label` and treat the tooltip as a second, visual saying of it
rather than the only one.

The tooltip is drawn in the overlay layer the runtime mounts above the
app root, so opening one moves nothing in the layout. Its content
inherits the theme and text style of its anchor, which is what keeps a
tooltip opened from a dark panel dark.

## What has been checked

The delay, the cancel, the focus path, the placement carried on the
entry, the role and name, and that the modifier adds no node are all
asserted in the spec beside the example, against the real runtime with
a fake canvas. Where the box lands on screen is the layout engine's
anchored placement, and is covered by that engine's own fixtures rather
than here.

## Next

[Toolbar](/components/toolbar) is the row of controls these labels
usually hang off, and [Toast](/components/toast) is what to raise when
the application has something to say without being asked.
