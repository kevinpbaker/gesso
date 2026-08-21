import { describe, expect, it } from 'vitest';
import { Store } from './Store';
import { state } from '../State';
import { State, Action, Projection } from './decorators';

interface CartItem {
  id: string;
  name: string;
  price: number;
}

class CartStore extends Store {
  @State() items = state<CartItem[]>([]);

  @Projection()
  get summary() {
    return {
      itemCount: this.items.value.length,
      totalPrice: this.items.value.reduce((sum, item) => sum + item.price, 0)
    };
  }

  @Action()
  addItem(item: CartItem) {
    this.items.value = [...this.items.value, item];
  }

  @Action()
  clear() {
    this.items.value = [];
  }
}

function createCartStore(): CartStore {
  const store = new CartStore();
  store.init();
  return store;
}

describe('Store', () => {
  it('exposes state through selectors', () => {
    const cart = createCartStore();
    let lastValue: number | undefined;
    cart
      .select(s => s.items.value.length)
      .subscribe(count => {
        lastValue = count;
      });
    expect(lastValue).toBe(0);
  });

  it('emits selector updates when state changes', () => {
    const cart = createCartStore();
    const values: number[] = [];
    cart
      .select(s => s.items.value.length)
      .subscribe(count => {
        values.push(count);
      });
    cart.dispatch('addItem', { id: '1', name: 'Hat', price: 20 });
    cart.dispatch('addItem', { id: '2', name: 'Shirt', price: 30 });
    expect(values).toEqual([0, 1, 2]);
  });

  it('re-evaluates projections in selectors', () => {
    const cart = createCartStore();
    const values: number[] = [];
    cart
      .select(s => s.summary.totalPrice)
      .subscribe(total => {
        values.push(total);
      });
    cart.dispatch('addItem', { id: '1', name: 'Hat', price: 20 });
    cart.dispatch('addItem', { id: '2', name: 'Shirt', price: 30 });
    expect(values).toEqual([0, 20, 50]);
  });

  it('throws when dispatching an unknown action', () => {
    const cart = createCartStore();
    expect(() => cart.dispatch('unknown', {})).toThrow("Action 'unknown' not found on store 'CartStore'.");
  });

  it('throws when a @State field is not a State cell', () => {
    class BadStore extends Store {
      @State() count = 0;
    }
    const store = new BadStore();
    expect(() => store.init()).toThrow("Store 'BadStore' declares @State() 'count' but it is not a State cell");
  });
});
