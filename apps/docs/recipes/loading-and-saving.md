---
description: 'A screen that loads, fails, retries and saves: a keyed request, an optimistic write, and the five status words every screen uses.'
---

# Loading, failing, and saving

Loading, failure, cancellation and optimism are the shape of almost
every screen, and they are the part most applications write out by
hand on each one. Two helpers cover it: `resource` for a request, and
`mutate` for a write. Neither is required, and the last section says
what an application that wants none of it keeps.

Both live in `gesso-framework/worker`, the entry an application
worker imports. It carries the cells, the barrier and these two
helpers, and none of the runtime, the components or the renderers, so
importing it in a data layer costs nothing and leaves that layer
testable in bare vitest.

## One vocabulary for a request

A request is in one of five states, and they are named once so
screens stop inventing their own:

| Status    | Means                                                                   |
| --------- | ----------------------------------------------------------------------- |
| `idle`    | nothing has been asked for                                              |
| `loading` | a request is out and there is nothing to show                           |
| `ready`   | there is a value, whether or not a refresh is still in the air          |
| `missing` | the answer was that there is no such thing                              |
| `failed`  | the request could not be answered, and there is nothing to fall back on |

Two of those need saying out loud. A refresh running behind a value
that is already on screen is `ready`, not `loading`: what the reader
is looking at is real, and covering it with a spinner would be a lie.
And `missing` and `failed` are reported only when there is nothing to
fall back on, so a refresh that fails over a page you already have
leaves the page there and stays `ready`, with the error still readable
on `error`.

There is no `empty`. A list that loaded and holds no rows is `ready`
with an empty array: that is a judgement about the value, and the
screen that cares makes it.

## The request

```ts
import { internalState, resource } from 'gesso-framework/worker';

export class Pages {
  private readonly ref = internalState<PageRef | null>(null);

  readonly page = resource(this.ref, ref => this.api.page(ref.handle, ref.slug));

  show(ref: PageRef | null): Promise<void> {
    this.ref.value = ref;
    return this.page.settled;
  }
}
```

The key says what to fetch and writing it is what asks. Every value
the key emits is a request, and an answer is published only if its
request is still the current one, so opening a page, going back and
opening another before the first answers does not end with the first
answer on screen. That guard is the generation counter every screen
that loads anything used to keep by hand.

A `null` key is "nothing is being asked for": `idle`, no value, and no
fetch. A fetch that resolves `null` is `missing`. `settled` is the
request in the air as a promise, so a method that writes the key and
returns it reads like an ordinary async call.

## A skeleton

```tsx
<Show when={computed(() => pages.view.status.value === 'loading')}>{() => <Skeleton lines={6} />}</Show>
```

One call, and it is the reason the status names are chosen once: the
screen compares against a word the framework defined rather than one
this screen invented. Read [lists and conditionals](/guide/lists-and-conditionals)
for what `Show` costs.

If the page is one that has been seen before, the skeleton never
appears at all. Give the resource a `peek` and it shows what is
already held, synchronously, and marks it `ready` while the request
runs behind it:

```ts
readonly page = resource(this.ref, ref => this.fetch(ref), {
  peek: ref => this.store.get(pathOf(ref))
});
```

That is the whole of the store-first rule: a page opened twice is
instant the second time and correct a moment later, and Back is never
a spinner.

## A failure, with retry

```tsx
<Show when={computed(() => pages.view.status.value === 'failed')}>
  {() => <Button label="Try again" onClick={() => pages.send.retry()} />}
</Show>
```

`retry()` asks again for the same key and, unlike a new key, does not
blank what is on screen first: somebody pressing retry is asking for
the thing they can see to be brought up to date, and clearing it would
be a worse answer than the stale one.

The message is on `error`, as a string rather than an `Error`, because
a message is what a screen shows and what crosses the barrier.

## An optimistic like

```ts
import { internalState, mutate } from 'gesso-framework/worker';

const toggled = (list: readonly string[], id: string): readonly string[] =>
  list.includes(id) ? list.filter(entry => entry !== id) : [...list, id];

export class Library {
  private readonly ids = internalState<readonly string[]>([]);

  readonly like = mutate(this.ids, toggled, (id, applied) => this.api.favourite(id, applied.includes(id)));
}
```

`like.run(id)` is the press. The cell changes first, so the heart
fills on the press and not a round trip later; the commit runs behind
it; and a commit that rejects, or resolves `false`, puts the change
back.

**The rollback is guarded, and that is the part worth copying.** It
happens only while the cell still holds exactly what was applied.
Without it a slow rejection fights a fast second press and the set
ends up saying the opposite of the last thing anybody did. It is why
the cell is the first argument: a mutation handed only two functions
can undo its own change but cannot tell whether undoing it is still
the right thing to do.

`like.pending` counts the writes in flight, which is what a saving
line reads. A count and not a flag: two presses are two writes, and a
flag cleared by the first would say the second had finished.

## A search field that does not reach the router on every keystroke

```ts
const query = internalState('');
const term = debounced(query, 200);
const results = computed(() => index.search(term.value));
```

`debounced` and `throttled` are cells, not pipes, so a `computed`
follows one exactly as it follows anything else. `debounced` is for
something a person has finished saying; `throttled`, which lets the
first value through at once and the last of a burst through at the end
of the window, is for something continuously true such as a scroll
position.

## A channel declared once

A channel can be declared as one object, with the view keys and their
initial values written where the view's type is:

```ts
export const Library = defineChannel('library', {
  view: {
    rows: [] as readonly ShelfItem[],
    filter: '',
    pending: 0
  },
  commands: {} as {
    setFilter(filter: string): void;
    move(from: number, to: number): void;
  }
});

export type LibraryView = ViewOf<typeof Library>;
```

The object is the type, so a key added to the view and forgotten in
the initial literal is no longer possible. A field whose initial value
is narrower than the type it holds says so with an `as`, which is what
`[] as readonly ShelfItem[]` is doing.

`channel<View, Commands>(name, initial)` is unchanged and not
deprecated. An application with interfaces it wants to keep, because
something else shares them or because the initial values are built
elsewhere, has nothing to migrate.

**A command carries as many arguments as it declares.** `move(from, to)`
is written the way anyone would write it. It used to carry one
payload, so a second argument was dropped on the floor with a warning
and commands were written `move({ from, to })` and taken apart again
on the other side.

## A form field backed by the barrier

A screen's fields are almost never a component's own state. They are
the application's, they survive the screen, and they are on a channel,
which means the value is read from a key and written with a command.
`bind` takes that pair:

```tsx
<TextInput {...bind(library.view.filter, library.send.setFilter)} />
```

The key stays read-only, as an input is, and the round trip through
the application thread is visible at the call site rather than hidden
by a helper pretending the key is writable. `bind(cell)` over an
`internalState` is unchanged, for the case where the value really is
the component's own.

## None of this is required

The framework does not own your data architecture and these helpers do
not change that ([channels and the barrier](/structure/channels-and-the-barrier)
is the contract is why). `serveChannels` takes
plain Observables from wherever they came from. A resource is one way
to produce one, a subject is another, and the barrier cannot tell the
difference.

What you would write instead of a `resource` is a counter, a status
field and a pair of guards, and instead of a `mutate` an optimistic
write, a rollback and a comparison. These are those, named. Reach for
them when the screen is the shape they describe, and leave them alone
when it is not.
