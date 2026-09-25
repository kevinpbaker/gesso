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

## The plugin writes it for you

With [`gesso-vite-plugin`](/tooling/vite-plugin) in the config, the
render worker entry stays as it was written and the wiring is emitted
into it:

```ts
// RenderWorker.ts, and nothing else
renderRoot(AppRoot).useService(Feed);
```

The rest of this page is what that wiring does, and what it still cannot
do for you.

## The two lines, if you write them yourself

The framework imports no bundler and knows nothing about one. It offers
`reload`, and your entry asks its own HMR client for the new module:

<<< @/src/examples/HotReloadEntry.ts#entry

`import.meta.hot.accept` has to be at the top level, because a bundler
reads it statically to work out where the boundary is.

`GessoApp` and `createSyncApp(Root)` carry the same method, so the
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

The plugin knows both ends of that graph, so it does not leave you to
work it out. When a save is about to reload the page for this reason it
says which file and why, once per file, in the dev server's own output:

```text
[gesso] src/App.tsx is imported by the main thread as well as by the
render worker, so saving it reloads the page instead of replacing the
tree. Reach it only from the render worker's own graph to get hot
replacement back.
```

The other thing that reloads rather than replaces is a change to a route
table. `useRoutes` is read once, when the runtime is built, so nothing
wires it into a replacement: a tree rebuilt around the old routes would
be worse than a reload, because it would look like it had worked.

## Focus stays where you left it

A reload used to lose the caret, and `autoFocus` used to fire again on
the way past, which for a form in the middle of being filled in is worse
than doing nothing at all. Neither happens now.

The caret's position is read before the tree is thrown away and put back
on the frame that lays the new one out, after the layout listeners
rather than before, because `autoFocus` is a layout listener and every
node in a replaced subtree is having its first layout on that frame. So
the restore is the last word in both directions: it puts the caret back
where you had it, and where you had it nowhere, it takes it off whatever
autofocused.

Node ids are positional and the builder reconciles, so the field that
had focus keeps its id across a replacement of the module that rendered
it. A field the edit removed is the one case with nothing to go back to,
and there the focus is cleared rather than left wherever the rebuild
happened to put it.

## What it does not do

- **A reload is not free.** It rebuilds a tree and lays it out, and on
  a large screen that is a visible frame. Nothing budgets it.
- **A reload during a gesture or an animation is uncharted.** There is
  no coverage and no argument for what a tree replaced under a running
  drag should do.
- **Text that was being edited is not restored**, only the focus. The
  caret goes back to the field; what the field holds is whatever the new
  tree built it with.
