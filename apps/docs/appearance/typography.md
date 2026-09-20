---
description: 'The type scale: what a text style holds, how one provided in the environment reaches text that names nothing, and how an application replaces it.'
---

# The type scale

A text style in Gesso is a value, not a class name, and the one in the
environment is what text falls back to. So a `<text>` that names no
size, no weight and no face is not unstyled: it is styled by whatever
scale was provided above it.

<LiveExample id="typography" height="380" />

Every sample above names only its own words. The size beside each one is
read from the style that row provides, and the button swaps the scale
the whole column is under.

## What a text style holds

`UiTextStyle` is eight fields, and each one is also a prop you can set
on a node:

| Field           | Prop            | Notes                                                                                           |
| --------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| `fontFamily`    | `fontFamily`    | A CSS family list, as a string                                                                  |
| `fontSize`      | `fontSize`      | Logical pixels                                                                                  |
| `fontWeight`    | `fontWeight`    | `'normal'`, `'bold'`, or a number                                                               |
| `lineHeight`    | `lineHeight`    | Logical pixels, not a multiplier                                                                |
| `letterSpacing` | `letterSpacing` | Logical pixels of extra space per character                                                     |
| `color`         | `color`         | Where text gets its colour, and not from the theme                                              |
| `textAlign`     | `textAlign`     | `start` (the default), `end`, `left`, `center` or `right`; start and end follow `textDirection` |
| `textDirection` | `textDirection` | `ltr` or `rtl`                                                                                  |

The style is the unit of inheritance, which is why it carries a colour.
Providing a theme does not colour your text: the palette answers
`color="text"` when a node names that token, and text that names
nothing takes the colour out of the style in the environment instead.
A root therefore provides both, which is exactly what the eight lines
on [light and dark](/guide/appearance) do.

## How a provided style reaches text that names nothing

Each of those eight props is an inherited property, and resolving one
goes in this order:

1. The value set on the node.
2. The matching field of the `textStyle` in the environment.
3. The property's own default, which is the 14 pixel sans-serif black
   of `defaultTextStyle`.

Because the fall-back is per field rather than per style, a node that
sets one property keeps the rest of the scale. A heading that wants the
scale's headline in a heavier weight sets `fontWeight` and nothing
else, and a line that sets `fontSize` still follows the scale's face,
colour and alignment when the scale is swapped underneath it. The spec
for this page asserts that directly.

Providing a style is a prop on any element, so a subtree gets one the
same way it gets a theme:

<<< @/src/examples/TypographyExample.tsx#role

## Name the role, not the numbers

The idiom to write is a role:

```tsx
<text textStyle="title">Now playing</text>
```

`textStyle` takes a role name as well as a style, and a name is looked
up in the theme the element is under. The line it replaces is this
one:

```tsx
<text fontSize={20} fontWeight={500} lineHeight={24}>
  Now playing
</text>
```

Those three numbers are three things to keep in step across a screen
and eighteen across an application, and none of them follows a theme.
A role is one word that does, so the same heading is one size under the
shipped scale and another under a compact one, and the element does not
change. A role is also legal on a container, where it sets the type for
everything below it, which is how a card gives its whole body one size
without a prop on each line.

Set a property beside the role when one value genuinely differs:
resolution is per field, so `<text textStyle="title" color="primary">`
takes the size, weight, line height and face of `title` and the palette
for its colour. A number written on an element should be the exception
that proves a role is missing from the scale.

## The scale's roles

A `UiTypography` names six styles. The list is the interface's, so a
component asks for a role by name and every scale answers:

<<< @/src/examples/TypographyExample.tsx#roles

What the shipped scale sets them to, in logical pixels:

| Role        | Size | Weight   | Line height | Tracking |
| ----------- | ---- | -------- | ----------- | -------- |
| `headline`  | 24   | `bold`   | 28.8        | 0        |
| `title`     | 20   | `500`    | 24          | 0        |
| `bodyLarge` | 16   | `normal` | 19.2        | 0        |
| `body`      | 14   | `normal` | 16.8        | 0        |
| `bodySmall` | 12   | `normal` | 14.4        | 0        |
| `label`     | 11   | `500`    | 13.2        | 0.5      |

The face is `sans-serif` throughout, and the colour is black in
`lightTheme` and white in `darkTheme`. That is the whole difference
between the two scales that ship, which is a fair summary of how much
opinion the framework has about type.

A scale lives on a theme, as `theme.typography`, and a role is an
ordinary value, so `theme.typography.title` is what you hand to a
`textStyle` prop.

## Replacing the scale

An application's scale is a function from the shipped one to its own,
built role by role:

<<< @/src/examples/TypographyExample.tsx#scale

Building each role from the shipped one rather than from nothing is
what keeps the fields you did not restate, the colour above all, so the
result is still legible in both appearances. Then provide it, and every
descendant that names nothing follows:

<<< @/src/examples/TypographyExample.tsx#provide

Swapping the value writes properties onto the nodes that already exist.
Nothing is rebuilt, and the samples re-measure because a font size is a
layout input rather than a paint one: the spec asserts that the same
node gets both a larger resolved size and a taller box.

## Extending it

Six roles cover a document. An application has more to say than that:
the two built on this framework used seventeen distinct sizes between
them before they had roles. So a scale of your own may carry more than
the six, a theme holds it, and `textStyle` resolves a name against
whatever the scale actually carries.

Declare the names so they type. `UiTypographyExtensions` is an empty
interface for exactly this, and merging into it adds your names to the
ones `textStyle` accepts:

```ts
declare module 'gesso-core' {
  interface UiTypographyExtensions {
    readonly strong: unknown;
    readonly display: unknown;
  }
}
```

The value type is not read; only the key is, because what the theme
carries is always a `UiTextStyle`. What it buys is completion on
`textStyle=` and a compile error on `textStyle="stong"`, which is the
one thing a stringly typed name would otherwise cost you.

Then build the roles into the scale beside the six, and provide it:

```ts
const scale = {
  ...lightTheme.typography,
  strong: { ...lightTheme.typography.body, fontWeight: 700 },
  display: { ...lightTheme.typography.headline, fontSize: 44, lineHeight: 48 }
} as UiTypography;
```

Two scales are compared over the keys they carry, so a role of your own
invalidates the subtree that reads it exactly as a shipped one does.

## Fonts, and what is not here

A family is a string handed to the renderer, so the faces available are
the ones the page has already loaded. Loading a font is the shell's
job, not the render worker's, and there is no font loading API in these
packages: the site's own examples ask for `sans-serif` and `Georgia,
serif` because those need no loading at all. A family that is not
available falls back the way it would in CSS, and text is measured with
whatever the browser actually resolved, so nothing is misplaced by the
substitution.

Wrapping, clamping and baseline alignment are [text](/guide/text)'s
subject rather than the scale's.

## What this page was checked against

The spec mounts the example with `gesso-testing` and asserts resolved
values: the size, line height, face and colour a sample takes from the
provided style, that they move when the scale is swapped, that the box
grows with them, and that a size named on the node survives the swap.
Those numbers come from the deterministic test measurer rather than
from a font, so they prove which style was resolved and not what the
glyphs look like. For that, the canvas above was watched in Chrome on
the Canvas2D renderer: swapping the scale moves the six samples to the
serif face and its larger steps, and leaves the last line at the size
it names. WebGPU and other browser engines were not checked here.
