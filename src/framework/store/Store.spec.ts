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
  @State() unrelated = state('idle');

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

  @Action()
  renameFirst(name: string) {
    this.items.value = this.items.value.map((item, index) => (index === 0 ? { ...item, name } : item));
  }

  @Action()
  touchUnrelated() {
    this.unrelated.value = `tick-${Math.random()}`;
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

  describe('projections', () => {
    it('exposes a @Projection() getter as an observable', () => {
      const cart = createCartStore();
      const seen: { itemCount: number; totalPrice: number }[] = [];
      cart.projection.summary.subscribe(value => seen.push(value));

      expect(seen).toEqual([{ itemCount: 0, totalPrice: 0 }]);

      cart.dispatch('addItem', { id: '1', name: 'Hat', price: 20 });

      expect(seen).toHaveLength(2);
      expect(seen[1]).toEqual({ itemCount: 1, totalPrice: 20 });
    });

    it('does not emit when unrelated state changes', () => {
      // The projection allocates a fresh object every evaluation, so
      // under reference equality this emits on every state change.
      // This is the bug Phase C exists to fix.
      const cart = createCartStore();
      const seen: unknown[] = [];
      cart.projection.summary.subscribe(value => seen.push(value));

      expect(seen).toHaveLength(1);

      cart.dispatch('touchUnrelated');
      cart.dispatch('touchUnrelated');

      expect(seen).toHaveLength(1);
    });

    it('does not emit when projected state changes but the projection does not', () => {
      const cart = createCartStore();
      cart.dispatch('addItem', { id: '1', name: 'Hat', price: 20 });

      const seen: unknown[] = [];
      cart.projection.summary.subscribe(value => seen.push(value));
      expect(seen).toHaveLength(1);

      // Renaming rebuilds the items array the projection reads, but
      // summary projects only count and total, so the view model is
      // unchanged and the view must not be disturbed.
      cart.dispatch('renameFirst', 'Fedora');

      expect(cart.items.value[0].name).toBe('Fedora');
      expect(seen).toHaveLength(1);
    });

    it('shares one evaluation across subscribers', () => {
      const cart = createCartStore();
      let evaluations = 0;
      Object.defineProperty(cart, 'summary', {
        get() {
          evaluations++;
          return { itemCount: this.items.value.length };
        }
      });

      const projection = cart.projection.summary;
      const a = projection.subscribe();
      const b = projection.subscribe();

      expect(evaluations).toBe(1);

      a.unsubscribe();
      b.unsubscribe();
    });

    it('throws when accessing a member that is not a projection', () => {
      const cart = createCartStore();

      expect(() => cart.projection.addItem).toThrow(/is not a @Projection\(\) on store 'CartStore'/);
    });
  });

  describe('selector comparison', () => {
    it('does not re-emit an object selector when its value is unchanged', () => {
      const cart = createCartStore();
      const seen: unknown[] = [];
      cart.select(s => ({ count: s.items.value.length })).subscribe(value => seen.push(value));

      expect(seen).toEqual([{ count: 0 }]);

      cart.dispatch('touchUnrelated');
      cart.dispatch('touchUnrelated');

      expect(seen).toHaveLength(1);
    });

    it('emits when an object selector value actually changes', () => {
      const cart = createCartStore();
      const seen: unknown[] = [];
      cart.select(s => ({ count: s.items.value.length })).subscribe(value => seen.push(value));

      cart.dispatch('addItem', { id: '1', name: 'Hat', price: 20 });

      expect(seen).toEqual([{ count: 0 }, { count: 1 }]);
    });
  });
});
