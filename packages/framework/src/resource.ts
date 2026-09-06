import { Subscription, type Observable } from 'rxjs';

import type { ComputedCell } from './computed';
import type { ReadableCell } from './Input';
import { internalState, type InternalState } from './InternalState';
import { select } from './select';

/**
 * What a request has come to, in the five words every screen needs.
 *
 * Chosen once so screens stop inventing them. The tree had three
 * enums saying nearly the same thing in different words
 * (`'loading' | 'ready' | 'empty' | 'failed'`,
 * `'idle' | 'loading' | 'ready' | 'missing' | 'failed'`,
 * `'idle' | 'searching' | 'done' | 'failed'`), which meant a screen
 * reading two of them had two vocabularies for one idea.
 *
 * - `idle`: nothing has been asked for. The key is `null`.
 * - `loading`: a request is out and there is nothing to show yet.
 * - `ready`: there is a value. A refresh may still be in the air, and
 *   that is deliberately not a separate status: what is on screen is
 *   real, and saying "loading" over it would be a lie.
 * - `missing`: the answer was that there is no such thing. A fetch
 *   says so by resolving `null`.
 * - `failed`: the request could not be answered at all.
 *
 * `missing` and `failed` are reported only when there is nothing to
 * fall back on. A refresh that fails over a value already held leaves
 * it on screen and stays `ready`, because a stale answer is stale and
 * not wrong, and an empty page would be worse. The error is still
 * there to read.
 *
 * What is *not* here is `empty`. A list that loaded and has no rows is
 * `ready` with an empty array, which is a judgement about the value
 * rather than about the request, and the screen that cares makes it.
 */
export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'failed';

/**
 * A resource as one record, so it can be a channel view key.
 *
 * Plain data throughout: the error is its message rather than the
 * `Error`, because a message is what a screen shows and what survives
 * the barrier, and an `Error` is neither.
 */
export interface ResourceState<T> {
  readonly status: ResourceStatus;
  readonly value: T | null;
  readonly error: string | null;
}

export interface ResourceOptions<K, T> {
  /**
   * What is already known for this key, shown at once while the
   * request runs behind it.
   *
   * This is the store-first rule in one function: a hit is on screen
   * synchronously and marked `ready` even though a request is on its
   * way, so a page opened twice is instant the second time and correct
   * a moment later. Answering `null` or `undefined` means nothing is
   * held, and the resource says `loading`.
   */
  readonly peek?: (key: K) => T | null | undefined;
  /** What to call this resource in a warning; optional. */
  readonly label?: string;
}

/**
 * A request, keyed, so a stale answer cannot win.
 *
 * The key says what to fetch, and every value the key source emits is
 * a request. An answer is published only if its request is still the
 * current one, which is the generation counter every screen that loads
 * anything was writing by hand, and the reason opening a page, going
 * back and opening another before the first answers does not end with
 * the first answer on screen.
 *
 *   private readonly ref = internalState<PageRef | null>(null);
 *   readonly page = resource(this.ref, ref => api.trackPage(ref));
 *
 *   show(ref: PageRef | null): Promise<void> {
 *     this.ref.value = ref;
 *     return this.page.settled;
 *   }
 *
 * A `null` key is "nothing is being asked for": the status is `idle`,
 * the value is `null`, and no fetch runs. That is what a screen showing
 * nothing yet actually means, and it saves every caller a branch.
 *
 * Unlike `computed`, a resource is eager: it follows its key from the
 * moment it is made, because a request is an effect and an effect that
 * waits for a subscriber is a request that never happens. It takes one
 * subscription to the key source for its whole life, however many
 * requests run through it, and `dispose()` gives that back.
 *
 * It is a helper and not a data layer. Nothing in the framework
 * requires one, a channel is reached exactly as it was, and an
 * application that would rather write its own is writing against the
 * same barrier this is written against.
 */
export class Resource<K, T> {
  /** The one cell everything else here is a projection of. */
  private readonly cell: InternalState<ResourceState<T>>;
  /** Bumped per request; an answer from an older one is dropped. */
  private requests = 0;
  private asked: K | null = null;
  private settling: Promise<void> = Promise.resolve();
  private readonly following: Subscription;

  /** Status, value and error as one record: what a channel view key takes. */
  readonly state: ReadableCell<ResourceState<T>>;
  readonly status: ComputedCell<ResourceStatus>;
  /** What is loaded, or `null` while there is nothing to show. */
  readonly value: ComputedCell<T | null>;
  /** Why the last request failed, as its message; `null` when it did not. */
  readonly error: ComputedCell<string | null>;

