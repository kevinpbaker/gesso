# Gesso in a React app

A React page with one Gesso panel in it: a grid of 100,000 orders that filters as you type in a React field and reports a selection back to React.

- `src/orders.contract.ts` is the channel the two halves share.
- `src/App.tsx` serves it with `useHostChannel` and mounts the grid with `<GessoSurface>`.
- `src/orders.render.worker.tsx` is the Gesso app.

```bash
pnpm install
pnpm dev
```

Tab from the search field into the grid, through its rows, and on to the buttons below it. The guide is [Embedding in a page](https://gesso-docs.vercel.app/structure/embedding).
