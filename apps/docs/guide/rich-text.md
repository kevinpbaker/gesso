---
description: 'Runs of style inside one paragraph: bold, italic, code, colour, underline and inline links, all in a single text element.'
---

# Rich text

A `<text>` element takes either a string or a list of runs. The runs are
what make prose possible: a word in bold, a phrase in italic, a snippet
in a monospaced face, a link the reader can press, all inside one
paragraph that breaks its lines from all of them together.

<LiveExample id="richtext" height="420" />

Everything on that card is four `<text>` elements. There is no rich
text component, and no node per word.

## Runs

`spans` replaces `text`. Each run carries its own text and the style
fields it overrides; anything it does not set it inherits from the
element, and the element from its environment, exactly as it always
did.

```tsx
<text
  spans={[
    { text: 'Read the ' },
    { text: 'guide', color: 'primary', textDecoration: 'underline', link: { href: '/guide' } },
    { text: ' before you ' },
    { text: 'ship', fontWeight: 700 },
    { text: '.' }
  ]}
/>
```

| Field                                       | What it changes                                    |
| ------------------------------------------- | -------------------------------------------------- |
| `fontFamily`, `fontSize`, `fontWeight`      | The face the run is measured and drawn in          |
| `fontStyle`                                 | `normal`, `italic` or `oblique`                    |
| `fontStretch`, `fontVariant`, `fontKerning` | The width axis, small caps, and the font's kerning |
| `letterSpacing`                             | Tracking, for this run only                        |
| `color`, `backgroundColor`                  | A value or a theme token, resolved per run         |
| `textDecoration`                            | `underline`, `line-through`, or both               |
| `link`                                      | Makes the run pressable; see below                 |

The first seven change how wide the run measures, so a paragraph is
laid out again when one of them changes. The last three do not: a run
that changed only its colour, its background, its underline or its
handler is repainted from the lines the layout already found.

## One string, whatever the runs

This is the rule everything else follows from. **The runs' texts
concatenated are the paragraph**, so an offset into it means the same
thing to every layer:

- the line breaker measures each run in its own font and breaks the
  line from all of them,
- a selection crosses a run boundary without noticing one,
- find-in-page matches text that starts in one run and ends in another,
- and the accessibility mirror reads the paragraph as prose.

A run is a shape of a paragraph rather than a node inside it, which is
why none of that needed a second tree.

## Inline links

A run with a `link` is pressable. It shows a pointer cursor, lights up
under the pointer with a wash of its own colour and an underline, and
runs `onClick` when a press is released where it landed. A press that
drags is a selection instead, as it is on a page.

```tsx
{ text: 'the reference', color: 'primary', link: { href: '/reference', onClick: open, label: 'the API reference' } }
```

`label` names the run for a screen reader when its own words would not:
"here" and "read more" are links nobody can use out of context. `href`
is carried for the application's own use; the runtime never navigates
to it.

In the accessibility mirror the paragraph becomes a `paragraph` whose
children are the prose and the links in reading order, so a screen
reader reaches the link the way it reaches one in a page rather than
hearing its words go past inside a sentence.

## A markdown document

The example above is a markdown reader in forty lines. Blocks become
elements and inline markers become runs:

<<< @/src/examples/RichTextExample.tsx#blocks

And the document is one element per block, with a heading differing
from a paragraph only in size and weight:

<<< @/src/examples/RichTextExample.tsx#document

## The line box

A run inherits the paragraph's line height as a length, so a run
smaller than the paragraph does not change the line and a run larger
than it grows the line around its own box, which is what CSS does with
the same two inline boxes.

Where Gesso differs from a browser is that **every line of a paragraph
gets the tallest line's box**. A paragraph is its line count times one
line height here, and both renderers step by that. Keep a run's size
close to its paragraph's and the two agree exactly; the fixture that
pins the difference is `runs/a-taller-run-grows-only-its-own-line`.

## What is not here

Justified text and hyphenation are still deferred. Font features
beyond the ones in the table above are not reachable: a canvas font
string carries style, variant, weight, size and family and nothing
else, so `tnum` and `liga` cannot be asked for from here. A variable
font's `wght` is reached through a numeric `fontWeight` and its `wdth`
through `fontStretch`.
