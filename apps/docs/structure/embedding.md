---
description: "Putting a Gesso app in one part of a page that is not Gesso's: a grid or an editor inside an existing React, Vue or plain page, with embedSurface and gesso-react."
---

# Embedding in a page

Nobody rewrites an application to try a framework. The usual way in
is one panel: the grid that stutters at fifty thousand rows, or the
editor that has to keep up with typing while something heavy runs. That
panel becomes a Gesso app and the page around it stays what it was.

`gesso-framework/embed` mounts an app into one element of such a page,
and `gesso-react` wraps it as a component and a hook.

| Piece            | From                    | Does                                                                   |
| ---------------- | ----------------------- | ---------------------------------------------------------------------- |
| `embedSurface`   | `gesso-framework/embed` | mounts an app into an element, with the defaults a shared page needs   |
| `hostChannels`   | `gesso-framework/embed` | serves channels from the page's own thread: its state, its callbacks   |
| `<GessoSurface>` | `gesso-react`           | `embedSurface` as a component, mounted and disposed with it            |
| `useHostChannel` | `gesso-react`           | a component's props as a channel's view, its callbacks as the commands |

## In React

The app is an ordinary Gesso app: a contract, a render worker, and
whatever serves its channels. Here the React component serves them.

```ts
// orders.contract.ts
import { defineChannel } from 'gesso-framework';

export const OrdersFilter = defineChannel('orders-filter', {
  view: { query: '' },
  commands: {} as {
    /** Opens an order. @param id The order's id. */
    open(id: string): void;
  }
});
```

```tsx
// orders.render.worker.ts
renderRoot(OrdersGrid).useChannel(OrdersFilter);
```

```tsx
// Orders.tsx, in the React app
import { GessoSurface, useHostChannel } from 'gesso-react';
import { OrdersFilter } from './orders.contract';

const ordersGrid = () => new Worker(new URL('./orders.render.worker.ts', import.meta.url), { type: 'module' });

export function Orders({ query }: { query: string }) {
  const navigate = useNavigate();
  const filter = useHostChannel(OrdersFilter, { query }, { open: (id: string) => navigate(`/orders/${id}`) });
  return <GessoSurface renderWorker={ordersGrid} channels={[filter]} colorScheme={theme} style={{ height: 480 }} />;
}
```

When `query` changes, the grid's channel has the new value on the
next frame; when the grid calls `open`, the latest render's callback
runs, so a closure over state is never stale.

`<GessoSurface>` mounts the app when it mounts and disposes it when it
unmounts: the workers it started are stopped, the canvas removed, the
channels no longer served. Its options are read once, at mount. Later
renders change `colorScheme`, without a remount, and the callbacks given
at mount follow the latest render's. To start the app again with other
options, change its `key`. A ref gives `focus()`.

## In Vue, or a plain page

`embedSurface` is the same thing without React. In Vue it goes in
`onMounted` and its `dispose` in `onBeforeUnmount`:

```ts
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { BehaviorSubject } from 'rxjs';
import { embedSurface, serve, type EmbeddedSurface } from 'gesso-framework/embed';

const host = ref<HTMLElement>();
const query = new BehaviorSubject(props.query);
watch(
  () => props.query,
  value => query.next(value)
);
let surface: EmbeddedSurface | undefined;

onMounted(() => {
  surface = embedSurface(host.value!, {
    renderWorker: () => new Worker(new URL('./orders.render.worker.ts', import.meta.url), { type: 'module' }),
    channels: [serve(OrdersFilter, { view: { query }, commands: { open: id => router.push(`/orders/${id}`) } })]
  });
});
onBeforeUnmount(() => surface?.dispose());
```

A plain page calls the same function on an element and keeps the
handle for as long as the app should run.

## What the page keeps

An app that is the page owns the address bar, the title and the
keyboard. An embedded one does not, and `embedSurface` turns those
defaults round:

- **The address bar.** History is `memory` unless you pass one, so an
  embedded router keeps its routes to itself. Pass `history` to share
  the page's: an app that owns everything under one hash can use
  `{ mode: 'hash', base }`.
- **The title and the leave warning.** `ShellService.setTitle` and
  `warnOnLeave` go to `onTitle` and `onLeaveWarning`, and nowhere when
  you give neither.
- **The keyboard.** Keys pressed elsewhere on the page are not the
  app's. Tab past the app's last stop moves to the page's next control,
  and Shift+Tab before its first to the one before; tabbing in lands on
  the first or last stop, as tabbing into any widget would. A dialog
  inside the app still keeps Tab inside it. This is `tabExit`, which
  `createApp` takes too.

## Channels from the page

`channels` are served on the page's own thread by `hostChannels`. The
render worker attaches to them by name, exactly as it would to an
application worker's, and cannot tell the difference.

With `appLogicWorker` as well, the page serves the channels it names
and the worker the rest: the rows can live in a worker while the filter
comes from the page. An AI agent's tools then describe the worker's
channels, which are the app's data, rather than the page's.

What crosses is plain data, as across any channel, and serving costs
the page's thread a structural diff for each value that changes. Keep
the rows in a worker; give the page's channels the filter, the
selection, the theme of the moment.

## Size and appearance

The app fills its host's content box and follows its size, so the host
needs a height of its own: a canvas has no content to be tall with, and
a host sized only by its content is zero tall. `embedSurface` warns
about one. A height in CSS, or a place in a flex or grid layout, is
enough.

`colorScheme` is `light`, `dark` or `auto`, and changing it does not
remount. The app's own theme, its colors and type, is the render
worker's, as in any Gesso app.

## Limits

- **The render worker is written by hand.** `gesso-vite-plugin` writes
  it only into a `createApp` call, so `renderWorker` is required here.
  `new Worker(new URL('./x.ts', import.meta.url), { type: 'module' })`
  is understood by Vite and by webpack 5.
- **Keep `@vitejs/plugin-react` off the worker.** It adds React
  Refresh to every `.tsx` it transforms, Refresh reads `window`, and a
  worker has none: the worker fails to start and the panel stays empty.
  `react({ exclude: /\.worker\.tsx?$/ })` does it, and a
  `/** @jsxImportSource gesso-framework */` pragma at the top of the
  worker gives it Gesso's JSX while the rest of the app keeps React's.
- **The app's theme follows the appearance only if it asks.** Read
  `ShellService.colorScheme` at the root and pick a theme from it, as
  [Appearance](/guide/appearance) shows; `colorScheme` on the surface
  is what that signal reports.
- **`OffscreenCanvas` is required**, as for any worker app.
- **Serving channels brings RxJS onto the page's thread.** Without
  `channels` the page's bundle has none of it from here.
- **Under React's `StrictMode`**, in development, the surface is mounted
  twice, so a first pair of workers is started and stopped at once.
- **Tab order is document order.** Leaving the app goes to the next
  control after the host in the document; a page that orders its
  controls with positive `tabindex` is not followed there.
