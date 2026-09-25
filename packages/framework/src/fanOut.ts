import { BehaviorSubject, Observable, Subscription } from 'rxjs';

import { equalityOf, type Equality } from './derive';
import { trackRead, type ReadableCell } from './Input';

/** What a key is. A cell in a grid names itself `${row}:${column}`. */
export type FanKey = string | number;

export interface FanOutOptions<S, V> {
  /**
   * What a key's cell holds before the source has said anything.
   *
   * Required, and not `undefined` by default, because the surfaces
   * this exists for mount their cells before the first patch arrives:
   * a grid that fills in as the window is served needs "a cell waiting"
   * to be a value it can draw rather than a hole. A function is given
   * the key, for a default that varies by position.
   */
  readonly initial: V | ((key: FanKey) => V);
  /**
   * Which keys an emission could have changed, when the source knows.
   *
   * Without it every emission reads every live key and pushes the ones
   * that differ, which is correct and is what the natural spelling
   * costs too — so on its own the registry buys a cheaper mount and a
   * cheaper teardown and little else. This is where the frame goes.
   * A patch that touched one cell of ten thousand should cost one
   * read, and a source that already knows what it changed is the only
   * thing that can say so.
   *
   * Return `undefined` for "I do not know", which walks them all: a
   * scroll that replaces the window is honestly that case, and a
   * source that guessed narrow there would leave stale cells on the
   * screen. Keys that are not live are skipped, so the set may be as
   * loose as the source finds convenient.
   */
  readonly changed?: (next: S, previous: S | undefined) => Iterable<FanKey> | undefined;
  /**
   * How one key's new value is judged unchanged; `structural` by
   * default, because a reader nearly always builds a value rather than
   * passing one through, and a rebuilt equal one is not a change.
   */
  readonly equal?: Equality<V>;
  /** What to call these cells in a warning. */
  readonly label?: string;
}

/**
 * One key's value, as a cell.
 *
 * It is a cell and nothing else: bound to a prop it is an Observable
 * like any other, read with `.value` it is the current value, and it
 * composes inside a `computed`. What is different is where its value
 * comes from — it is *pushed* by the registry that made it rather than
 * pulled through a pipeline of its own, and that is the whole point.
 */
export class FanCell<V> extends Observable<V> implements ReadableCell<V> {
  /** @internal */
  readonly subject: BehaviorSubject<V>;

  constructor(
    initial: V,
    readonly key: FanKey,
    readonly label: string | undefined
  ) {
    const subject = new BehaviorSubject(initial);
    super(subscriber => subject.subscribe(subscriber));
    this.subject = subject;
  }

  get value(): V {
    trackRead(this);
    return this.subject.value;
  }
}

/**
 * Many cells from one source, with one subscription between them.
 *
 * `fanOut` is the answer to a shape that every large surface arrives
 * at and that `select`, `derive` and `computed` all get wrong: N
 * things on screen, each reading its own slice of one upstream value.
 *
 *   const cells = fanOut(sheet.view.cells, (cells, key) => cells[key] ?? null);
 *
 *   const cell = cells.for('12:4');   // a stable cell, made on demand
 *   Text({ text: cell });             // bound like anything else
 *   cells.release('12:4');            // when it leaves the screen
 *
 * **Why not a pipe per slice.** `source.pipe(map(v => v[key]))` per
 * cell is the natural spelling and it does not scale, in two ways that
 * compound. Every emission runs N pipelines, whatever changed; and
 * RxJS removes a subscriber from a Subject by scanning its observer
 * list, so tearing down a window of N cells is quadratic. Gessosheet
 * measured the first at 0.2 ms of median frame and five milliseconds
 * of input latency for one such binding per cell, and learned it three
 * separate times before writing the fan-out by hand.
 *
 * **What this does instead.** One subscription on the source for the
 * whole registry. Each emission walks the live keys — not the source's
 * keys, of which there may be millions — reads each one, and pushes
 * only the ones that changed. Each cell then has one or two observers
 * of its own, so its own teardown is the constant-time case that RxJS
 * is good at. Releasing a key is a map delete.
 *
 * **A registry is a resource.** It holds a key until `release`, and
 * the source until `close` or the last key goes. That is deliberate:
 * the surfaces that need this are the ones that mount and unmount
 * deliberately, and a cell that vanished when its last binding did
 * would be rebuilt on every scroll frame by exactly the code that
 * cannot afford it.
 */
export function fanOut<S, V>(
  source: Observable<S>,
  read: (snapshot: S, key: FanKey) => V,
  options: FanOutOptions<S, V>
): FanOut<S, V> {
  return new FanOut(source, read, options);
}

