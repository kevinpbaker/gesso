import { BehaviorSubject } from 'rxjs';

/**
 * Reactive state cell used by framework components.
 *
 * A State is a BehaviorSubject with a writable `.value` setter,
 * so it can be used both as an Observable (passed to UiElement
 * properties and children) and as a mutable value.
 */
export class State<T> extends BehaviorSubject<T> {
  constructor(initialValue: T) {
    super(initialValue);
  }

  override get value(): T {
    return super.getValue();
  }

  override set value(next: T) {
    this.next(next);
  }
}

/**
 * Creates a reactive state cell.
 *
 * Usage inside a component:
 *
 *   @State() count = state(0);
 *
 *   increment() {
 *     this.count.value++;
 *   }
 */
export function state<T>(initialValue: T): State<T> {
  return new State(initialValue);
}
