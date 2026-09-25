import { BehaviorSubject, Observable, Subscription } from 'rxjs';

import { equalityOf, type Equality } from './derive';
import { trackRead, type ReadableCell } from './Input';

/**
 * How many live keys with nothing ever released counts as a mistake.
 *
 * Generous: a grid's first window is hundreds of cells before a scroll
 * retires any of them, and a warning that fired there would be noise.
 */
const GROWING_WITHOUT_RELEASE = 2048;

/** What a key is. A cell in a grid names itself `${row}:${column}`. */
export type FanKey = string | number;

/**
 * What a key stands for, carried beside it.
 *
 * A key has to be a string or a number, because the registry looks one
 * up in a `Map` and identity is the wrong test for `${row}:${column}`.
 * That leaves a reader with a compound key parsing it back out on
 * every read, which is precisely what a grid cannot afford: gessosheet
 * keeps a cell's row and column beside its subjects for exactly this
 * reason, and its comment says so — "parsing them back out of the key
 * was the only reason the key had a shape".
 *
 * So the caller hands `for` whatever the key means, the registry
 * remembers it, and the reader is given it. `undefined` for a caller
 * whose key is already the whole answer.
 */

export interface FanOutOptions<S, V, D> {
  /**
   * What a key's cell holds before the source has said anything.
   *
   * Required, and not `undefined` by default, because the surfaces
   * this exists for mount their cells before the first patch arrives:
   * a grid that fills in as the window is served needs "a cell waiting"
   * to be a value it can draw rather than a hole. A function is given
   * the key, for a default that varies by position.
   */
  readonly initial: V | ((key: FanKey, datum: D) => V);
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
   * How one key's new value is judged unchanged; `reference` by
   * default.
   *
   * The opposite default to `select` and `derive`, and the reason is
   * what this is for. Those project one value and run once per
   * emission, so comparing by content is cheap and usually right.
   * This runs the comparison once per live key per emission, on a
   * surface with thousands of them, which is the cost the registry
   * exists to remove — measured at 1.9 ms against 0.8 ms for ten
   * thousand keys on a source that republishes the lot, which is what
   * a scroll does.
   *
   * Pass `structural` when the reader *builds* a value rather than
   * passing one through: a projection that returns a fresh array or
   * object of the same shape is not a change, and a reference test
   * would push one to every cell on every emission. A reader that can
   * hand back the same object for an unchanged key — the sentinel
   * trick, one `EMPTY` for every cell with nothing in it — keeps the
   * cheap test and gets the right answer.
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
export class FanCell<V, D = unknown> extends Observable<V> implements ReadableCell<V> {
  /** @internal */
  readonly subject: BehaviorSubject<V>;

  constructor(
    initial: V,
    readonly key: FanKey,
    readonly datum: D,
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
export function fanOut<S, V, D = undefined>(
  source: Observable<S>,
  read: (snapshot: S, key: FanKey, datum: D) => V,
  options: FanOutOptions<S, V, D>
): FanOut<S, V, D> {
  return new FanOut(source, read, options);
}

/** What `fanOut` returns. See there. */
export class FanOut<S, V, D = undefined> {
  private readonly cells = new Map<FanKey, FanCell<V, D>>();
  private readonly equal: (a: V, b: V) => boolean;
  private readonly initial: (key: FanKey, datum: D) => V;
  private readonly changed: ((next: S, previous: S | undefined) => Iterable<FanKey> | undefined) | undefined;
  private readonly label: string | undefined;
  /**
   * How many keys have ever been let go.
   *
   * The leak signature is not "this registry is big" — a grid holds
   * ten thousand cells and is right to. It is "this registry has never
   * let go of anything", which is what forgetting `release` looks like
   * from in here, and what a registry that mounts and unmounts
   * correctly can never look like once it has scrolled once.
   */
  private releases = 0;
  private warnedGrowing = false;
  private upstream: Subscription | null = null;
  private snapshot: S | undefined;
  private hasSnapshot = false;
  private closed = false;

  constructor(
    private readonly source: Observable<S>,
    private readonly read: (snapshot: S, key: FanKey, datum: D) => V,
    options: FanOutOptions<S, V, D>
  ) {
    this.equal = equalityOf(options.equal ?? 'reference');
    const initial = options.initial;
    this.initial = typeof initial === 'function' ? (initial as (key: FanKey, datum: D) => V) : () => initial;
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
  for(key: FanKey, datum: D = undefined as D): FanCell<V, D> {
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
    const first = this.hasSnapshot ? this.read(this.snapshot as S, key, datum) : this.initial(key, datum);
    const cell = new FanCell(first, key, datum, this.label);
    this.cells.set(key, cell);
    this.warnIfOnlyGrowing();
    return cell;
  }

  /** The cell for a key if it is live, without making one. */
  peek(key: FanKey): FanCell<V, D> | undefined {
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
    this.releases++;
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
    this.releases += this.cells.size;
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
      const next = this.read(snapshot, key, cell.datum);
      if (!this.equal(cell.subject.value, next)) {
        cell.subject.next(next);
      }
    }
  }

  /**
   * Says so, once, when a registry has grown large and released
   * nothing.
   *
   * A registry is a resource and `release` is the caller's, which is
   * the one thing about this that can be got wrong silently: a key
   * that is never released keeps its cell, its entry and its place in
   * every walk, for the life of the registry. There is no upper bound
   * to hit and nothing to see, which is exactly the kind of leak that
   * is found six months later by someone else.
   *
   * The threshold is generous on purpose. A grid mounting its first
   * window legitimately takes hundreds of keys before it has scrolled
   * far enough to retire one, and a warning that fired there would be
   * noise people learn to scroll past.
   */
  private warnIfOnlyGrowing(): void {
    if (this.warnedGrowing || this.releases > 0 || this.cells.size < GROWING_WITHOUT_RELEASE) {
      return;
    }
    this.warnedGrowing = true;
    console.warn(
      `fanOut(${this.label ?? 'anonymous'}) holds ${this.cells.size} keys and has released none. A registry ` +
        'keeps a key until `release`, so a surface that mounts and unmounts has to say when a key has gone: ' +
        '`release(key)` as it leaves, `releaseAll()` when the screen does, `close()` when the registry does. ' +
        'Ignore this if the keys really do all live as long as the registry.'
    );
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
