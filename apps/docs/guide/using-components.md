---
description: Building a form from @gesso/components, what each control brings with it, and what stays your job.
---

# Using components

`@gesso/components` is the library you build screens out of: inputs,
overlays, structure, data and media, twenty-seven components in all.
Every one of them is themed, keyboard operable, and announces itself to
an assistive technology from the day it was written.

The form below is four of them and one plain button. Tab through it:
the fields take focus in order, Space toggles the checkbox, and the
select opens and chooses from the keyboard alone.

<LiveExample id="form" height="340" />

<<< @/src/examples/FormExample.tsx#form

## What a control brings with it

The example writes `value` and `onChange` and stops. Everything else
arrives with the component:

- **The label above the field**, positioned and styled, and used as the
  accessible name rather than duplicated into one.
- **A focus ring** on the element that actually takes focus, drawn on
  the surface behind the control so it stays legible over any of them.
- **Hover and press states** in theme tokens, so a control looks
  different under the pointer without your naming a colour.
- **The keyboard map** the platform expects: Space and Enter on a
  checkbox, arrows and typeahead in a select, Escape to dismiss.
- **`role`, `label`, `value` and `states`**, which is what makes the
  spec beside this example able to find the checkbox by asking for a
  checkbox.

That last one is worth dwelling on, because it is what the tests on this
site are written against:

```ts
expect(ui.getByRole('checkbox')).toHaveSemantics({
  role: 'checkbox',
  name: 'Send me product updates'
});
```

There is no second definition of what a control is. The tree a screen
reader reads is the tree a test queries.

## Controlled, or not

Every input takes either form. Hand it `value` and `onChange` and it
shows what you give it; hand it `defaultValue` and it keeps its own:

```tsx
<TextInput label="Email" value={email} onChange={next => (email.value = next)} />
<TextInput label="Email" defaultValue="you@example.com" />
```

A controlled input given no `onChange` does not move, because nothing
writes the value back. That is the same effect `readOnly` has, for the
same reason.

## The five tiers

| Tier          | What is in it                                                                        |
| ------------- | ------------------------------------------------------------------------------------ |
| **Inputs**    | `TextInput`, `TextArea`, `Checkbox`, `Switch`, `RadioGroup`, `Slider`, `NumberInput` |
| **Overlays**  | `Tooltip`, `Menu`, `Select`, `Dialog`, `Toast`                                       |
| **Structure** | `Tabs`, `Toolbar`, `SplitPane`, `Accordion`, `Card`, `Divider`                       |
| **Data**      | `LazyList`, `Tree`, `DataTable`                                                      |
| **Media**     | `Image`, `Icon`, `Spinner`, `ProgressBar`, `Video`                                   |

Overlays flip and shift at the edge of the viewport, follow their anchor
through a scroll, and trap focus where they should. A `Dialog` returns
focus to whatever opened it. `DataTable` shares grid tracks across
virtualized rows, which is what lets a hundred thousand of them scroll.

## Styling one

Components take their colours from the theme rather than from props, on
purpose: a `backgroundColor` prop on every control would fork the theme
at every call site. What they do take is layout:

```tsx
<TextInput label="Email" width={percent(100)} flexGrow={1} marginTop={8} />
```

They also take `rootModifiers`, which attaches behaviour to the
component's own root rather than to a box wrapped around it. That is
what a modifier needs in order to see the control's real geometry: a
`measure` on a wrapper reports the wrapper.

A modifier's arguments are compared by value when the control is
rebuilt, so one constructed in the call stays attached as long as its
options say the same thing. Declaring it once at module scope is the
cheaper habit, and the one thing that does have to be the same value
each time is a handler or a stream among those options: a fresh
function is a new argument.

If a control needs to look different from the rest of the application,
the answer is a different theme in the environment for that subtree, not
a colour prop on the control.

## When to build your own

The library is not a wall. A component is an ordinary function returning
elements, so anything the library does you can do with the same
materials: `interactive()` and `focusRing()` come from `@gesso/core`,
and the library's own controls are built out of exactly those two.

The rule worth keeping is the one the library follows: emit `role`,
`label` and `states` from the first version you write. Retrofitting
semantics across a screen already built is the expensive kind of work,
and a control with none is invisible to a screen reader and to every
test on this site.

## Next

[Light and dark](/guide/appearance) is how the theme these controls read
gets into the environment in the first place.
