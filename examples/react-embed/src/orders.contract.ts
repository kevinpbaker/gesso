import { defineChannel } from 'gesso-framework';

/**
 * What the React page and the Gesso grid share: the only module both
 * import. The page serves it with `useHostChannel`; the grid reads it
 * with `ctx.channel(OrdersFilter)`.
 */
export const OrdersFilter = defineChannel('orders-filter', {
  view: { query: '' },
  commands: {} as {
    /** Selects an order. @param id The order's id. */
    select(id: string): void;
  }
});
