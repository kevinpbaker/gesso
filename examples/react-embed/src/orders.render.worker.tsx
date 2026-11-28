/** @jsxImportSource gesso-framework */
import { map } from 'rxjs';

import { darkTheme, LazyColumn, lightTheme, percent } from 'gesso-core';
import {
  computed,
  createComponent,
  renderRoot,
  ShellService,
  type ComponentContext,
  type Inputs
} from 'gesso-framework';

import { OrdersFilter } from './orders.contract';

/**
 * The Gesso half: one hundred thousand orders, filtered by the query
 * the React page serves, of which only the rows in view exist.
 */
const ROW = 32;
const CUSTOMERS = ['Northwind', 'Contoso', 'Fabrikam', 'Tailspin', 'Wingtip', 'Litware', 'Adatum', 'Proseware'];

interface Order {
  readonly id: string;
  readonly customer: string;
  readonly total: number;
}

const ORDERS: readonly Order[] = Array.from({ length: 100_000 }, (_, index) => ({
  id: `SO-${String(index + 1).padStart(6, '0')}`,
  customer: CUSTOMERS[(index * 7) % CUSTOMERS.length]!,
  total: ((index * 7919) % 100_000) / 100
}));

function matching(query: string): readonly Order[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return ORDERS;
  }
  return ORDERS.filter(
    order => order.customer.toLowerCase().includes(needle) || order.id.toLowerCase().includes(needle)
  );
}

function OrdersGrid(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const filter = ctx.channel(OrdersFilter);
  // The appearance the page asks for (`<GessoSurface colorScheme>`),
  // as one of the two themes `gesso-core` ships.
  const theme = ctx.inject(ShellService).colorScheme.pipe(map(scheme => (scheme === 'dark' ? darkTheme : lightTheme)));
  const rows = computed(() => matching(filter.view.query.value));

  const renderRow = (index: number) => {
    const order = rows.value[index]!;
    return (
      <button
        label={`Order ${order.id}, ${order.customer}`}
        onClick={() => filter.send.select(order.id)}
        height={ROW}
        width={percent(100)}>
        <row width={percent(100)} height={ROW} paddingLeft={12} paddingRight={12} x="space-between" y="center">
          <text text={order.id} fontSize={13} color="text" />
          <text text={order.customer} fontSize={13} color="textMuted" />
          <text text={`$${order.total.toFixed(2)}`} fontSize={13} color="text" />
        </row>
      </button>
    );
  };

  const caption = computed(() => {
    const query = filter.view.query.value;
    const count = rows.value.length.toLocaleString('en-US');
    return query === '' ? `${count} orders` : `${count} orders matching "${query}"`;
  });

  return (
    <column
      theme={theme}
      textStyle={theme.pipe(map(value => value.typography.body))}
      width={percent(100)}
      height={percent(100)}
      gap={8}
      padding={8}
      backgroundColor="background">
      <text text={caption} fontSize={12} color="textMuted" />
      {LazyColumn(
        {
          width: percent(100),
          flexGrow: 1,
          count: rows.pipe(map(list => list.length)),
          revision: filter.view.query,
          estimatedExtent: ROW,
          borderWidth: 1,
          borderColor: 'border',
          borderRadius: 8,
          backgroundColor: 'surface'
        },
        renderRow
      )}
    </column>
  );
}

renderRoot(createComponent(OrdersGrid, {})).useChannel(OrdersFilter);
