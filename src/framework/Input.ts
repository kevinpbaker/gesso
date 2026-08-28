import { BehaviorSubject } from 'rxjs';

/**
 * Reactive cell holding a component input.
 *
 * Inputs must be cells because render() runs exactly once. A component
 * that read a plain input value during render would capture it for the
 * life of the instance, so a parent supplying new props under a
 * dynamic subtree would update the field while the rendered tree kept
 * showing the original value.
 *
 * The cell is written by the component host only: it accepts whatever
 * the parent passed, subscribing it first when the parent passed an
 * Observable. `value` is deliberately read-only, so `this.label.value =
 * x` inside a component is a compile error rather than a silent
 * violation of the one-way data flow.
 */
export class InputCell<T> extends BehaviorSubject<T> {
  constructor(initialValue: T) {
    super(initialValue);
  }

  override get value(): T {
    return super.getValue();
  }
}

/**
 * Creates a component input cell.
 *
 * Usage inside a component:
 *
 *   @Input() label = input('Count');
 *
 *   render() {
 *     return Text({ text: this.label });
 *   }
 *
 * The argument is the default used when the parent supplies no value
 * for the input.
 */
export function input<T>(initialValue: T): InputCell<T> {
  return new InputCell(initialValue);
}
