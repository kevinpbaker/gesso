/**
 * `gesso-react`: a Gesso app as one panel of a React app.
 *
 * `<GessoSurface>` mounts an app in a `div` and disposes it on unmount;
 * `useHostChannel` gives the app a component's props and callbacks as a
 * channel. Both are `gesso-framework/embed` underneath, which a Vue or
 * plain page can use directly.
 *
 *   function Orders({ query }: { query: string }) {
 *     const navigate = useNavigate();
 *     const filter = useHostChannel(OrdersFilter, { query }, { open: (id: string) => navigate(`/orders/${id}`) });
 *     return <GessoSurface renderWorker={ordersGrid} channels={[filter]} style={{ height: 480 }} />;
 *   }
 */
export { GessoSurface, type GessoSurfaceHandle, type GessoSurfaceProps } from './GessoSurface';
export { useHostChannel } from './useHostChannel';
