---
description: 'Button: the themed wrapper over the button element, with variant, tone and size, one label that is both the words and the name, and the interaction and focus ring already on it.'
---

# Button

`Button` is the themed control over the `<button>` element. The element
is the thing the hit tester, the focus manager and both renderers know
about, and it stays exactly what it was; what the component adds is
everything an application otherwise writes at each call site.

```tsx
<Button label="Sign in with Audius" onClick={signIn} />
```

That one line is padding, a corner radius, a pair of palette tokens, a
hover, a press, a focus ring, a pointer cursor, an accessible name and
the words on the face of the button. Written out on the element it was
ten props and a nested `<text>`, and Segue had thirty-nine of them.

## One label

`label` is the words and the accessible name at once, because in a
button that has words on it they are the same thing, and two props are
two things to keep in step.

A button whose face is a glyph or an image is the case where they
genuinely differ, and it is the case that needs saying. Pass the
content as the child and keep `label` as the name:

```tsx
<Button label="Play" variant="plain">
  <Icon src={play} size={20} />
</Button>
```

`description` is there for a name that cannot carry everything a person
needs to know before pressing:

```tsx
<Button
  label="Continue in this tab"
  description="Opens Audius's own sign-in page as a full-page navigation, which no blocker can stop"
  onClick={redirect}
/>
```

## The three axes

| Axis      | Values                                 | What it says                      |
| --------- | -------------------------------------- | --------------------------------- |
| `variant` | `filled`, `tonal`, `outlined`, `plain` | How much of the surface it claims |
| `tone`    | `neutral`, `accent`, `danger`          | What the action means             |
| `size`    | `small`, `medium`, `large`             | How big it is                     |

`filled` is for the one action a screen is about, `tonal` for a
secondary one beside it, `outlined` where a filled button would be too
loud, and `plain` for something that is really a link. The defaults are
`filled`, `neutral` and `medium`.

```tsx
<row gap={8}>
  <Button label="Save" />
  <Button label="Discard" variant="tonal" />
  <Button label="Delete" variant="outlined" tone="danger" />
  <Button label="Cancel" variant="plain" />
</row>
```

The twelve combinations of variant and tone are a table of palette
names, which is why none of them says anything about light or dark:
`controlForeground` on `controlBackground` is ink on chalk in one
appearance and chalk on ink in the other, so a filled neutral button
inverts with the toggle and nothing in the component branches.

The three axes are read once, when the button is built, because a
variant chooses which interaction modifier goes on the element and a
modifier list is fixed for the life of an element. A button that has to
change variant should change its `key`, which builds a new one.

## Props

| Prop          | Type            | Default     | What it does                                                        |
| ------------- | --------------- | ----------- | ------------------------------------------------------------------- |
| `label`       | `string`        | `''`        | The words on it, and the accessible name                            |
| `description` | `string`        | `''`        | Longer help, for a label that cannot say everything                 |
| `variant`     | `ButtonVariant` | `'filled'`  | How much of the surface it claims                                   |
| `tone`        | `ButtonTone`    | `'neutral'` | What the action means                                               |
| `size`        | `ButtonSize`    | `'medium'`  | How big it is                                                       |
| `disabled`    | `boolean`       | `false`     | Refuses presses and draws in the disabled foreground token          |
| `busy`        | `boolean`       | `false`     | Refuses presses and announces `busy`, without looking disabled      |
| `onClick`     | `() => void`    | none        | Fired on a press and on Enter or Space, which the element handles   |
| `children`    | `UiChild`       | the label   | Content instead of the words; `label` stays the name                |
| `ref`         | `UiNodeRef`     | none        | Receives the node that _is_ the button, for focus and for anchoring |

Layout props pass through, as they do for every control in the library:
`width`, `flex`, `margin` and the rest go on the button itself, so a
caller can place it without wrapping it in a box.

`busy` and `disabled` are different states on purpose. A button that is
saving is not a button you may not press; it is one that is already
doing what you would press it for, and it says so as `busy` rather than
going grey and losing its place in the tab order.

## Hover, press and focus

Built in, and not a prop.

Three of the four variants have a ground of their own to move, so they
hover to `controlBackgroundHovered` and press to
`controlBackgroundPressed`, which is what every other control in the
library does. `filled` has nowhere to move to: its ground is already
the accent or the ink, and there is no `controlAccentHovered` token. So
it dims instead, to 0.88 and then 0.76, which reads as a press for the
same reason a key darkens under a finger and which works on every tone
in both appearances.

The cursor is `pointer` and the focus ring is `CONTROL_FOCUS_RING`, the
same one the inputs tier draws. Neither is optional: a clickable thing
says so under the pointer, and a control the keyboard can reach shows
where the keyboard is.

## Colours, and everything else about how it looks

None of them are props. `Button` reads the control tokens from whatever
theme it inherits, like everything else in the library. Restyling one
is a theme provider around it:

```tsx
<box theme={warningTheme}>
  <Button label="Publish" />
</box>
```

That is the mechanism [themes and the
environment](/appearance/themes-and-the-environment) describes, and it
is why no page here has a `backgroundColor` on a control.

Its metrics work the same way. The padding, the radius and the type
role of each size, which palette tokens each variant and tone use, and
how far a filled button dims under the pointer are all tokens in the
`controlTokens` group, so a theme can change any of them without the
component growing a prop. [Restyling the
controls](/components/restyling) is that group in full.

## What this page was checked against

`Button.spec.ts` mounts the component with `gesso-testing` and asserts
the label as both the words and the name, that a press calls back and a
disabled or busy one does not, that every one of the twelve variant and
tone pairs names a palette entry rather than a colour, that the cursor
is `pointer`, that hovering writes the hover token on a surfaced
variant and the dimmed opacity on a filled one, that the size changes
the padding, and that the words carry a type role rather than a size.
`themeTokens.spec.ts` asserts the restyling above: a provider moving
the padding, the radius and the type role, a variant remapped onto
different palette tokens, a theme naming how far a filled button dims,
and a button under no provider drawing exactly the stock values.
The component has no live example on this site yet, so nothing on this
page was watched in a browser; Segue's sign-in dialog is where it was
first used.
