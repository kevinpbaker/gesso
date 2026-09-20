import { BehaviorSubject } from 'rxjs';
import { trackRead } from './Input';

/**
 * A component's own state: originated here, and never crossing the
 * barrier.
 *
 * The writable counterpart to `InputCell`. The two are the same
 * `BehaviorSubject` and differ by one accessor — this one has a
 * `.value` setter — and that difference is the whole semantics:
 *
 *     internalState()   never crosses    I write it
 *     input()           crosses inward   someone else writes it
 *
 * Named on that axis deliberately. It used to be `state()`, which
 * described *what* a thing was while `input()` described *where it
 * came from*; two names on two axes made neither of them tell you
 * anything about the other. `internalState(products)` reads as a
 * mistake at the call site in a way `state(products)` never did.
 *
 * For values that originate on this thread and die with the component:
 * a tooltip's open flag, a caret, a scroll offset, the active tab.
 * Anything that survives a reload, or that another screen cares about,
 * is application state and belongs on a channel. Anything derived from
 * other cells is a `computed`.
 *
 * It is not only for components. The thread that owns a channel's data
 * writes cells too, and wrote them as a `BehaviorSubject` mirrored
 * into an `asObservable()` because this was reachable only through the
 * framework's main entry. `gesso-framework/worker` is the same cell
 * with none of the renderer behind it, so an application worker holds
 * one cell rather than a subject and a copy of it, and reads it with
 * `.value` in a `computed` rather than listing it in a
 * `combineLatest`. "Internal" still means what it says there: written
 * here, and crossing the barrier only as the plain data a view key
 * publishes.
 */
export class InternalState<T> extends BehaviorSubject<T> {
  /** What to call this cell in a warning or the inspector; optional. */
  label: string | undefined;
  constructor(initialValue: T) {
    super(initialValue);
  }

  override get value(): T {
    trackRead(this);
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
 *   private readonly count = state(0);
 *
 *   increment() {
 *     this.count.value++;
 *   }
 */
export function internalState<T>(initialValue: T, label?: string): InternalState<T> {
  const state = new InternalState(initialValue);
  if (label !== undefined) {
    state.label = label;
  }
  return state;
}
