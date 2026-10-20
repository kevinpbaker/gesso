---
'gesso-components': patch
'gesso-framework': patch
---

A `NumberInput` with a minimum can be typed into. Every keystroke used to be clamped, so with `min: 10` the "1" of "15" became "10" under the caret and the "5" made it "105". The field now keeps what is typed, reports a number only once it is one the field could hold, and bounds the text when it is left or Enter is pressed. A field left blank or holding text that is not a number goes back to the value it had, where it used to report 0, a number nobody typed and often not in range.

A `Slider` under `textDirection: 'rtl'` agrees with what it draws. The fill already grew from the right, but a press and the arrow keys still read left to right, so a press near the right edge set nearly the maximum and Right made the fill longer. A press now counts from where the track starts, Left is more and Right is less, Up and Down are unchanged, and the thumb sits centred on the end of the fill rather than six pixels short of it.

A `RadioGroup` marked `invalid` or given an `error` rings its circles in the danger colour, as a `Checkbox` rings its box; it used to say so only in the message under it. Its `direction` is documented as read once, when the group renders. A row of options under `textDirection: 'rtl'` takes Left as the next option and Right as the previous one, so the arrows move toward the option they point at; they used to move away from it.

`SegmentedControl` takes a `ref`, as every other control does, and hands it the track.

`onSubmit` on a `TextArea`, or on a multiline `TextInput`, is called on Command-Enter or Control-Enter. It was on the props and never called, since Enter alone is a new line there.

`bind(cell, 'checked')` spreads into JSX beside other props. The handler's name defaulted to `onChange` only in principle: it was inferred from the props around the spread, so `<Switch label="Sync" {...bind(on, 'checked')} />` failed to compile with "'label' is specified more than once" and needed `'onChange'` spelled out.
