---
'gesso-framework': minor
---

**Breaking: the single-thread configuration is `createSyncApp`.** `createApp` now
builds the worker configuration and nothing else.

```diff
-createApp(AppRoot).useChannel(Catalog, { source }).mountSync('#app');
+createSyncApp(AppRoot).useChannel(Catalog, { source }).mountSync('#app');
```

Nothing else changes: same builder, same methods, same `mountSync`. The worker
form, `createApp({ renderWorker })` and the form `gesso-vite-plugin` writes, is
untouched, so an application that mounts into a render worker needs no edit.
`createApp` given a component throws and names `createSyncApp`, because the fix
is one identifier and a message that does not say which one turns a rename into
an afternoon.

The reason is what it costs on the wire. `createApp` took either the options or
a root component, and the overload that took a component reached
`GessoAppBuilder` → `GessoApp` → `GessoRuntime`: the layout engine, both
renderers and the hit-tester, statically, in every shell. A bundler cannot see
which half of one function a given call reaches, so every worker application
shipped the whole engine to the thread whose entire job is to create a canvas
and forward input.

Measured on the smallest honest shell, built from source:

|        | raw      | gzipped  |
| ------ | -------- | -------- |
| before | 662.9 kB | 169.3 kB |
| after  | 46.2 kB  | 12.3 kB  |

And on a real application, gessosheet's shell: 524.9 kB to 152.9 kB raw, 152.7 kB
to 45.0 kB gzipped. `check-bundle-size.ts` holds the line in CI with a budget and
with a look for Canvas2D calls in the shell's bytes, because the number alone
would pass a build that kept the rasterizer and got lucky.

Two names cost one line in the configuration that was always the exception, and
take 120 kB off the main thread of every other kind.
