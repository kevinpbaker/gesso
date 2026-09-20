---
description: The case for Gesso, in full. What it does differently, what has been measured, how it compares to the alternatives, and where it does not belong.
---

# Why Gesso

The front page makes the claim. This page is the argument behind it,
including the parts that are not flattering: what has been measured and
by what, how Gesso compares to the frameworks you would otherwise
reach for, and the kinds of screen it is the wrong tool for.

Your application has real work to do: parsing a file, diffing a
document, simulating a system, sorting a hundred thousand rows. On the
web that work and your interface share one thread of execution, so they
take turns, and the person using it watches them take turns. The pointer
sticks. The list stutters mid-scroll. The keystroke lands a beat late.

Gesso moves the entire interface somewhere else. Components, layout,
paint, text and input run in a render worker. Your application logic runs
in another. The main thread is left holding a canvas and forwarding
events, so nothing you compute can drop a frame.

**Try it.** Two copies of the same component, one in a render worker and
one on the main thread. Block the main thread for three seconds and see
which one cares.

<ThreadDemo />

Each copy advances on its own 40 ms timer and shows the longest gap it
has ever seen between two ticks. Through the block, the copy in the
worker reports **41 ms**: it did not miss a tick. The copy on the main
thread reports **3,010 ms**, which is the block itself.

## Declarative, with nothing to re-run

If you have written SwiftUI or Jetpack Compose, the shape is familiar: a
function describes a screen, and the screen follows some state. What
differs is what happens when the state changes.

| Framework   | On a state change                                                                |
| ----------- | -------------------------------------------------------------------------------- |
| **SwiftUI** | `body` is recomputed and the result is diffed against the last one               |
| **Compose** | the composable is invoked again (recomposition), with unchanged subtrees skipped |
| **Gesso**   | nothing is invoked again; one property on one node is written                    |

That difference is the one you feel while writing. There is no re-run to
make cheap, so there is nothing to memoise, no dependency array to keep
honest, no stability annotations, no `remember`, and no view identity to
reason about. Your component function runs once, so every closure in it
is stable. And the cost of a change is visible in the source: the
binding _is_ the update.

A counter, as a function component:

<LiveExample id="counter" height="180" />

```ts
function Counter(inputs, _context) {
  const label = input(inputs.label, 'Count');
  const count = internalState(0);
  const caption = computed(() => `${label.value}: ${count.value}`);

  return Row(
    { gap: 12, x: 'center', y: 'center', width: percent(100), height: percent(100) },
    Text({ text: caption, fontSize: 18 }),
    Button({ label: 'Add one', onClick: () => count.value++, backgroundColor: 'primary' }, Text({ text: '+1' }))
  );
}
```

`input(inputs.label, 'Count')` is an input with a default. `internalState(0)`
is the value this component owns, the equivalent of `@State` or
`mutableStateOf`. The caption is `computed`: one expression over the
other two, following the cells it reads, subscribed to by the node that
shows it, so it cannot be stale and there is nothing to invalidate.

JSX is optional. It compiles onto those element factories and produces
the same tree in a different spelling. This is the counter above as it
is actually written, and the file the test suite asserts on:

<<< @/src/examples/CounterExample.tsx

Neither version names a colour. `primary` is a theme token resolved when
it is painted, which is why the counter above follows this page's light
and dark toggle without being told either exists.

## What you get

- **A real layout engine.** Flex and grid with CSS's own semantics,
  typed lengths, and text that wraps, clamps and sits on a baseline, all
  checked against Chrome, so a box is the size you expect.
- **Text in every script.** Lines break where Chrome breaks them in
  Latin, Japanese, Chinese, Korean, Arabic, Hebrew, Hindi and Thai, with
  colour emoji, right-to-left paragraphs and web fonts loaded in the
  worker, on both renderers.
- **Twenty-seven components.** Inputs, overlays, tables, trees and
  media, every one of them themed, keyboard operable, and announced to
  assistive technology without you doing anything.
- **Tests without a browser.** `renderTest` queries the same tree a
  screen reader reads, so a test finds a control by asking for a
  control.
