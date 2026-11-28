# gesso-react

Mount a Gesso app inside a React app, one panel at a time: a grid or an editor in a page that stays React.

```bash
npm install gesso-core gesso-framework gesso-react rxjs
```

## A panel

```tsx
import { GessoSurface, useHostChannel } from 'gesso-react';
import { OrdersFilter } from './orders.contract';

const ordersGrid = () => new Worker(new URL('./orders.render.worker.ts', import.meta.url), { type: 'module' });

export function Orders({ query }: { query: string }) {
  const navigate = useNavigate();
  const filter = useHostChannel(OrdersFilter, { query }, { open: (id: string) => navigate(`/orders/${id}`) });
  return <GessoSurface renderWorker={ordersGrid} channels={[filter]} style={{ height: 480 }} />;
}
```

The render worker is an ordinary Gesso one: `renderRoot(OrdersGrid).useChannel(OrdersFilter)`.

- **`<GessoSurface>`** mounts the app in a `div` it fills, and disposes it on unmount. Give the `div` a height. Options are read at mount; `colorScheme` follows later renders, and so do the callbacks given at mount. Change the `key` to start again with other options.
- **`useHostChannel(token, view, commands)`** serves a channel from the component: its props or state as the view, its callbacks as the commands. A command always calls the latest render's callback.

The page keeps its address bar, its title and its leave warning, and Tab leaves the app at either end, as it would any widget.

Underneath it is `gesso-framework/embed`, which a Vue or plain page can use directly. The guide is [Embedding in a page](https://gesso-docs.vercel.app/structure/embedding).
