import { useState } from 'react';
import { GessoSurface, useHostChannel } from 'gesso-react';

import { OrdersFilter } from './orders.contract';

/** Spawns the grid's render worker. Outside the component, so it is one function for the app's life. */
const ordersGrid = () => new Worker(new URL('./orders.render.worker.tsx', import.meta.url), { type: 'module' });

/**
 * An ordinary React page. The search field, the selection and the
 * buttons are React; the grid between them is a Gesso app, drawn in its
 * own worker, that reads the query and reports a selection through one
 * channel.
 */
export function App() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const filter = useHostChannel(OrdersFilter, { query }, { select: (id: string) => setSelected(id) });

  return (
    <main style={{ maxWidth: 720, margin: '24px auto', padding: '0 16px', display: 'grid', gap: 12 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>Orders</h1>
      <label style={{ display: 'grid', gap: 4 }}>
        Search
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Customer or order number" />
      </label>
      <GessoSurface
        renderWorker={ordersGrid}
        channels={[filter]}
        colorScheme={dark ? 'dark' : 'light'}
        style={{ height: 420, borderRadius: 8, overflow: 'hidden' }}
      />
      <p style={{ margin: 0 }}>Selected: {selected ?? 'none'}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setDark(value => !value)}>{dark ? 'Light' : 'Dark'}</button>
        <button onClick={() => setSelected(null)}>Clear selection</button>
      </div>
    </main>
  );
}
