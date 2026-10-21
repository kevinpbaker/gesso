---
description: 'A span chosen from a range with two thumbs: the props, the keys for each thumb, the drag that picks a thumb, and what each thumb announces about itself.'
---

# RangeSlider

`RangeSlider` is a low and a high value chosen from one range, each
with a thumb of its own: a price between two amounts, a stay between two
dates, an acceptable band for a reading. It is
[Slider](/components/slider) twice over one track, and everything that
page says about snapping, direction and the drag holds here for each
thumb.

<LiveExample id="rangeslider" height="300" />

Price is controlled: the application counts the hotels inside the span,
and the thumbs keep $50 apart. Stay is uncontrolled, its thumbs are
named outright, and they keep at least a night between them. Tab onto a
thumb and try End, then Tab to the other and try Home.

<<< @/src/examples/RangeSliderExample.tsx#range

## Props

| Prop           | Type                                         | Default      | What it does                                                                                                                                         |
| -------------- | -------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`        | `readonly [number, number]`                  | none         | The pair to show, low then high. Supplying it makes the slider controlled. A pair out of order or out of range is drawn sorted and clamped.          |
| `defaultValue` | `readonly [number, number]`                  | `[min, max]` | The pair to start at, for a slider that owns its own. Supplying both throws, naming the component.                                                   |
| `onChange`     | `(value: readonly [number, number]) => void` | none         | Called with the new pair, clamped, snapped and in order, whenever either end moves. A key or a press that moves nothing calls nothing.               |
| `min`          | `number`                                     | `0`          | The bottom of the range.                                                                                                                             |
| `max`          | `number`                                     | `100`        | The top of the range.                                                                                                                                |
| `step`         | `number`                                     | `1`          | What an arrow key moves a thumb by, and the grid both thumbs are snapped to, counted from `min`.                                                     |
| `minDistance`  | `number`                                     | `0`          | The least gap the thumbs keep between them. At `0` they can meet.                                                                                    |
| `label`        | `string`                                     | `''`         | Drawn beside the two values and used as the group's name, and the stem of the thumbs' names: "Price" names them "Minimum price" and "Maximum price". |
| `thumbLabels`  | `readonly [string, string]`                  | derived      | The thumbs' names outright, for when "Minimum" and "Maximum" are the wrong words: "Check in" and "Check out".                                        |
| `disabled`     | `boolean`                                    | `false`      | Takes both thumbs out of the tab order, ignores the keys and the drag, and draws the span and thumbs in the disabled foreground token.               |
| `format`       | `(value: number) => string`                  | none         | How each value is drawn beside the label and how it is spoken: `"$40"`. Without it the numbers are shown as they are.                                |
| `labelHidden`  | `boolean`                                    | `false`      | Draws the track alone. The label still names the group and the thumbs, and the space it would have taken is gone rather than blank.                  |
| `ref`          | `UiNodeRef`                                  | none         | Receives the minimum thumb's node, the first tab stop, which is what a form focuses.                                                                 |

A derived name lower-cases the label's first letter so the two words
read as one phrase, unless the label starts with an abbreviation:
"CPU load" names its thumbs "Minimum CPU load" and "Maximum CPU load".
With no label at all the thumbs are still told apart, as "Minimum" and
"Maximum".

### Layout and modifiers

The [shared layout props](/components/#layout-is-yours) land on the
slider's root, which is the group, and so does `rootModifiers`. The
focus ring is drawn on each thumb instead, because that is where the
keyboard is. There are no colour props: the track, the span and the
thumbs are theme tokens.

## Controlled and uncontrolled

```tsx
<RangeSlider label="Price" value={price} onChange={next => (price.value = next)} />
<RangeSlider label="Price" defaultValue={[20, 80]} />
```

Which form applies is decided once, when the component is built, from
whether `value` was supplied; supplying both throws.

A controlled range slider draws the pair it is given, and `onChange` is
a request. An application that writes back `[low, Math.min(400, high)]`
caps the top thumb at 400 however far it is dragged, and one handed no
`onChange` does not move at all until the application moves it.

Every pair the control reports is already in order and already keeps
`minDistance`, so an `onChange` never has to sort or check what it is
given. A pair the application writes is not checked in the same way,
because the application owns it; it is drawn sorted and clamped to the
range so the span cannot be drawn inside out, and the next key press
starts from that tidied pair.

## Keyboard

Each thumb is its own tab stop and has its own focus ring. The keys
move only the focused thumb.

| Key                | What it does                                                                  |
| ------------------ | ----------------------------------------------------------------------------- |
| Right, Up          | One step up (Right is one step down right to left)                            |
| Left, Down         | One step down (Left is one step up right to left)                             |
| Page Up, Page Down | A tenth of the range, or one step, whichever is larger                        |
| Home               | As low as this thumb may go: `min`, or `minDistance` above the minimum thumb  |
| End                | As high as this thumb may go: `max`, or `minDistance` below the maximum thumb |

Every one of them clamps to what the thumb may reach, so the thumbs
never cross and never come closer than `minDistance`. A key pressed
against that limit reports nothing. A key that is bound here is
consumed; anything else, Tab among them, is left for whatever is
listening above.

Under `textDirection: 'rtl'` the track runs from the right: the minimum
thumb sits on the right and the span grows leftward. Left and Right
swap on both thumbs exactly as they do on a `Slider`, and Up and Down
stay as they are. The direction is asked when the key arrives.

## Pointer

The track strip measures itself, so a pointer inside it is a fraction
of the range, counted from where the track starts. A press moves the
**nearer** thumb to where it landed, focuses that thumb, and begins a
pan that carries it from the first pixel. A thumb dragged into the
other stops against it, `minDistance` short, and the drag does not hand
over to the other thumb.

Two thumbs sitting on the same value are equally near. A press to one
side of them means the thumb on that side. A press on them moves
neither, and the drag that follows decides: toward the bottom of the
range takes the minimum thumb, toward the top the maximum. That is
read in values rather than pixels, so right to left a leftward drag
takes the maximum thumb. It is also what frees two thumbs stuck at one
end of the range, which would otherwise have only one way to move and
the wrong thumb to move it.

The thumbs themselves do not take presses: the track under them does,
and picks the nearer thumb, which is the one under the pointer. Letting
the thumbs take presses would make two thumbs overlapping at an end a
question of which was painted last.

## Semantics

The component's root is a `group` named by `label`, which contains two
sliders. Each thumb is the node that takes focus, carries the role and
answers a query, and emits:

- **`role`**: `slider`.
- **`label`**: the thumb's name, from `thumbLabels` or derived from
  `label`.
- **`valueNow`**: the thumb's value.
- **`valueMin`**, **`valueMax`**: how far **this thumb** can go, not
  the whole range. The minimum thumb's maximum is the maximum thumb's
  value less `minDistance`, and the other way round. A screen reader
  that says "maximum 70" is then telling the truth about the thumb in
  hand.
- **`valueText`**: what `format` returned for the thumb's value, or the
  number as a string.
- **`disabled`**: on both thumbs' records, and the group's, when
  `disabled` is set.

## What this page has checked

The behaviour above is asserted by the spec beside the example and the
component's own spec, both of which drive the real runtime with a fake
canvas: the names, values and per-thumb ranges each thumb announces;
every key in the table for both thumbs, including the clamp against the
other thumb and against `minDistance`; a press moving the nearer thumb
and focusing it; a drag stopping at the other thumb; the drag direction
choosing between thumbs that sit together, left to right and right to
left; the mirrored keys and press; a controlled pair refused and
written back; the disabled slider ignoring a press, a drag and the
keys; and each thumb's centre landing on its end of the span at both
ends of the track in both directions.

What has not been checked is anything seen. The thumbs, the span and the
focus rings have not been looked at in a browser, so how two thumbs
sitting together read, whether the ring between them separates them
enough, and how the narrow and right to left states look are all
unverified. The drag has been driven with synthetic mouse pointers
only, never with touch, and no screen reader has been sat in front of
the two sliders, which is a different question from whether they
announce what they should.

## Next

[Slider](/components/slider) is the same track with one value, and
[NumberInput](/components/number-input) is a value typed rather than
dragged, for when the digits are the point.
