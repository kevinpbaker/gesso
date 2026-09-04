import { Observable, Subject, Subscription } from 'rxjs';
import { equalityOf, type Equality } from './derive';
import { currentBody, trackRead, withTracking, type ReadableCell } from './Input';

export interface ComputedOptions<T> {
  /** How a new result is judged unchanged; `reference` by default. See `derive`. */
  readonly equal?: Equality<T>;
  /** What to call this cell in a warning. */
  readonly label?: string;
}

/**
 * A cell whose value is a function of other cells.
 *
 * `computed(() => quantity.value * price.value)` reads like the value it
 * is. The cells its function reads through `.value` are its sources,
 * found by running the function and watching what it touches, so there
 * is no list to keep in step with the expression; a read the function
 * did not make this time is a source it no longer has.
 *
 * It is a cell and nothing else. Bound to a prop it is an Observable
 * like every other cell, so a component written with it and one written
 * with `pipe` compose without translation. Read in a handler with
 * `.value` it is the current result, computed on the spot if nothing is
 * following it. RxJS is underneath; nothing here replaces it, and
 * `derive` is still what an Observable that is not a cell (a stream, a
 * shell signal) is projected with.
 *
 * Nothing runs until someone asks. With no subscriber the function runs
 * only when `.value` is read; with one, the cell follows its sources and
 * emits a result when it differs from the last by `equal`. When the last
 * subscriber leaves it lets go of its sources, so a computed made in a
 * component body dies with the component's bindings and needs no
 * disposal of its own.
 *
 * Reading it with `.value` while a component body runs is the same
 * snapshot an input read there is, and it warns the same way: once, if
 * it later changes with nobody following.
 */
export class ComputedCell<T> extends Observable<T> implements ReadableCell<T> {
  label: string | undefined;
  private readonly equal: (a: T, b: T) => boolean;
  private readonly changes = new Subject<T>();
  private sources = new Set<ReadableCell<unknown>>();
  private cached!: T;
  private hasValue = false;
  private upstream: Subscription | null = null;
  private subscribers = 0;
  private attaching = false;
  private snapshotBy: string | null = null;
  private warnedStale = false;
  /** Follows the sources after a body read, only to notice the change the body will not. */
  private staleWatch: Subscription | null = null;

  constructor(
    private readonly compute: () => T,
    options: ComputedOptions<T> = {}
  ) {
    super(subscriber => {
      this.subscribers++;
      // A follower makes the body-read watch moot: the change reaches the screen.
      this.staleWatch?.unsubscribe();
      this.staleWatch = null;
      if (this.upstream === null) {
        this.attach();
      }
      subscriber.next(this.cached);
      const following = this.changes.subscribe(subscriber);
      return () => {
        following.unsubscribe();
        this.subscribers--;
        if (this.subscribers === 0) {
          this.detach();
        }
      };
    });
    this.equal = equalityOf(options.equal ?? 'reference');
    this.label = options.label;
  }

  /** The current result: kept by the sources while followed, computed now when not. */
  get value(): T {
    trackRead(this);
    if (this.upstream === null) {
      this.recompute();
    }
    const body = currentBody();
    if (body !== null && this.snapshotBy === null) {
      this.snapshotBy = body;
      this.watchForStaleRead();
    }
    return this.cached;
  }

  /**
   * A body read the value once; if a source now changes with nothing
   * following this cell, the screen built from that read is stale and
   * nobody would know. So the sources are watched for exactly that, and
   * the watch ends with the warning or with a real subscriber arriving.
   */
  private watchForStaleRead(): void {
    this.staleWatch = new Subscription();
    let settling = true;
    for (const source of this.sources) {
      this.staleWatch.add(
        source.subscribe(() => {
          if (settling || this.observed) {
            return;
          }
          if (this.recompute()) {
            this.warnStale();
            this.staleWatch?.unsubscribe();
            this.staleWatch = null;
          }
        })
      );
    }
    settling = false;
  }

  private warnStale(): void {
    if (this.snapshotBy === null || this.warnedStale) {
      return;
    }
    this.warnedStale = true;
    console.warn(
      `Component '${this.snapshotBy}' read ${this.label === undefined ? 'a computed cell' : `\`${this.label}\``} with .value while its body ran, ` +
        `and nothing is following that cell. It has since changed, and whatever was built from the first value still shows it. ` +
        `A component body runs once: bind the cell instead.`
    );
  }

  /** Whether anything is following this cell; the stale-read warning's question. */
  get observed(): boolean {
    return this.subscribers > 0;
  }

  /** Runs the function, watching what it reads; true when the result changed. */
  private recompute(): boolean {
    const read = new Set<ReadableCell<unknown>>();
    const next = withTracking(read, this.compute);
    this.sources = read;
    const changed = !this.hasValue || !this.equal(this.cached, next);
    this.hasValue = true;
    this.cached = next;
    return changed;
  }

  /** Follows the current sources, re-running on any change to them. */
  private attach(): void {
    this.attaching = true;
    this.recompute();
    this.upstream = new Subscription();
    for (const source of this.sources) {
      this.upstream.add(source.subscribe(() => this.onSourceChanged()));
    }
    this.attaching = false;
  }

  private detach(): void {
    this.upstream?.unsubscribe();
    this.upstream = null;
  }

  private onSourceChanged(): void {
    if (this.attaching) {
      return; // a cell replays its current value on subscribe; that is not a change
    }
    const before = new Set(this.sources);
    const changed = this.recompute();
    if (!sameSet(before, this.sources)) {
      // The function read different cells this time: follow those.
      this.detach();
      this.attaching = true;
      this.upstream = new Subscription();
      for (const source of this.sources) {
        this.upstream.add(source.subscribe(() => this.onSourceChanged()));
      }
      this.attaching = false;
    }
    if (changed) {
      this.changes.next(this.cached);
    }
  }
}

/**
 * A cell computed from the cells its function reads. See `ComputedCell`.
 *
 *   const total = computed(() => quantity.value * PRICE * RATES[currency.value]);
 *   <text text={computed(() => String(count.value))} />
 */
export function computed<T>(compute: () => T, options: ComputedOptions<T> = {}): ComputedCell<T> {
  return new ComputedCell(compute, options);
}

function sameSet<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const item of a) {
    if (!b.has(item)) {
      return false;
    }
  }
  return true;
}
