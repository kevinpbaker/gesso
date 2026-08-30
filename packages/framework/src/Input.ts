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
 * Inside a class component the argument is the default the cell holds
 * until the parent supplies a value:
 *
 *   @Input() label = input('Count');
 *
 * Inside a functional component the props are already cells; the
 * two-argument form derives a cell that replaces `undefined` with a
 * fallback, which is how an optional prop gets its default:
 *
 *   function Counter(props: Inputs<{ label?: string }>) {
 *     const label = input(props.label, 'Count');   // InputCell<string>
 *     return Text({ text: label });
 *   }
 *
 * The derived cell follows the source for the life of the component
 * and completes when the source does, so it needs no teardown.
 */
export function input<T>(initialValue: T): InputCell<T>;
export function input<T>(source: InputCell<T | undefined>, fallback: T): InputCell<T>;
export function input<T>(first: T | InputCell<T | undefined>, fallback?: T): InputCell<T> {
  if (arguments.length < 2 || !(first instanceof InputCell)) {
    return new InputCell(first as T);
  }
  const source = first as InputCell<T | undefined>;
  const withFallback = (value: T | undefined): T => (value === undefined ? (fallback as T) : value);
  const derived = new InputCell<T>(withFallback(source.value));
  source.subscribe({
    next: value => derived.next(withFallback(value)),
    complete: () => derived.complete()
  });
  return derived;
}
