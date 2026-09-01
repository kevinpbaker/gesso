---
description: Wrapping, clamping and ellipsis; how a paragraph sizes its box; and why baseline alignment exists.
---

# Text

Text is the input to most layout decisions. A `<text>` element is not a
rectangle with a string in it — it is measured, broken into lines, and
sized by what it says, and the box around it is decided by that.

The card below is 420 px wide. Press the button to narrow it and watch
which parts answer:

<LiveExample id="text" height="360" />

<<< @/src/examples/TextExample.tsx#card

The body re-wraps and gets taller. The title, clamped to two lines, does
not — it drops what will not fit and ends in an ellipsis. Both are the
same element with different props.

## Styling

```tsx
<text
  text="Ready"
  fontSize={16}
  fontWeight={600}
  fontFamily="Inter, system-ui"
  color="text"
  textAlign="center"
  lineHeight={1.4}
  letterSpacing={0.2}
/>
```

`color` takes a theme token as readily as a value, which is why nothing
in these examples names a hex code. Text that sets neither size nor
colour inherits both from the type scale in the environment — see
[light and dark](/guide/appearance) for what provides that.

## Wrapping, clamping, ellipsis

| Prop           | What it does                                                          |
| -------------- | --------------------------------------------------------------------- |
| `textWrap`     | `word` (the default), `char`, or `none`                               |
| `maxLines`     | Stop after _n_ lines                                                  |
| `textOverflow` | `clip` (the default) or `ellipsis`, for what a clamped line ends with |

A clamped title is the common case and worth spelling out: `maxLines`
alone truncates, and `textOverflow: 'ellipsis'` is what makes the
truncation legible.

## How a paragraph sizes its box

Width is CSS `fit-content`: given room to choose, a paragraph takes what
it wants up to what it is offered. Two rules follow, and between them
they explain most surprises:

- **A tight bound is authoritative.** Told exactly how wide to be, text
  wraps to that width.
- **A loose bound is available space, not a clamp.** Told "up to this
  much", text takes what it needs — and content that does not fit
  overflows, exactly as it would in a browser.

Flex sizing then runs twice around this: items are measured at their
max-content width to resolve the main axis, and any item whose width
changed is measured again at the width it ended up with. That second
pass is what makes a wrapped paragraph's height right instead of
approximately right.

## Baseline alignment

`y="baseline"` on a row puts its children on a shared text baseline
rather than on their box edges or centres, which is the only way a
22-pixel number and a 12-pixel label look like they belong on one line:

```tsx
<row gap={8} y="baseline">
  <text text="1,284" fontSize={22} fontWeight={600} />
  <text text="words measured" fontSize={12} color="textMuted" />
</row>
```

Baselines come from the font's own metrics, and a box with no text in it
gets a synthesised one the way CSS specifies, so a badge or an icon can
sit in a baseline-aligned row without falling out of it.

## One measurer

Layout, both renderers and the editing caret all break lines through the
same `layoutParagraph`. That is a correctness property rather than an
implementation note: a line cannot wrap in one place for layout and
another for paint, and a caret cannot land between two characters that
the renderer drew somewhere else.

The consequence for you is that text costs measurement. It is memoised
per node and per constraint — an unchanged paragraph is not measured
again on a later frame — but a screen that re-wraps a thousand
paragraphs on every keystroke is doing real work, and the frame profiler
will say so.

Text you can _edit_ — a caret, a selection, composition from an IME — is
a different subject from text you lay out, and lives in
`EditableText` and the `TextInput` component rather than in these props.

## Next

[Light and dark](/guide/appearance) is where the type scale and the
colours these examples inherit actually come from.