- **A hundred thousand rows at sixty frames.** Virtualization, shared
  grid tracks, and a frame cost proportional to what changed rather than
  to what is on screen.

## What is measured

Every figure here is produced by a script in the repository, and the
script is the claim.

| Claim                                               | Figure                                                                                                                          | Produced by                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Application work cannot stall the interface         | 41 ms worst tick through a 3,000 ms block, against 3,010 ms                                                                     | the demo above, which reports the same measurement over input latency                                     |
| Flex, grid, text and positioning agree with Chrome  | 239 generated cases within 0.1 px, one divergence pinned by name                                                                | `pnpm fixtures:layout` renders the cases in headless Chrome; `LayoutEngine.conformance.spec` asserts them |
| Text breaks where Chrome breaks                     | 124 paragraphs in seven faces, 116 agreeing line for line, 8 pinned by name                                                     | `pnpm fixtures:text` renders them in headless Chrome; `ParagraphLayout.conformance.spec` replays them     |
| The two renderers draw the same pixels              | under 0.03% of pixels differ per route                                                                                          | `pnpm parity:webgpu`                                                                                      |
| Every route paints what it painted                  | pixel diff against a committed baseline per route                                                                               | `pnpm screenshots`                                                                                        |
| What a screen reader is given is what the tree says | Chrome's computed accessibility tree per route, written to a committed report with every control named and the Tab order walked | `pnpm check:a11y`; VoiceOver and NVDA have not been run says so                                           |
| Every control works from the keyboard               | a form of every control tabbed through from nothing, each operated by its keys                                                  | `Keyboard.spec.ts` in `@gesso/components`                                                                 |
| It stays this way                                   | 2,850 tests in 272 files, the public surface as committed reports                                                               | `pnpm test:run`, `pnpm api:check`                                                                         |

## How it compares

The axes that decide the choice, not a feature list.

| Axis                              | Gesso                                                                                                                       | React (DOM)                                                      | Solid (DOM)                                               | Flutter Web                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Where application work runs       | its own worker, by design; the interface never shares its thread                                                            | the main thread, unless you move it and message the results back | the main thread, likewise                                 | the main thread, in Dart compiled to JS or Wasm |
| Input while the app is busy       | unaffected; the shell forwards events to a thread that is drawing                                                           | delayed by however long the work takes                           | delayed, likewise                                         | delayed, likewise                               |
| What a state change costs         | one property on one node; nothing re-runs                                                                                   | a component re-renders and is diffed                             | one signal's subscribers run; the DOM is patched in place | widgets rebuild and the element tree is diffed  |
| A shared element across screens   | FLIP over the live node, interruptible, no raster                                                                           | the View Transitions API: snapshots cross-faded by the browser   | the same API                                              | Hero animations over the live widget            |
| Text                              | its own line breaking, checked against Chrome in eight scripts and emoji; no hyphenation yet; the browser shapes the glyphs | the browser's, complete                                          | the browser's, complete                                   | its own engine, with the same class of gaps     |
| Accessibility                     | a semantics tree mirrored into an off-screen DOM; a report per route; no screen reader run against it yet                   | the DOM itself                                                   | the DOM itself                                            | a semantics tree mirrored into off-screen DOM   |
| Indexing, view source, extensions | none; not the goal                                                                                                          | complete                                                         | complete                                                  | none                                            |
| Ecosystem                         | one component library, one theme system, young                                                                              | the largest there is                                             | large                                                     | large, Dart                                     |

Read the right-hand columns as the price. If your screen is a document, or its value is being indexed, or you need the ecosystem more than the thread, they are the better tools and it is not close.

## Where it doesn't belong

Documents. Articles, marketing pages, anything whose value is being
indexed and linked: a canvas has nothing for a crawler to read. Native
form controls also bring autofill, password managers and mobile
keyboards that a canvas cannot match.

[Is Gesso for your project?](/guide/is-gesso-for-you) is the one-minute
version of that decision, with the alternatives named; [What Gesso
is](/guide/what-is-gesso) draws the line properly and says what has and
has not been proven.

## Start

[Installation](/guide/installation) is a running project in about five
minutes. [Your first component](/guide/counter) is the ten after that.
