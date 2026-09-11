import { Observable, Subject, Subscription } from 'rxjs';
import { equalityOf, type Equality } from './derive';
import { currentBody, trackRead, withTracking, type ReadableCell } from './Input';

export interface ComputedOptions<T> {
  /** How a new result is judged unchanged; `reference` by default. */
  readonly equal?: Equality<T>;
  /** What to call this cell in a warning. */
  readonly label?: string;
}

/**
 * Reads a stream that is not a cell, inside a `computed`.
 *
 * A cell is read with `.value`; a plain Observable has no current value
 * to read, so the function is handed this instead:
 *
 *   const playing = computed(read => read(audio.actions) === 'play');
 *
 * It answers with the stream's latest value and records the stream as a
 * source, so the computed follows it exactly as it follows a cell. A
 * cell passed to it is simply read, which means one call site works for
 * either and a service that later turns a stream into a cell breaks
 * nothing.
 */
export type ReadSource = <V>(source: Observable<V>) => V;

/**
 * A cell whose value is a function of other cells.
 *
 * `computed(() => quantity.value * price.value)` reads like the value it
 * is. The cells its function reads through `.value` are its sources,
 * found by running the function and watching what it touches, so there
 * is no list to keep in step with the expression; a read the function
 * did not make this time is a source it no longer has.
 *
 * A stream that is not a cell is read through the `read` the function
 * is handed: `computed(read => read(stream).status)` follows the stream
 * as it follows a cell. That is what makes this the only derivation an
 * application needs, whether or not the thing it derives from happens
 * to have a current value of its own.
 *
 * It is a cell and nothing else. Bound to a prop it is an Observable
 * like every other cell, so a component written with it and one written
 * with `pipe` compose without translation. Read in a handler with
 * `.value` it is the current result, computed on the spot if nothing is
 * following it. RxJS is underneath and nothing here replaces it.
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
    private readonly compute: (read: ReadSource) => T,
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
    const touched = new Set<ReadableCell<unknown>>();
    const next = withTracking(touched, () => this.compute(readSource));
    this.sources = touched;
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
 * A cell computed from what its function reads. See `ComputedCell`.
 *
 *   const total = computed(() => quantity.value * PRICE * RATES[currency.value]);
 *   <text text={computed(() => String(count.value))} />
 *
 * Cells are read with `.value`; anything else is read through the
 * `read` the function is given, which follows it the same way:
 *
 *   const late = computed(read => read(clock) > deadline);
 */
export function computed<T>(compute: (read: ReadSource) => T, options: ComputedOptions<T> = {}): ComputedCell<T> {
  return new ComputedCell(compute, options);
}

/**
 * The cell standing for a stream, one per stream.
 *
 * Anything that already has a current value is its own cell, so a
 * `read` of an input, an internal state or another computed costs a
 * property access and nothing more. Everything else gets a `StreamCell`
 * held against it here, so several computeds reading one stream share a
 * single subscription to it rather than opening one each.
 *
 * Weak on purpose: the entry is reachable only while the stream is, so
 * a stream made in a component body is collected with the component.
 */
const streamCells = new WeakMap<Observable<unknown>, StreamCell<unknown>>();

/**
 * Whether a source's `.value` announces itself to the running computed,
 * decided once per source and remembered.
 *
 * Having a `value` is not enough. A framework cell records its reads
 * through `trackRead`, which is what lets a computed learn what it
 * depends on; a plain `BehaviorSubject` has a `value` too and records
 * nothing, so a computed that trusted the property would read it once
 * and never hear it change. That is exactly what happened to three
 * data-layer specs that fed a raw subject where the application feeds
 * a channel view. The probe reads `.value` once under a tracking set
 * of its own and asks whether the source turned up in it.
 */
const tracksReads = new WeakMap<Observable<unknown>, boolean>();

function announcesItsReads(source: ReadableCell<unknown>): boolean {
  let known = tracksReads.get(source);
  if (known === undefined) {
    const seen = new Set<ReadableCell<unknown>>();
    withTracking(seen, () => void source.value);
    known = seen.has(source);
    tracksReads.set(source, known);
  }
  return known;
}

function cellFor<T>(source: Observable<T>): ReadableCell<T> {
  if ('value' in source && announcesItsReads(source as ReadableCell<T>)) {
    return source as ReadableCell<T>;
  }
  let cell = streamCells.get(source as Observable<unknown>);
  if (cell === undefined) {
    cell = new StreamCell(source as Observable<unknown>);
    streamCells.set(source as Observable<unknown>, cell);
  }
  return cell as ReadableCell<T>;
}

/** The `read` every computed's function is handed. */
const readSource: ReadSource = <V>(source: Observable<V>): V => cellFor(source).value;

/**
 * A plain stream, seen as a cell.
 *
 * It holds the last value it saw and hands it to whoever asks, which is
 * the one thing a cell has and an Observable does not. While something
 * follows it, it follows the stream; when the last follower leaves it
 * lets go, so it costs nothing between uses and needs no disposal, on
 * the same terms as `ComputedCell`.
 *
 * A `.value` read with nothing following takes one synchronous
 * subscription and drops it again, which is how a `BehaviorSubject`
 * behind an `asObservable()`, or a `combineLatest` over such subjects,
 * answers with what it already holds. A stream that has nothing to say
 * synchronously answers `undefined` until its first emission arrives,
 * which is the honest answer: there is no value yet.
 */
class StreamCell<T> extends Observable<T> implements ReadableCell<T> {
  private last!: T;
  private followers = 0;
  private upstream: Subscription | null = null;
  private readonly changes = new Subject<T>();

  constructor(private readonly stream: Observable<T>) {
    super(subscriber => {
      this.followers++;
      if (this.upstream === null) {
        this.attach();
      }
      subscriber.next(this.last);
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
        this.last = value;
      });
      asking.unsubscribe();
    }
    return this.last;
  }

  private attach(): void {
    this.upstream = this.stream.subscribe(value => {
      this.last = value;
      this.changes.next(value);
    });
  }
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
