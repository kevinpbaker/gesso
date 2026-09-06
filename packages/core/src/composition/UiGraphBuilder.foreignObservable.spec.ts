import { describe, expect, it } from 'vitest';

import { Text } from './UiComponents';
import { UiGraph } from '../graph/UiGraph';
import { UiGraphBuilder } from './UiGraphBuilder';

/**
 * A prop bound to an observable from another copy of rxjs.
 *
 * An application whose bundle resolves `rxjs` separately from the
 * framework's produces observables that fail `instanceof Observable`
 * against the framework's class. Children were already detected
 * structurally (`isObservable` in `UiElement.ts` says so in as many
 * words); props were not, so the value was written once as a plain
 * object and never updated again.
 *
 * The failure has no symptom at the point of the mistake: nothing
 * warns, nothing throws, and an element simply has no text. It was
 * found in a native window, where the application and the framework
 * genuinely did resolve different copies. See
 * `docs/decisions/0072-a-second-copy-of-rxjs.md`.
 */
function foreignObservable<T>(initial: T): { emit(value: T): void; observable: unknown } {
  const listeners = new Set<(value: T) => void>();
  let current = initial;
  const observable = {
    // Everything an Observable has that anything here reads, and none
    // of this framework's Observable in its prototype chain.
    subscribe(observer: ((value: T) => void) | { next?: (value: T) => void }) {
      const next = typeof observer === 'function' ? observer : (observer.next?.bind(observer) ?? (() => {}));
      listeners.add(next);
      next(current);
      return { unsubscribe: () => listeners.delete(next) };
    },
    pipe() {
      return observable;
    }
  };
  return {
    observable,
    emit(value: T) {
      current = value;
      for (const listener of listeners) {
        listener(value);
      }
    }
  };
}

describe('a prop bound to an observable from another bundle', () => {
  it('is bound rather than written as an object', () => {
    const source = foreignObservable('first');
    const graph = new UiGraph();
    const builder = new UiGraphBuilder(graph);

    const text = builder.build(Text({ text: source.observable as never }));

    expect(text.getProperty('text')).toBe('first');

    source.emit('second');
    expect(text.getProperty('text')).toBe('second');
  });
});
