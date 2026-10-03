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
| `hidden`                                    | Keeps the run in the text but draws nothing for it |
| `color`, `backgroundColor`                  | A value or a theme token, resolved per run         |
| `textDecoration`                            | `underline`, `line-through`, or both               |
| `link`                                      | Makes the run pressable; see below                 |

The first eight change how wide the run measures, so a paragraph is
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

## Runs in a field being typed into

`<editabletext>` takes `spans` too, and there it means something
narrower. A `<text>` gets its paragraph _from_ its runs; a field's
paragraph belongs to the thing the user is typing, so its runs only
describe that text rather than supplying it.

```tsx
<editabletext
  value={formula}
  spans={[{ text: '=' }, { text: 'A1', color: 'primary' }, { text: '+' }, { text: 'B2', color: 'danger' }]}
/>
```

**The runs' texts concatenated have to equal `value`.** When they do
not, the field draws its text plainly and ignores them. That is not a
nicety: every offset a field works in (the caret, the selection, the
hit test that turns a click into a text position) is an offset into
the string the model holds, so runs describing a different string
would put the glyphs where the caret does not agree with them, and the
field would look subtly and unfixably wrong. A frame of plain colour
while the application catches up is the better failure.

Everything else about a field is unchanged: it still scrolls its own
text, still shows a placeholder, still carries a caret and a
selection.

## Hidden runs

A run with `hidden: true` stays in the text and leaves the picture: it
takes no room, the line breaker counts it as nothing, and neither
renderer draws it. Its characters keep their offsets, so a selection,
a copy, find-in-page and undo all still see them. It is how a markdown
editor draws `**bold**` as a bold word while the asterisks stay in the
string being typed, which the rule above insists on.

```tsx
<editabletext
  value="**bold** text"
  spans={[
    { text: '**', hidden: true },
    { text: 'bold', fontWeight: 700 },
    { text: '**', hidden: true },
    { text: ' text' }
  ]}
/>
```

In a field, the caret treats each stretch of hidden text (runs that
touch count as one) as a unit it cannot stop inside, so every key moves
something you can see:

- **Arrows** cross one visible character, or with the word modifier one
  visible word, and the hidden text in the way. They stop on the side
  of any hidden text there nearest where they started: from the end of
  `**bold**`, Left stops between `l` and `d`; from just after the `d`,
  Right goes over the markers and on. Where nothing visible is left in
  that direction the caret goes past the hidden text to the end, and
  in an editing group it goes on to the next field.
- **Backspace and Delete** remove the visible character or word next to
  the caret and keep hidden text at either end of it: Backspace at the
  end of `**bold**` leaves `**bol**`. Hidden text strictly inside what
  they remove goes with it. A selection is deleted exactly as selected,
  hidden text included. Where nothing visible is left in that
  direction they delete nothing.
- **A press** lands on the nearest boundary as always. Where hidden
  text sits there, both its ends are drawn at one x, so the side of the
  press decides: before the boundary (left of it, in left-to-right
  text) is before the hidden text, past it is after. A double click
  selects the word as drawn, with hidden text inside the word included
  and hidden text round it left out.
- **The selection highlight** skips hidden text, which has no width to
  highlight; `selectedText` and a copy still include it.
- **An offset the application sets** with a selection is kept as given,
  even inside hidden text, since the application may be about to show
  that text. The next move steps out of it.
- **An IME** composes at the caret as usual. While it composes the
  application has not been told about the new characters, so its runs
  describe the text without them; rather than dropping the runs and
  showing every hidden marker until the commit, the field moves them
  to make room. The composing text joins the visible run it is typed
  at the end of or inside, and is never made hidden.

The accessibility mirror, and the editing proxy a screen reader reads a
field through, still have the whole text, hidden runs included: a
screen reader hears `**bold**` with its asterisks. That is a known
limitation, not a decision.

## What is not here

Justified text and hyphenation are still deferred. Font features
beyond the ones in the table above are not reachable: a canvas font
string carries style, variant, weight, size and family and nothing
else, so `tnum` and `liga` cannot be asked for from here. A variable
font's `wght` is reached through a numeric `fontWeight` and its `wdth`
through `fontStretch`.
