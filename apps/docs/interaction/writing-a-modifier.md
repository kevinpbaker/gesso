---
description: 'Writing a modifier of your own against @gesso/core alone: defineModifier and typed arguments, the host API, the three ordering rules, configuration through the theme rather than a new property, and a worked example that runs in the playground.'
---

# Writing a modifier

[Modifiers](/interaction/modifiers) says what a modifier is and what
the ones in the box do. This page is for writing one, in your own
file or your own package, against `@gesso/core` and nothing inside it.

Two worked examples run through it. `hoverable()` is the library's
smallest real modifier and shows the shape. `holdToConfirm()` is a
modifier written outside the framework for exactly this page: it lives
in the playground at `apps/playground/src/modifiers/holdToConfirm.ts`,
imports only the package entry point, and runs as the last card on the
playground's Modifiers route. The lint configuration at the repository
root fails `lint` if that file ever imports a path inside a package, so
what you read below is held to the same rule you are.

## A kind and a factory

A modifier is two things. The **kind** is one object per behaviour,
holding the lifecycle: `attach`, an optional `update`, an optional
`detach`. The **value** is what an element carries in its `modifiers`
array: the kind plus the arguments for this one use. `defineModifier`
takes the kind and hands back the factory that makes values:

<<< @/../../packages/core/src/modifiers/interaction.ts#kind

Everything a modifier needs to know about itself is in that call.
`defineModifier` mints a `symbol` for the kind, so two modules can
never share an identity by accident and a kind is never compared by
name. The type parameter is the arguments type, and it flows through
to the factory: `hoverable()` returns a `UiModifier<InteractiveOptions>`,
and passing the wrong shape to a factory is a compile error rather than
a modifier that never fires. The `modifiers` prop on every element is
typed as `readonly UiModifier[]`, so the whole route from your kind to
the element is checked.

The per-attachment state lives inside `attach`, as `hovered` and
`pressed` do above, or in a `WeakMap` keyed by the host when `update`
and `detach` need to reach it. The host is one object for the life of
the attachment, and the kind is shared by every element that carries
it, so the kind itself must hold nothing.

## The host

