---
description: Rebuild the tree from new code while services and channel data carry on, in two lines and with one thing you have to hand over.
---

# Hot module replacement

A Gesso component's function runs once. There is no re-render pass, so
there is nowhere to push new code into a component that is already
mounted: what a framework with a virtual DOM does on a hot replace has
no counterpart here.

What can be done is to throw the tree away and build a new one. That is
only worth anything if the things you would miss are not in the tree,
and in Gesso they are not. Application state is in a data worker behind
a channel. A replica's cells, the services, the renderer, the canvas,
the focus manager and the scheduler all belong to the runtime. The tree
is the one part that is cheap to lose.

## Two lines in the entry module

The framework imports no bundler and knows nothing about one. It offers
`reload`, and your entry asks its own HMR client for the new module:

<<< @/src/examples/HotReloadEntry.ts#entry

`import.meta.hot.accept` has to be at the top level, because a bundler
reads it statically to work out where the boundary is.

`GessoApp` and `createApp(Root)` carry the same method, so the
single-thread configuration is identical.

## Hand over the services the module defines

This is the one thing you have to get right, and the error you get for
missing it reads like a contradiction.

A service registry is keyed by the class object. Replacing a module
produces a **new** class object, so a component from the replaced
module injects a class the registry has never seen, while the old one
is sitting in it under a key nothing will ask for again:

```text
Service 'CounterFeed' is not registered.
Registered services: AnimationService, CounterFeed, FocusService, …
```

The service it cannot find is in the list it prints. Pass the
replacement classes as the second argument and the registry adopts
them, keeping the instances they already had:

<<< @/src/examples/HotReloadApp.tsx#service

A service defined in a module the replacement did not touch keeps its
class object and needs no mention.

**The instance keeps the behaviour it was built with.** It was
constructed from the old class, so its methods are the old code: a
change to a service's own body needs a full reload to take effect.
State survives, behaviour does not. Every hot-replacement system makes
this trade, and the only mistake would be to leave it unsaid.

## What survives

The layout root node is the same object across a reload, because the
builder reconciles rather than recreating. Everything that holds it by
reference stays valid: input routing, the focus scope stack, the touch
scroller, and any capture listener a modifier registered at the root.

Below it, reconciliation does the rest:

|                                              | What happens                                      |
| -------------------------------------------- | ------------------------------------------------- |
| A component whose class object is unchanged  | Keeps its host, and its `internalState`           |
| A component from the replaced module         | Disposed and mounted again; its own state is lost |
| A scroll offset on a container that survived | Kept, because the node is kept                    |
| Channel data                                 | Untouched: the replica was never rebuilt          |
| A service you handed over                    | Instance kept, behaviour stale                    |

So editing one module rebuilds that part of the screen and leaves the
rest of it, scroll positions and all, exactly as it was.

Channel data needs no help at all, which is worth saying because it is
the part people expect to be hard. Nothing rebuilds a replica: it is
held by the runtime, it is still subscribed to its port, and its cells
still hold their last values, so a freshly built tree binds to data
that is already there.

## When it full-reloads instead

If the page reloads rather than replacing, the first thing to check is
who else imports the module.

A bundler propagates an invalidation up the import graph until it finds
a module that accepts, and full-reloads if it does not find one. A root
module that is reached only from your worker entry hot-replaces. One
that is _also_ imported on the main thread, for instance because you
mount the same root in a single-thread configuration for comparison,
does not: the main thread's importer accepts nothing, so the page
reloads and takes the worker with it.

That is a property of your module graph rather than of the framework,
and the fix is to stop importing the app's root on the main thread.

## What it does not do

- **Focus is not restored.** A focused node in a replaced subtree is
  removed, the focus manager clears, and nothing puts the caret back.
  If you use `autoFocus`, it fires again, which for a form in the
  middle of being filled in is worse than doing nothing.
- **A reload is not free.** It rebuilds a tree and lays it out, and on
  a large screen that is a visible frame. Nothing budgets it.
- **A reload during a gesture or an animation is uncharted.** There is
  no coverage and no argument for what a tree replaced under a running
  drag should do.
