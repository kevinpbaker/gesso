---
'gesso-framework': patch
---

`Inputs` types a member declared as an Observable by the values it holds. The host subscribes to an Observable a parent passes and feeds the cell its values, so a cell never holds the stream; `Inputs<{ items: Observable<Item[]> }>` used to type `inputs.items.value` as the Observable, and `inputs.items.value.pipe(...)` compiled and then threw on mount. It is now typed as `Item[]`, and the new `InputValue` type says how. A member that mixes values and streams, such as `UiChild` or `Reactive<T>`, is unchanged.