`attach(host, args)` receives a `UiModifierHost`, and the host is the
whole of what a modifier may touch. The full table is on the
[modifiers page](/interaction/modifiers#what-a-modifier-may-touch); the
calls a modifier written from outside reaches for first are these:

| You want to                         | Call                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| React to input on the node          | `host.on(UiEventType.PointerDown, listener)`           |
| Write a property, then stop         | `host.set('opacity', 0.5)` and `host.clear('opacity')` |
| Read the effective value            | `host.get<number>('opacity')`                          |
| Draw on the node                    | `host.decorate(shapes)` and `host.decorate(null)`      |
| Know the node's box                 | `host.layoutBox()`, `host.onLayout(cb)`                |
| Read what the tree provides         | `host.environment(UiEnvironmentKeys.theme)`            |
| Run a timer that dies with the node | `host.animate(cell, to, options)`                      |
| Release something on detach         | `host.own(teardown)`                                   |

Listeners, overrides, decorations and animations are all released by
the host when the modifier detaches. `detach` is for anything the host
does not know about, which is usually nothing: neither example on this
page has one.

Two things are not on the host by design. There is no renderer and no
canvas context, because both backends paint from shared inputs and
decoration shapes are that input. And there is no way to add or remove
children, because a behaviour that needs children is a component.

## Three rules about order

These are the rules people rediscover, so here they are together.

1. **The element's own handler runs first.** The element's `on*` props
   are registered before any modifier's listeners, so at the target
   `onPointerDown` runs before `host.on(PointerDown)`. A
   `stopImmediatePropagation()` from the element stops every modifier
   behind it, and modifiers run in list order after that.
2. **Attach runs after the element's props and before its children.**
   A modifier sees the element's declared values and may override them
   before layout reads anything. Detach runs before the node is
   removed, so a teardown still sees an intact node. A modifier can
   never outlive its node.
3. **Later in the list wins a property.** Two modifiers writing one
   property is allowed; the effective value is the last override in
   modifier order, development warns once naming both kinds, and when
   the later one clears or detaches the earlier one's write comes back,
   then the element's declared value.

And one about arguments. They are compared by value across renders:
equal arguments leave the modifier alone with whatever state it holds,
different arguments call `update` if the kind has one, and detach and
re-attach it if not. A callback written inline in a render is a new
argument every render. A kind that holds state worth keeping across a
change of arguments, a drag in flight, a hold in progress, should have
an `update`.

## Configuration without a new property

Sooner or later a modifier wants a value nobody passes it per element:
how long a tooltip waits, how far a swipe has to travel, what colour a
hold fills with. The instinct is a new property, `holdDuration={400}`
on the element. There is no `registerProperty()`, and that is
deliberate: the property registry is closed so that an unknown name is
a hard error at the element, and that error has paid for itself many
times over. A modifier writing to a name the registry does not know
throws for the same reason.

So configuration has two routes.

**An argument**, for a value that belongs to one element. That is what
`holdToConfirm({ duration: 150 })` is.

**The environment**, for a value that belongs to a subtree or the whole
application. The environment is scoped and typed, a provider anywhere
above changes it for everything beneath, and reading it costs a
modifier one call. From outside the framework the carrier is the
theme: an element can provide `theme`, `textStyle`, `contentColor`,
`containerSize` and `insets` into the environment and nothing else, and
of those the theme is the one built to carry more. A **theme extension**
is a named group of tokens with defaults, added to a theme with
`withThemeExtension` and read back with `themeExtension`, and it rides
on the theme every node already inherits:

<<< @/../playground/src/modifiers/holdToConfirm.ts#tokens

Providing it is a `theme` prop on any element:

```tsx
const QUICK = withThemeExtension(darkTheme, holdToConfirmTokens, { duration: 250, fill: 'controlAccent' });

<box theme={QUICK}>
  <box modifiers={[holdToConfirm(args)]}>…</box>
</box>;
```

Everything under that box holds for a quarter of a second and fills in
the accent. An extension is added to one theme, so an application with
a light and a dark theme extends each of them, and the tokens then
travel with whichever theme the appearance toggle provides.
`createEnvironmentKey` is also exported and is
what the framework's own keys are made of, but no element provides a
custom key, so from outside the framework a key of your own is
readable only where the framework already provides it. Use the theme.

## The worked example

`holdToConfirm` is a press that has to be held: a destructive action a
person could hit by accident is the usual reason to want one. The
element fills from left to right while the pointer is down, confirms
when the time is up, and lets go if the pointer lifts or leaves early.
The arguments:

<<< @/../playground/src/modifiers/holdToConfirm.ts#args

The kind, with an `update` so that a re-render that swaps a callback
does not drop a hold in progress:

<<< @/../playground/src/modifiers/holdToConfirm.ts#kind

And the hold itself, which is where every host call happens:

<<< @/../playground/src/modifiers/holdToConfirm.ts#hold

Reading it against the host table:

- **Events.** Four listeners on the node, and no `onRoot`: everything
  this modifier cares about arrives at its own element. `PointerLeave`
  is listened to because a pointer that leaves during a press never
  sends the up, the same reason `interactive` does.
- **A property, through the cascade.** `host.set('borderColor', fill)`
  during the hold and `host.clear` after. The element's declared border
  comes back on release, or the write of a modifier earlier in the
  list, which is rule 3 above: the playground card puts `holdToConfirm`
  after an `interactive` that also writes `borderColor`, so the hold's
  colour takes the border while the pointer is down and hands it back
  to the hover on release.
- **A decoration.** A `fill` shape in the node's own coordinates, the
  whole height and a fraction of the width, replaced on every sample
  and dropped with `decorate(null)` at the end. It is painted before
  the children, so the label stays readable over it.
- **The environment.** The tokens are read at the press rather than at
  attach, so a theme that changes while the element is on screen is
  seen at the next press and there is no need for `onEnvironment`. Read
  a value when it is needed and you rarely need to be told it changed.
- **An animation as the timer.** `host.animate` drives the progress
  cell from 0 to 1 over the duration. It is preferred over a
  `setTimeout` because the host cancels it if the node goes while a
  finger is on it. The returned Observable completes when the animation
  stops driving the cell for any reason, arrived, stopped or superseded,
  so the code reads the cell to learn which: at 1 it confirms, short of
  1 it cancels. `reducedMotion: 'keep'` is set because here the movement
  is the information; a hold that snapped to done under reduced motion
  would be a click.

Nothing in the file names a node type, a renderer, a layout record or
the builder, and it could not: none of them is reachable from the host.

## Using it

The value goes in the `modifiers` array like any other. The arguments
object is built once, in a component body, because a component body
runs once and an object literal in a render would be new arguments
every frame:

```tsx
function DeleteTile(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const deleted = internalState(0);
  const args: HoldToConfirmArgs = { onConfirm: () => deleted.value++ };
  const HOLD = [
    interactive({ hover: true, press: false, hovered: { borderColor: 'controlAccent' } }),
    holdToConfirm(args)
  ];

  return (
    <box modifiers={HOLD} width={132} height={44} borderWidth={1} borderColor="controlBorder" cursor="pointer">
      <text text="Hold to delete" fontSize={11} />
    </box>
  );
}
```

## Keeping it outside

A modifier package depends on `@gesso/core` as a peer and imports from
its entry point. In this repository that rule is mechanical: the
playground's `src/modifiers/` directory is covered by a
`no-restricted-imports` override in the root lint configuration that
refuses relative imports, any path containing `/src/`, and any
`@gesso/*` subpath, and the modifier's spec asserts the same thing from
the file's text. The spec drives the modifier through a real runtime,
the pointer, the clock and the theme, and asserts the cascade, the
decoration, the theme extension, the per-element override, rule 3 and
the `update` path. Write yours the same way: a spec that calls `attach`
with a fake host proves only that the file compiles.

## Limits

**A custom environment key cannot be provided from an element.** Only
the five properties named above reach the environment, so a modifier
package's configuration is a theme extension or an argument. A
generic `environment` prop would be the framework's change to make, and
nothing yet needs it.

**Components take `rootModifiers`, not `modifiers`.** A component's
node is a fragment with no box, so `modifiers` on a component tag
throws. The controls in `@gesso/components` forward `rootModifiers` to
the element they render; a component of your own that wants to accept
a modifier from outside does the same.

**A modifier's failures do not reach the error overlay.** As on the
modifiers page: `attach`, `update` and `detach` are guarded and a
failure is reported through the binding-error channel, which is the
console.

## Next

[Modifiers](/interaction/modifiers) has the full host table and every
modifier in the box, and
[themes and the environment](/appearance/themes-and-the-environment)
is where theme extensions are introduced.
