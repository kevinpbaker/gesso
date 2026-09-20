# gesso-testing

Mount a component with no browser, query it the way a screen reader would, and read back why a box is the size it is.

```bash
npm install --save-dev gesso-testing
```

```ts
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

it('calls back on a press, and not while disabled', () => {
  const presses: number[] = [];
  const ui = renderTest(createComponent(Button, { label: 'Retry', onClick: () => presses.push(1) }));

  ui.fireEvent.click(ui.getByRole('button'));
  expect(presses.length).toBe(1);
  expect(ui.getByRole('button')).toHaveSemantics({ name: 'Retry' });
});
```

## Why the queries are what they are

`getByRole`, `getByLabel` and `getByText` -- with `query`, `getAll` and `find` variants -- answer from **the very semantics tree the accessibility mirror hands to the platform**. There is no second description of your component to keep in step: if a test can find a control, an assistive technology can too, and if it cannot, that is the bug.

`renderTest` builds, lays out and describes a tree on a manual clock over a canvas double. No browser, no `jsdom`, no canvas polyfill.

## When a box is wrong

A `toHaveBox` that misses prints `explain`'s answer underneath it, so a failed assertion tells you which rule decided the size rather than only that two numbers differ.

## Entry points

- `gesso-testing` -- `renderTest` and its queries
- `gesso-testing/matchers` -- registers the matchers with Vitest

`vitest` is an optional peer: the matchers need it, the renderer does not.

## Documentation

[Testing](https://github.com/kevinpbaker/gesso/blob/main/apps/docs/guide/testing.md)

MIT (c) Kevin Baker
