---
description: Read what a node is, who decided each of its values, what it inherits, and which component rendered it.
---

# Inspecting a node

`engine.explain(node)` answers why a box is the size it is, and the
layout pages use it. The node inspector answers the four questions that
come after it: what did the element declare, what is a modifier writing
over it, what is this node inheriting, and which component rendered it.

Hover a node with the inspector on and the panel reads something like:

```text
button root:0:0:0:component:5:0:2:0
box 80.68 × 36.80 at (24, 452.40)
rendered by modifier-demo
modifiers interactive, focusRing
semantics button · "Hover me"

props
  backgroundColor  #1f2937   set by interactive (declared #111827)
  cursor           pointer
  label            Hover me

environment
  theme            [object Object]
  contentColor     text      provided here

layout
width  80.68   3 children need 56.68 + padding 24 → 80.68
height 36.80   stretched across row 'root:0:0:0:component:5:0:2': 36.8
…
```

The layout section is `formatExplanation` verbatim, trimmed here. It is
the same text `engine.explain(node)` produces for a console or a failed
assertion, so what you read in the panel is what a test would print.

## Props say where they came from

This is the part worth having. A value a modifier wrote and a value the
element declared look identical on the node, and the second is the one
that surprises people: the override cascade is invisible until
something says which of the two is on screen.

- A plain prop is the element's own value.
- `set by <modifier> (declared <value>)` is a modifier writing over it,
  naming every modifier in the list when more than one writes the same
  property, in the order the element listed them.
- `bound (<id>)` is a value an Observable is driving.

The same provenance appears in the layout explanation at the bottom,
where the axis that a modifier changed carries it as its last reason.
So `width 240` also tells you the element asked for 200.

## The environment is what the node sees

Not what it provides. The list walks the environment chain upward, so
it is everything in force at that node, with the entries the node
itself provides marked `provided here`. A node that provides nothing
shares its parent's environment, which is why the mark exists at all.

## The owner chain is exact

A `UiNode` has no pointer back to a component, and it deliberately does
not need one: the builder gives every component slot a fragment anchor,
and that anchor **is** the component's identity. The inspector walks up
and asks the resolver whether it holds a host for each ancestor, so
`rendered by TextInput inside sign-in-form-demo` is read from the place
the link is actually kept rather than guessed from the id.

A component reports its `@Define` tag when it has one and its class or
function name otherwise, so a functional component is named too.

## The report crosses a thread

In the worker configuration the shell has no access to the tree, and
could not be given any: a `UiNode` is a live object, a binding is a
subscription, a component host is a class instance. So the report is
built in the render worker and only strings cross.

```ts
onInspect: report => inspector.set(report);
```

You can call `runtime.inspectNode(node)` yourself and get the same
plain-data report, which is what makes it usable from a test.
`structuredClone(report)` equals the report; a spec pins that, because
a structured clone is exactly what `postMessage` does.

## Turning it on

`app.setInspector(true)` on either configuration. It also turns on the
layout engine's measure trace, which paints the heatmap of what each
pass measured, so leave it off when you are not looking at it.

## What it does not do

- **You cannot pick a node.** It reports whatever the pointer is over.
  Clicking to pin one, and walking to a parent or a child, both need
  the panel to name a node back to the runtime, and there is no channel
  for that yet.
- **You cannot edit a value.** Same reason.
- **There is no tree view.** The report is one node.