  constructor(
    key: Observable<K | null | undefined>,
    private readonly fetch: (key: K) => Promise<T | null>,
    private readonly options: ResourceOptions<K, T> = {}
  ) {
    this.cell = internalState<ResourceState<T>>({ status: 'idle', value: null, error: null }, options.label);
    this.state = this.cell;
    this.status = select(this.cell, 'status', named(options.label, 'status'));
    // Compared by identity rather than structurally: a fetch builds a
    // new value every time, and walking a page-sized object to
    // discover that is exactly the cost the differ already pays once.
    this.value = select(this.cell, 'value', { ...named(options.label, 'value'), equal: 'reference' });
    this.error = select(this.cell, 'error', named(options.label, 'error'));
    this.following = key.subscribe(next => this.request(next ?? null));
  }

  /** What is being asked for, for a caller that needs to guard on it. */
  get requested(): K | null {
    return this.asked;
  }

  /**
   * The request in the air, as a promise that resolves when it settles.
   *
   * Already resolved when nothing is in flight, so a caller that sets
   * the key and returns this reads as an ordinary async method. Each
   * request keeps its own promise, so a dropped one still resolves for
   * whoever is awaiting it; it simply changes nothing on the way.
   */
  get settled(): Promise<void> {
    return this.settling;
  }

  /**
   * Asks again for the same key, keeping what is on screen.
   *
   * This is the retry button. It does not clear the value the way a
   * new key does, because a person pressing retry is asking for the
   * thing they can already see to be brought up to date, and blanking
   * it first would be a worse answer than the stale one.
   */
  retry(): Promise<void> {
    if (this.asked === null) {
      return this.settling;
    }
    const generation = ++this.requests;
    const held = this.cell.value;
    if (held.value === null && held.status !== 'loading') {
      this.write({ status: 'loading', value: null, error: null });
    }
    this.settling = this.run(this.asked, generation);
    return this.settling;
  }

  /**
   * Replaces what is loaded, for a change made here rather than
   * fetched.
   *
   * A page of comments appended to the answer already held, an
   * optimistic edit: the resource holds the value, so something has to
   * be able to write it. It does not touch the request in flight, so a
   * refresh that lands afterwards still wins, which is what it should
   * do: it is the newer truth.
   */
  set(value: T): void {
    this.write({ status: 'ready', value, error: null });
  }

  /** Gives back the subscription to the key source. */
  dispose(): void {
    this.following.unsubscribe();
  }

  private request(key: K | null): void {
    this.asked = key;
    const generation = ++this.requests;
    if (key === null) {
      this.write({ status: 'idle', value: null, error: null });
      this.settling = Promise.resolve();
      return;
    }
    const held = this.options.peek?.(key) ?? null;
    this.write({ status: held === null ? 'loading' : 'ready', value: held, error: null });
    this.settling = this.run(key, generation);
  }

  private run(key: K, generation: number): Promise<void> {
    return this.fetch(key).then(
      answer => this.answered(generation, answer),
      (error: unknown) => this.refused(generation, error)
    );
  }

  private answered(generation: number, answer: T | null): void {
    if (generation !== this.requests) {
      return;
    }
    if (answer === null) {
      const held = this.cell.value.value;
      this.write({ status: held === null ? 'missing' : 'ready', value: held, error: null });
      return;
    }
    this.write({ status: 'ready', value: answer, error: null });
  }

  private refused(generation: number, error: unknown): void {
    if (generation !== this.requests) {
      return;
    }
    const held = this.cell.value.value;
    this.write({ status: held === null ? 'failed' : 'ready', value: held, error: messageOf(error) });
  }

  private write(next: ResourceState<T>): void {
    this.cell.value = next;
  }
}

/**
 * A keyed request with a status, a value, an error and a retry.
 *
 *   const page = resource(ref, key => api.page(key), { peek: key => store.get(key) });
 *   <Show when={computed(() => page.status.value === 'loading')}>{() => <Spinner />}</Show>
 *
 * See `Resource` for what each status means and when a stale value is
 * kept. The key is an Observable so that setting a cell is what asks
 * for something: `computed` and `internalState` both work, and so does
 * a channel view key or a router match.
 */
export function resource<K, T>(
  key: Observable<K | null | undefined>,
  fetch: (key: K) => Promise<T | null>,
  options: ResourceOptions<K, T> = {}
): Resource<K, T> {
  return new Resource(key, fetch, options);
}

function named(base: string | undefined, part: string): { label?: string } {
  return base === undefined ? {} : { label: `${base}.${part}` };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
