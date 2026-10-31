---
'gesso-core': patch
'gesso-framework': patch
---

A key made with `createEnvironmentKey` can now be provided by any element, `provide={[provided(key, value)]}`, and read by a component under it with `ctx.environment(key)`, or its default when nothing above provides it. It is read as the component's body runs, from where the component is placed, because the builder puts a component's node under its parent before the body runs. A value that changes is provided as a source to follow, such as a cell. `ComponentResolver.resolve` is handed the slot's node as a third argument for this.
