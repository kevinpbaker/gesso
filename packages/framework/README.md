# @gesso/framework

Components, cells, the frame runtime, channels, routing and the worker barrier, over [`@gesso/core`](https://github.com/kevinpbaker/gesso/tree/main/packages/core).

```bash
npm install @gesso/core @gesso/framework rxjs
```

## An application is three files

One shared module holds names and shapes and no implementation:

```ts
// notes.contract.ts
import { channel } from '@gesso/framework';

export const Notes = channel<NotesView, NotesCommands>('notes', { rows: [], open: null });
```

Your application, on its own worker. Below `serveChannels` there is no framework import in the dependency graph, so every layer beneath it is testable with bare Vitest, in node, with no browser:

```ts
// notes.app.worker.ts
import { serveChannels } from '@gesso/framework';

serveChannels([
  {
    token: Notes,
    source: {
      view: { rows: view.rows, open: view.open },
      commands: { open: id => domain.select(id), create: () => domain.create() }
    }
  }
]);
```

Everything the person sees, on the render worker:

```tsx
// notes.render.worker.ts
import { renderRoot } from '@gesso/framework';

function NotesApp(inputs, ctx) {
  const notes = ctx.channel(Notes);
  return (
    <column gap={12} padding={24}>
      <button onClick={() => notes.send.create()} padding={8}>
        <text text="New note" />
      </button>
    </column>
  );
}

renderRoot(NotesApp).useChannel(Notes);
```

And the main thread's entire job:

```ts
// main.ts
createApp({
  renderWorker: () => new Worker(new URL('./notes.render.worker.ts', import.meta.url), { type: 'module' }),
  appLogicWorker: () => new Worker(new URL('./notes.app.worker.ts', import.meta.url), { type: 'module' })
}).mount('#app');
```

The shell spawns both workers, joins them with one `MessageChannel`, hands each an end, and then holds neither. It cannot be in a patch's way even by accident.

## What is not there

A component body runs **once**, and an `Observable` binds straight into the retained graph. So there is no re-render pass, no virtual DOM diff, no `useEffect`, and no base class to extend for your state. Component identity _is_ node identity, so there is no second reconciler.

Single-thread mode exists for tests, headless rendering and environments without `OffscreenCanvas`: `createApp(NotesApp).useChannel(Notes, { source }).mountSync('#app')`. Channels resolve in-process there, so the same contract runs with no ports.

## Entry points

- `@gesso/framework` -- components, cells, the runtime, routing, channels
- `@gesso/framework/worker` -- what a render or application worker imports
- `@gesso/framework/jsx-runtime`, `/jsx-dev-runtime` -- set `jsxImportSource` to `@gesso/framework`
- `@gesso/framework/testing` -- the doubles its own suite uses

## Documentation

[Your first component](https://github.com/kevinpbaker/gesso/blob/main/apps/docs/guide/counter.md) | [Components run once](https://github.com/kevinpbaker/gesso/blob/main/apps/docs/guide/components-run-once.md) | [Cells and bindings](https://github.com/kevinpbaker/gesso/blob/main/apps/docs/guide/cells-and-bindings.md) | [Channels and the barrier](https://github.com/kevinpbaker/gesso/blob/main/apps/docs/structure/channels-and-the-barrier.md) | [Routing](https://github.com/kevinpbaker/gesso/blob/main/apps/docs/structure/routing.md)

MIT (c) Kevin Baker
