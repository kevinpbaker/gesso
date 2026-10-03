# Working on this project

Notes for a coding agent, and for anybody else new to Gesso. `README.md`
has this project's commands and what each of its files is for; this
file is the framework's rules, which are the part a model trained mostly
on React will get wrong.

The full documentation is written for a person and also published for a
model:

- https://gesso-docs.vercel.app/llms.txt, an index of every page
- https://gesso-docs.vercel.app/llms-full.txt, every page in one file
- any page with `.md` on the end, e.g. https://gesso-docs.vercel.app/guide/counter.md

## What Gesso is not

There is no DOM, no CSS, no React and no virtual DOM. The interface is
a tree of retained nodes, laid out by Gesso's own engine and drawn into
a `<canvas>` from a worker. So:

- no `div`, `className`, `style`, stylesheets or Tailwind;
- no `useState`, `useEffect`, `useMemo`, `useCallback` or dependency arrays;
- no `document` or `window` in a component. It runs in a worker.

## Components run once

A component is a function of its inputs and a context. It is called
**once**, when it mounts, and never again. What it returns stays on
screen, and everything that changes is an Observable bound into it.

```tsx
import { Button } from 'gesso-components';
import { computed, input, internalState, type ComponentContext, type Inputs } from 'gesso-framework';

export function Counter(inputs: Inputs<{ label?: string }>, _ctx: ComponentContext) {
  const label = input(inputs.label, 'Count'); // a prop with a default, still live
  const count = internalState(0); // state this component owns
  const caption = computed(() => `${label.value}: ${count.value}`);

  return (
    <row gap={12} y="center">
      <text text={caption} textStyle="title" />
      <Button label="Add one" onClick={() => count.value++} />
    </row>
  );
}
```

- **Bind, don't read.** `text={caption}` follows every change.
  `text={caption.value}` in the body is a snapshot taken once, and the
  screen silently never updates. Read `.value` in handlers and inside
  `computed`, not in the body.
- Any Observable binds, so `count.pipe(map(n => ...))` is as good as a
  `computed`.
- **Lists** are `<Each of={rows} by="id">{row => <Row row={row} />}</Each>`.
  Always give `by`.
- **Conditionals** are `<Show when={open}>{() => <Panel />}</Show>`.
- **Side effects** go through the context: `ctx.effect(source, fn)`,
  `ctx.onMount(fn)` and `ctx.onUnmount(fn)`. Services come from
  `ctx.inject(Service)` and channels from `ctx.channel(Token)`.
- Splitting a component never helps performance. Split for readability.

## Layout

- `<row>`, `<column>` and `<box>` (layered). Lowercase elements are
  intrinsic; capitalised ones are components and are imported.
- `x` and `y` place children on a row and a column alike. They replace
  `justify-content` and `align-items`. `selfX` and `selfY` override them
  for one child.
- The cross axis defaults to `stretch`, as in CSS. A child with its own
  size keeps it.
- A length is a number of pixels or a value from `gesso-core`:
  `percent(100)`, `auto`. It is never a string like `'100%'`.
- `gap`, `padding`, `flex`, `width` and `height` are typed props. A
  wrong prop or value is a compile error, so run the typechecker.

## Appearance

- **No hex colours.** Colours are names from the theme: `background`,
  `surface`, `primary`, `secondary`, `text`, `textMuted`, `border`,
  `danger` and the `control*` family. A screen written this way follows
  light and dark without knowing about either.
- **No font sizes where a role exists.** Use `textStyle="title"` (also
  `headline`, `body`, `bodyLarge`, `bodySmall`, `label`).
- Prefer the controls in `gesso-components` (`Button`, `TextInput`,
  `Switch`, `Select`, `Dialog`, `DataTable`, ...) to building them from
  boxes. They are themed, keyboard-operable and announced to screen
  readers already.

## State that crosses a thread: channels

Data that is authoritative, outlives a screen, or lives on another
thread goes behind a **channel**: a token both sides import, holding
only names and shapes.

```ts
import { defineChannel } from 'gesso-framework';

/** The notes the person has written. */
export const Notes = defineChannel('notes', {
  view: { rows: [] as readonly NoteRow[], status: 'loading' as 'loading' | 'ready' },
  commands: {} as {
    /** Opens a note in the editor. @param id The note's id. */
    open(id: string): void;
    /** Deletes a note for good. @destructive @confirm */
    remove(id: string): void;
  }
});
```

- Only **plain data** crosses: primitives, arrays and plain objects.
  No `Date`, `Map`, `Set` or class instances. Flatten them where they
  are made.
- Commands return `void`. The effect comes back as a change to the view,
  never as a return value.
- A component reads `ctx.channel(Notes).view.rows` like any other cell
  and calls `ctx.channel(Notes).send.open(id)`.
- **Write the JSDoc.** `gesso-vite-plugin` turns each contract into JSON
  Schema on the token, with descriptions taken from those comments. It
  is what an AI agent driving the app reads to understand it. Mark a
  command `@destructive` if it cannot be undone, `@confirm` if a person
  should approve it first, `@idempotent` if repeating it changes
  nothing, and `@hidden` to keep it from agents.

## Checking your work

You cannot see a canvas by reading the DOM. The places that tell you
what the app is doing:

- **The typechecker.** Most mistakes in a Gesso tree are type errors.
  Run it after every change.
- **Tests without a browser.** `gesso-testing` mounts a component in
  node and queries it the way a screen reader would. Add `gesso-testing`
  and `vitest` as development dependencies to use it:

  ```ts
  import { createComponent } from 'gesso-framework';
  import { renderTest } from 'gesso-testing';
  import 'gesso-testing/matchers';

  const ui = renderTest(createComponent(Counter, {}), { width: 400, height: 200 });
  ui.fireEvent.click(ui.getByRole('button', { name: 'Add one' }));
  ui.frame(); // frames run when the test says so
  expect(ui.getByText('Count: 1')).toBeDefined();
  ```

  A failed query prints the semantics tree, so read it rather than
  guessing. `ui.explainText(node)` says in sentences why a box is the
  size it is. Use `await ui.settle()` for anything that arrives later
  than the next frame, such as a channel patch.

- **In a browser,** the app keeps an accessibility mirror in the DOM
  under `[data-gesso-semantics]`. It is one element per meaningful node,
  with its role, its name and its position over the canvas. A browser
  automation tool's accessibility tree reads it, and clicking those
  elements clicks the app. A screenshot shows what was drawn.
- **Driving the running app.** While `pnpm dev` runs, the dev server
  serves MCP at `/__gesso/mcp` and prints the `claude mcp add` line
  for it. Connected, you can read every channel's view and send its
  commands to the page open in the browser, which is the quickest way
  to check that a command does what it should.
- **Agents in the browser.** `createApp({ webmcp: true })` registers the
  same tools with WebMCP, for an agent the browser runs. The dev
  server turns it on already; nothing happens in a browser without it.
- **Errors** from the render worker are drawn over the app by the dev
  overlay, source-mapped. They also reach the browser console.
