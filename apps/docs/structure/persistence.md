---
description: 'Where an application keeps state that survives being closed: three storage adapters, hydration on start, and what happens when a store is denied or full.'
---

# Remembering state

An application that reopens where it was closed needs somewhere to put
state and a rule for what a screen shows while that state is being
read back. `StorageAdapter` is the somewhere, and `persisted` is the
rule.

Neither is required. A channel is served from plain Observables as it
always was, and an application that would rather read and write a
store itself implements four methods and writes the rest. The
framework does not own your data architecture; see
[Channels and the barrier](/structure/channels-and-the-barrier).

## The shape

```ts
interface StorageAdapter {
  read(key: string): Promise<StorageRead>;
  write(key: string, value: string): Promise<StorageOutcome>;
  remove(key: string): Promise<StorageOutcome>;
  keys(): Promise<readonly string[]>;
}
```

Text keyed by a string, because that is what all three implementations
can keep. Bytes are deliberately absent: `localStorage` cannot hold
them, and an application caching pictures wants a store with an
eviction policy of its own rather than this one.

Nothing rejects. Every method answers with an outcome:

| Outcome  | Means                                                                       |
| -------- | --------------------------------------------------------------------------- |
| `ok`     | the store answered; for a read that includes "there is no such record"      |
| `denied` | the platform will not let this origin store anything, and will not this session |
| `full`   | the quota is spent, which is worth trying again after something is given back |
| `failed` | anything else                                                               |

Three of those are ordinary outcomes an application routes around
rather than faults it reports, which is why they are values and not
exceptions. Wrapping every read in a `try` to find out which one
happened is how storage code ends up assuming success.

## Which store

**`OpfsStorage`** is the right default for an application's own state.
It is reachable from a worker, so the thread that owns the state is
the thread that writes it and nothing crosses the barrier to be
remembered. It is asynchronous throughout, so nothing it does blocks a
frame. One file per key, named by the key.

```ts
import { OpfsStorage, persisted } from '@gesso/framework/worker';

const memory = persisted(new OpfsStorage({ directory: 'segue' }), 'queue', { initial: NOTHING });
```

**`IndexedDbStorage`** sits beside it rather than instead of it. It is
reachable from every thread, survives longer under a browser's own
eviction, and is what a browser with OPFS disabled still has.

**`ShellStorage`** is `localStorage`, reached through the shell. It is
synchronous on the window, unreachable from a worker, holds a few
megabytes at most, and writing to it blocks the thread the framework
works hardest to leave alone. None of that matters for the one thing
it is good for: a small preference that something outside the
application also reads.

```ts
const theme = persisted(new ShellStorage(ctx.inject(ShellService)), 'theme', { initial: 'light' });
```

Use one of the other two for anything else.

## Hydration is a request

Reading from a disk is a keyed request that can be slow, can answer
"there is nothing", and can fail, which is the same set of outcomes a
request over the network has. So `persisted` is built on
[`resource`](/recipes/loading-and-saving) and its `status` is
`ResourceStatus` itself, rather than a fourth vocabulary saying the
same five things in different words.

```ts
const settings = persisted(new IndexedDbStorage(), 'settings', {
  initial: DEFAULTS,
  revive: raw => (isSettings(raw) ? raw : null)
});
```

Constructing it is what starts the read. Nothing has to remember to
call a `load()`.

## What a screen sees before hydration finishes

The default, with `status` reading `loading`. Nothing waits, nothing
is null, and no screen has a shape it only has for the first eighty
milliseconds. When the read lands the value changes like any other
cell change, and a screen that wants to say "restoring" reads
`status`.

`ready` means a stored value was found, `missing` means there was none
and the default stands, and `failed` means the store could not be
read at all and the default stands.

There is one race that needs a rule, and it is not rare: a person
changing the value before the disk has answered. **What they did
wins.** A hydration answer is applied only if nothing has been `set`
since, on the same reasoning as `mutate`'s guarded rollback. An answer
that was overtaken is stale, and putting it on screen would undo
something the person just did.

## Writing

`set` remembers a new value, and the write follows once the changes
stop:

```ts
settings.set({ ...settings.current, theme: 'dark' });
```

The gate is a `debounced` cell, so a value that moves with a drag or a
keystroke costs one write rather than sixty. `settle` is how long it
waits, 250 ms by default. `save()` writes what is held now without
waiting, for the moment an application knows it is about to lose the
thread: a `visibilitychange`, a route away from an editor, a sign-out.

`saving` is a count of the writes in the air, for an indicator, and
`saveError` is the last failure as a message.

## When storing fails

- **`denied`.** Nothing is written this session and nothing is tried
  again, because the answer will not change. The application runs on
  its defaults and `saveError` says so once rather than on every
  keystroke.
- **`full`.** The write failed and the value in memory is kept.
  Nothing is rolled back: the change is real and only the remembering
  of it failed. The next change is still attempted, because a quota
  can be given back.
- **`failed`.** The same as `full`, and for the same reason.
- **A record that will not parse, or that `revive` refuses.** Treated
  as nothing stored. A file written by an older build costs one
  default; trusting it costs state holding `undefined` where a field
  belongs, and there is nothing a person can do about either.

## Remembering what does not survive on its own

Store the value, not a reference to it. A queue restored as track ids
alone comes back as a list of nothing when the catalogue behind those
ids has not loaded yet, and stays that way if rows are resolved on
change rather than continuously. Remembering the rows themselves costs
a few kilobytes and is what makes an application open on what it was
doing rather than on an empty screen.