/** What `fanOut` returns. See there. */
export class FanOut<S, V> {
  private readonly cells = new Map<FanKey, FanCell<V>>();
  private readonly equal: (a: V, b: V) => boolean;
  private readonly initial: (key: FanKey) => V;
  private readonly changed: ((next: S, previous: S | undefined) => Iterable<FanKey> | undefined) | undefined;
  private readonly label: string | undefined;
  private upstream: Subscription | null = null;
  private snapshot: S | undefined;
  private hasSnapshot = false;
  private closed = false;

  constructor(
    private readonly source: Observable<S>,
    private readonly read: (snapshot: S, key: FanKey) => V,
    options: FanOutOptions<S, V>
  ) {
    this.equal = equalityOf(options.equal ?? 'structural');
    const initial = options.initial;
    this.initial = typeof initial === 'function' ? (initial as (key: FanKey) => V) : () => initial;
    this.changed = options.changed;
    this.label = options.label;
  }

  /** How many keys are live. */
  get size(): number {
    return this.cells.size;
  }

  /**
   * The cell for one key, made on first ask and the same object after.
   *
   * The identity is the contract: a surface that memoises its elements
   * by key binds this once and is never re-bound, which is the reason
   * the registry hands out cells rather than values.
   */
  for(key: FanKey): FanCell<V> {
    const existing = this.cells.get(key);
    if (existing !== undefined) {
      return existing;
    }
    if (this.closed) {
      throw new Error(
        `fanOut(${this.label ?? 'anonymous'}) was asked for '${String(key)}' after it was closed. A closed ` +
          'registry has let go of its source and cannot answer.'
      );
    }
    // Taking the first key is what starts the subscription, so a
    // registry made in a component body costs nothing until something
    // is on screen. `subscribe` may emit synchronously, and the cell
    // is not in the map yet — so it is read directly here and the
    // walk below skips it.
    this.attach();
    const first = this.hasSnapshot ? this.read(this.snapshot as S, key) : this.initial(key);
    const cell = new FanCell(first, key, this.label);
    this.cells.set(key, cell);
    return cell;
  }

  /** The cell for a key if it is live, without making one. */
  peek(key: FanKey): FanCell<V> | undefined {
    return this.cells.get(key);
  }

  /**
   * Drops a key.
   *
   * The cell completes, so anything still bound to it is torn down
   * rather than left holding a value that has stopped being updated.
   * Letting go of the last key lets go of the source.
   */
  release(key: FanKey): void {
    const cell = this.cells.get(key);
    if (cell === undefined) {
      return;
    }
    this.cells.delete(key);
    cell.subject.complete();
    if (this.cells.size === 0) {
      this.detach();
    }
  }

  /** Drops every key, keeping the registry usable. */
  releaseAll(): void {
    for (const cell of this.cells.values()) {
      cell.subject.complete();
    }
    this.cells.clear();
    this.detach();
  }

  /** Drops every key and the source for good. */
  close(): void {
    this.releaseAll();
    this.closed = true;
  }

  /**
   * Pushes the latest source value into the keys that changed.
   *
   * Called for each emission, and callable by hand when the source has
   * not emitted but the *reading* has changed — a selection moving
   * over a grid whose values are the same is exactly that case, and it
   * is why the reader takes a key rather than the registry taking a
   * projection.
   */
  refresh(keys?: Iterable<FanKey>): void {
    if (!this.hasSnapshot) {
      return;
    }
    const snapshot = this.snapshot as S;
    for (const key of keys ?? this.cells.keys()) {
      const cell = this.cells.get(key);
      if (cell === undefined) {
        continue;
      }
      const next = this.read(snapshot, key);
      if (!this.equal(cell.subject.value, next)) {
        cell.subject.next(next);
      }
    }
  }

  private attach(): void {
    if (this.upstream !== null) {
      return;
    }
    this.upstream = this.source.subscribe(snapshot => {
      const previous = this.hasSnapshot ? (this.snapshot as S) : undefined;
      // `changed` is asked before the snapshot moves, so it can compare
      // the two, and its answer is used after — a source that returns a
      // view onto its own delta must not have it read out from under it.
      const keys = this.changed?.(snapshot, previous);
      this.snapshot = snapshot;
      this.hasSnapshot = true;
      this.refresh(keys);
    });
  }

  private detach(): void {
    this.upstream?.unsubscribe();
    this.upstream = null;
    this.hasSnapshot = false;
    this.snapshot = undefined;
  }
}
