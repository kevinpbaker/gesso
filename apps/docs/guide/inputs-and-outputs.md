---
description: What a component takes and what it sends, how a parent passes each, and why both are cells.
---

# Inputs and outputs

A component takes inputs and sends outputs. Both are cells. An input is
a cell the host feeds from whatever the parent passed; an output is a
cell that holds whatever the parent gave to be called, and `emit` fires
it. The body runs once, so nothing about either is read at render time
except through a binding.

A note on the word "props". Elements have props: `width`, `color`,
`onClick` on a `<box>` or a `<text>`, which become properties of a node.
Components have inputs and outputs. The parameter a function component
receives is its inputs, and this guide calls it `inputs` throughout;
older code and the framework's own types still say `props`, and the two
words mean the same record.

## Declaring inputs

The first parameter's type says what the component takes. Every member
arrives as a cell, whether the parent passed a value or an Observable.

<<< @/src/examples/InputsOutputsExample.tsx#declare

A member typed as a function is an output. A member that admits
`undefined` is optional; `input(inputs.size, 16)` gives it a default
that keeps following the source.

## Reading and binding

Inside the body, bind: pass the cell, or a `pipe` of it, into a node's
prop. Read `.value` only in a handler, where the current value is what
you want. A `.value` read in the body is a snapshot, and the framework
warns once if that snapshot goes stale.

`derive` is the shape most bindings take, several inputs projected into
one value and emitted only when it changes:

```ts
const playing = derive(
  [queue.view.playlistId, audio.state],
  (id, state) => id === card.id && state.status === 'playing'
);
```

It is `combineLatest`, `map` and `distinctUntilChanged` in one call,
with `{ equal: 'structural' }` for a projection that builds a fresh
object of the same shape each time.

## Sending outputs

An output is fired with `emit`, from as many places as the component
needs, and the component never touches the handler itself:

<<< @/src/examples/InputsOutputsExample.tsx#emit

A parent that passed nothing is fine: the emission reaches nobody. A
component that wants to react to its own output reads it as a stream
through `events`.

## Receiving outputs

A parent passes a function, as it always could. Or it passes
`into(subject)` and receives the output as a stream, which is what lets
a list of rows merge their outputs, a slider's output be debounced, or a
child's output be handed straight to a channel command:

<<< @/src/examples/InputsOutputsExample.tsx#receive

Wrapped in `into` rather than passed bare, because a bare `Subject` is
an Observable and would be read as an input the parent is feeding the
child, which is the opposite direction.

## Class components

A class declares inputs as `@Input()` fields made with `input()`, and
outputs as `@Output()` fields made with `output()`:

```ts
@Define('stepper')
class Stepper extends Component {
  @Input() step = input(1);
  @Output() changed = output<[value: number]>();
}
```

The host wires both the same way; the decorator is so a reader can tell
the directions apart.

## Who owns a value

A control that shows a value and changes it has two honest forms.
Controlled: the parent passes `value` and hears every change through
`onChange`; the parent owns the state. Self-managed: the parent passes
`defaultValue`, or nothing, and the control owns it, still reporting
changes. `controlled()` implements that contract and throws when both
are passed, because two owners is a bug:

```ts
const value = controlled({
  component: 'Slider',
  name: 'value',
  source: inputs.value,
  initial: inputs.defaultValue,
  fallback: 0,
  onChange: inputs.onChange
});
```

For the plain case where the owner is a local cell, `bind` is the
spread: `<Slider {...bind(volume)} />` passes the cell as `value` and
writes changes back into it. When the value belongs to a store or a
channel, pass the cell and a handler that sends the command instead.

## Where the framework helps you

- A body that reads an input with `.value` and never hears it change is
  warned about once, with the component, the input and the field that
  moved.
- A `text` bound to something that is not text is warned about once.
- The inspector names the cell a bound property comes from, so a value
  on screen can be traced to the input that fed it.
