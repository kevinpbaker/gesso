import {
  debounceTime,
  Observable,
  Subject,
  Subscription,
  tap,
  throttleTime,
  type MonoTypeOperatorFunction
} from 'rxjs';

import { trackRead, type ReadableCell } from './Input';

/**
 * A cell that lets its source through on a timer.
 *
 * The two operators below are the same machinery with a different
 * gate, and both are cells rather than plain streams on purpose: a
 * `computed` reads a cell with `.value` and follows it, so a debounced
 * search term composes with everything else in the dialect instead of
 * being the one value in a screen that has to be piped.
 *
 * It holds the last value the gate let through, which is what `.value`
 * answers while something is following it. With nothing following
 * there is no timer running to hold anything back, so `.value` reads
 * the source directly, which is the honest answer rather than a value
 * frozen at whatever moment the last follower left.
 *
 * A value equal to the one it already holds is not a change and is not
 * emitted, the same rule `computed` follows. Without it the first pass
 * of the gate after a subscription would repeat the value the
 * subscriber had just been handed.
 *
 * One subscription upstream however many followers it has, given back
 * when the last of them leaves, on the same terms as `ComputedCell`.
 */
class TimedCell<T> extends Observable<T> implements ReadableCell<T> {
  private current!: T;
  private hasCurrent = false;
  private followers = 0;
  private seeding = false;
  private upstream: Subscription | null = null;
  private readonly changes = new Subject<T>();

  constructor(
    private readonly stream: Observable<T>,
    private readonly gate: MonoTypeOperatorFunction<T>
  ) {
    super(subscriber => {
      this.followers++;
      if (this.upstream === null) {
        this.attach();
      }
      subscriber.next(this.current);
      const following = this.changes.subscribe(subscriber);
      return () => {
        following.unsubscribe();
        this.followers--;
        if (this.followers === 0) {
          this.upstream?.unsubscribe();
          this.upstream = null;
        }
      };
    });
  }

  get value(): T {
    trackRead(this);
    if (this.upstream === null) {
      const asking = this.stream.subscribe(value => {
        this.current = value;
        this.hasCurrent = true;
      });
      asking.unsubscribe();
    }
    return this.current;
  }

  private attach(): void {
    // Seeds the current value from whatever the source already holds,
    // so a cell behind a gate has a value on the first frame rather
    // than after the first delay. Only during the subscribe itself: a
    // value arriving later is a change, and absorbing it here would
    // let it past the gate without telling anybody.
    this.seeding = true;
    this.upstream = this.stream
      .pipe(
        tap(value => {
          if (this.seeding && !this.hasCurrent) {
            this.current = value;
            this.hasCurrent = true;
          }
        }),
        this.gate
      )
      .subscribe(value => {
        if (this.hasCurrent && Object.is(this.current, value)) {
          return;
        }
        this.current = value;
        this.hasCurrent = true;
        this.changes.next(value);
      });
    this.seeding = false;
  }
}

/**
 * A cell that follows its source once it has stopped moving.
 *
 *   const query = internalState('');
 *   const term = debounced(query, 200);
 *   const results = computed(() => index.search(term.value));
 *
 * Nothing is emitted while values keep arriving; `ms` after the last
 * one, the last one is. This is what a search field wants and what
 * every search field in the tree was reaching the router without: a
 * keystroke is not a question, and a pause is.
 *
 * The value the source already held is there immediately, so a screen
 * built from this draws on the first frame rather than `ms` later.
 */
export function debounced<T>(source: Observable<T>, ms: number): ReadableCell<T> {
  return new TimedCell(source, debounceTime<T>(ms));
}

/**
 * A cell that follows its source at most once every `ms`.
 *
 *   const position = throttled(scrollOffset, 100);
 *
 * The first value goes straight through and the last of a burst
 * follows at the end of the window, so a value that arrives while the
 * window is open is late rather than lost. That pairing is what makes
 * this usable for a position or a progress reading, where the
 * beginning and the end of a movement both matter and the middle does
 * not.
 *
 * Use this for something that is continuously true, and `debounced`
 * for something a person has finished saying.
 */
export function throttled<T>(source: Observable<T>, ms: number): ReadableCell<T> {
  return new TimedCell(source, throttleTime<T>(ms, undefined, { leading: true, trailing: true }));
}
