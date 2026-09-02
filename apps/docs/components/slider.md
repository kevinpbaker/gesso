---
description: 'A value chosen from a range: the props, the keys, the drag, and what a slider announces about itself.'
---

# Slider

`Slider` is a number chosen from a range by dragging or by the
keyboard, for a value where the range matters more than the digits: a
volume, a threshold, a zoom. When the digits are the point, and someone
will want to type them, reach for
[NumberInput](/components/number-input) instead.

<LiveExample id="slider" height="300" />

Volume is controlled and the application refuses anything above 80, so
holding the arrow key or dragging to the end of the track stops there.
Zoom is uncontrolled and runs its whole range on its own. Click either
and try Page Up, Home and End.

<<< @/src/examples/SliderExample.tsx#sliders

## Props

| Prop           | Type                        | Default | What it does                                                                                                                                               |
| -------------- | --------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`        | `number`                    | none    | The value to show. Supplying it makes the slider controlled.                                                                                               |
| `defaultValue` | `number`                    | `0`     | The value to start at, for a slider that owns its own. Supplying both throws, naming the component.                                                        |
| `onChange`     | `(value: number) => void`   | none    | Called with a value already clamped to the range and snapped to the step.                                                                                  |
| `min`          | `number`                    | `0`     | The bottom of the range, and what Home goes to.                                                                                                            |
| `max`          | `number`                    | `100`   | The top of the range, and what End goes to.                                                                                                                |
| `step`         | `number`                    | `1`     | What an arrow key moves by, and the grid every value is snapped to, counted from `min`.                                                                    |
| `label`        | `string`                    | `''`    | Drawn to the left of the value and used as the accessible name.                                                                                            |
| `disabled`     | `boolean`                   | `false` | Refuses focus, ignores the keys and the drag, and fills the track in the disabled foreground token.                                                        |
| `format`       | `(value: number) => string` | none    | How the value is drawn beside the label and how it is spoken, for when the bare number is not the value: `"40%"`. Without it the number is shown as it is. |
| `ref`          | `UiNodeRef`                 | none    | Receives the node that _is_ the slider, which is what a form focuses and an overlay anchors to.                                                            |

Snapping goes through one function for the whole range tier: clamp to
`[min, max]`, round to the nearest multiple of `step` counted from
`min`, then round that to the step's own number of decimal places, so a
step of `0.1` cannot leak a value of `0.30000000000000004`.

### Layout and modifiers

The [shared layout props](/components/#layout-is-yours) land on the slider's root, and
`rootModifiers` attaches to the node that takes focus and carries the
role. There are no colour props: the fill and the track are theme
tokens.

## Controlled and uncontrolled

```tsx
<Slider label="Volume" value={volume} onChange={next => (volume.value = next)} />
<Slider label="Volume" defaultValue={40} />
```

Which form applies is decided once, when the component is built, from
whether `value` was supplied; supplying both throws.

A controlled slider draws the value it is given, and `onChange` is a
request rather than a change. The example above takes advantage of
that: it writes back `Math.min(80, next)`, so the control asks for 100
and shows 80. A controlled slider handed no `onChange` at all therefore
does not move until the application moves it, which is the same shape
every control in the library has.

An uncontrolled slider keeps one cell of its own and reports through
`onChange` as well, so a value you only want to observe still needs no
state at the call site.

## Keyboard

The slider is one tab stop, and the focus ring is drawn on it rather
than on anything inside.

| Key                | What it does                                           |
| ------------------ | ------------------------------------------------------ |
| Right, Up          | One step up                                            |
| Left, Down         | One step down                                          |
| Page Up, Page Down | A tenth of the range, or one step, whichever is larger |
| Home               | `min`                                                  |
| End                | `max`                                                  |

Every one of them clamps, so a step past the end of the range is the
end of the range. A key that is bound here is consumed; anything else
is left for whatever is listening above, which is what lets a slider
sit inside a dialog that closes on Escape.

## Pointer

The track strip measures itself, so a pointer inside it is a fraction
of the range and nothing has to reach into the engine to ask where the
slider is. A press focuses the slider and seeks to where it landed, and
the gesture is a **pan**, not a drag: a drag in this input model is a
long press followed by a move, and a track has to follow the pointer
from the first pixel. The pan stops propagating, which is what keeps a
scroll container above from scrolling under the same finger.

The strip you can grab is 20 pixels tall while the track drawn inside
it is 6, so the target is bigger than the line. The filled part is a
percentage of the track's width, which means the position of the value
is laid out rather than computed per frame.

Touch was exercised in Chrome on Linux with synthetic pointers of
`pointerType: 'touch'`, and on no physical touchscreen.

## Semantics

The root of the component is the slider: the node that takes focus,
carries the role, and answers a query. It emits:

- **`role`**: `slider`.
- **`label`**: the `label` prop, which is the same string drawn beside
  the value, so the name is never written twice.
- **`valueNow`**, **`valueMin`**, **`valueMax`**: the value and the
  range, as numbers.
- **`valueText`**: what `format` returned, or the number as a string.
  This is the reason `format` exists: `40` and `40%` are different
  announcements, and only one of them is true of a volume.
- **`disabled`**: on the record when `disabled` is set, rather than in
  `states`. A disabled control stays in the tree, because unavailable
  is a thing worth announcing.

The spec beside the example asserts every one of those, and drives the
slider only through roles and names, so a slider that stopped being
findable that way fails before a reader meets it.

## Next

[NumberInput](/components/number-input) is the same range, typed
instead of dragged, and [TextInput](/components/text-input) is the
field the two of them are built beside.
