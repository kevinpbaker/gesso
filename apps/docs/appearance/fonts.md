---
description: 'Web fonts on a canvas: declaring a family and its fallback stack, loading it into the render worker, and what happens to text while the file is on its way.'
---

# Fonts

A canvas draws text with the fonts its thread can see. A web font the
page loaded with `@font-face` is not one of them: the render worker has
a font set of its own, and until a face is added there, text in that
family draws in whatever the fallback resolves to. Gesso loads declared
fonts into the worker itself and lays the tree out again as each one
arrives.

## Declaring a family

Fonts are declared where the app is, in the render worker, beside its
routes and its media resolver:

```ts
renderRoot(AppRoot).useFonts([
  {
    family: 'Inter',
    faces: [{ source: new URL('./Inter-Variable.woff2', import.meta.url).href, weight: '100 900' }],
    fallback: ['system-ui', 'sans-serif']
  },
  {
    family: 'JetBrains Mono',
    faces: [
      { source: '/fonts/JetBrainsMono-Regular.woff2', weight: 400 },
      { source: '/fonts/JetBrainsMono-Bold.woff2', weight: 700 }
    ],
    fallback: ['ui-monospace', 'monospace']
  }
]);
```

Each face is a `@font-face` rule in object form: a `source`, which is a
URL the worker can fetch or an `ArrayBuffer` of the font's bytes, and
the descriptors CSS knows, `weight`, `style`, `stretch`, `unicodeRange`
and `display`, in their CSS spellings. A variable font is one face with
a weight range.

The single-thread twin is `createSyncApp(AppRoot).useFonts([...])`, which
loads into `document.fonts` instead.

## Naming the family

Text names the family alone:

```tsx
<text fontFamily="Inter" fontSize={16}>
  The quick brown fox
</text>
```

The fallback stack is declared once, with the family, and applied
everywhere a font string is built: the measurer, the Canvas2D
renderer and the WebGPU glyph atlas all resolve `Inter` to
`Inter, system-ui, sans-serif`. A measurement and the glyphs drawn from
it can never disagree about which fonts they meant. A family nobody
declared passes through unchanged, so a text style whose `fontFamily`
is already a list, `'Georgia, serif'`, keeps working.

A type scale can name a declared family too; provide it in the
environment as [the type scale](/appearance/typography) describes and
every text under it inherits the face.

## While the file is on its way

Text draws in the fallback until its face has loaded, then moves once,
as `font-display: swap` moves it. The move is a full pass: every cached
width is dropped, the WebGPU atlas forgets its glyphs, and the layout
engine measures the whole tree again, because any width measured in the
fallback is wrong in the face that was meant. That pass happens once per
face, on the frame after it arrives.

A component that would rather show nothing than the fallback can ask:

```ts
@Inject(FontService) fonts!: FontService;

// 'loading' until every face of the family settled, then 'loaded' or 'error'.
this.fonts.statusOf('Inter');
// Resolves once every declared face has loaded or failed.
await this.fonts.ready;
```

`statusOf` answers `undeclared` for a family that was never declared,
and `unavailable` on a thread with no font set at all, which is what a
test environment is: the stack is still registered, and nothing loads.

## What is and is not here

- Faces are shared across runtimes on a thread. Two runtimes in one
  worker that declare the same URL share one `FontFace`, and disposing
  a runtime never removes a face, because the other may be drawing with
  it.
- A face that fails to load leaves the family in the fallback and
  reports `error`; nothing is retried.
- Metrics overrides (`ascent-override`, `size-adjust`) are not declared
  here. A fallback with different metrics will shift the baseline when
  the real face arrives, by the difference between the two fonts.
- Fonts are not preloaded by the shell. The worker fetches them when
  `init` arrives, which is the earliest moment it exists.
