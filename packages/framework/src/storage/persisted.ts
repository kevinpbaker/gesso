import { of, skip, type Subscription } from 'rxjs';

import { debounced } from '../debounce';
import type { ReadableCell } from '../Input';
import { internalState, type InternalState } from '../InternalState';
import { resource, type Resource, type ResourceStatus } from '../resource';
import type { StorageAdapter } from './StorageAdapter';

export interface PersistedOptions<T> {
  /**
   * What the value is before anything has been read, and what it goes
   * back to when nothing was stored.
   *
   * Required, and that is the whole answer to the race between
   * hydration and the first frame: a screen reading this on the frame
   * it mounts gets the default, with `status` saying `loading`, and
   * gets the remembered value a moment later if there was one. There
   * is no fourth state to draw and no null to guard against.
   */
  readonly initial: T;
  /**
   * Reads a record back, refusing one this version does not
   * understand.
   *
   * Answer `null` and the record is treated as not being there, which
   * is what a record written by an older build should be: the cost is
   * one default, and the alternative is state holding `undefined`
   * where a field belongs. `Tokens.isStoredTokens` in Segue is the
   * same check written by hand.
   *
   * Without one the parsed JSON is trusted as-is, which is fine while
   * the shape has only ever had one version and is not fine
   * afterwards.
   */
  readonly revive?: (raw: unknown) => T | null;
  /**
   * How long a change waits for the next one before being written, in
   * milliseconds. Default 250.
   *
   * A `debounced` cell rather than a timer of its own, so this is the
   * same gate a search field uses. It is what makes a value changed
   * sixty times a second cost one write rather than sixty: see
   * `persisted.budget.spec.ts`, which asserts exactly that.
   */
  readonly settle?: number;
  /** What to call this in a devtools reading; optional. */
  readonly label?: string;
}

const MESSAGES: Readonly<Record<string, string>> = {
  denied: 'This browser will not let the application store anything.',
  full: 'There is no room left to store this.',
  failed: 'The store could not be written to.'
};

/**
 * A value that survives the application being closed.
 *
 * Hydration is a `resource`, which is not a detail: reading from a
 * disk is a keyed request that can be slow, can answer "there is
 * nothing", and can fail, which is the same set of outcomes a request
 * over the network has. So the statuses here are `ResourceStatus`
 * itself rather than a fourth enum saying the same five things in
 * different words.
 *
 *   readonly draft = persisted(new OpfsStorage(), 'draft', { initial: '' });
 *
 *   // on a screen
 *   <TextInput value={draft.value} onChange={text => draft.set(text)} />
 *
 * ## What a screen sees before hydration finishes
 *
 * The default, and `status` reading `loading`. Nothing waits, nothing
 * is null, and no screen has a shape it only has for the first eighty
 * milliseconds. When the read lands the value changes like any other
 * cell change, and a screen that wants to say "restoring" reads
 * `status`.
 *
 * The one race that needs a rule is a person changing the value before
 * the disk has answered, which is not rare: a queue is a press away
 * and OPFS is a round trip away. **What they did wins.** A hydration
 * answer is applied only if nothing has been `set` since, on the same
 * reasoning as `mutate`'s guarded rollback: an answer that was
 * overtaken is stale, and putting it on screen would undo something
 * the person just did.
 *
 * ## What happens when storing fails
 *
 * - `denied`: nothing is written this session and nothing is tried
 *   again, because the answer will not change. `status` is `failed`
 *   and `saveError` says so once rather than on every keystroke.
 * - `full`: the write failed and the value in memory is kept. Nothing
 *   is rolled back: the change is real and only the remembering of it
 *   failed. The next change is still attempted, because a quota can be
 *   given back.
 * - `failed`: the same as `full`, and for the same reason.
 * - A record that parses but is not the shape `revive` accepts is
 *   treated as `missing`: the application starts from its default
 *   rather than showing an error about a file the person cannot see.
 *
 * ## It is a helper
 *
 * Nothing in the framework holds one, and nothing is reachable only
 * through it. A channel is served from plain Observables as it always
 * was, and an application that would rather read and write a store
 * itself is writing against the same `StorageAdapter` this is written
 * against. The thread model declined to own an application's data
 * architecture, and remembering a value is not the exception to that.
 */
export class PersistedState<T> {
  private readonly held: InternalState<T>;
  private readonly saves: InternalState<number>;
  private readonly failure: InternalState<string | null>;
  private readonly record: Resource<string, T>;
  private readonly writing: Subscription;
  /** True once the application has written a value of its own. */
  private touched = false;
  /** Set when the store said `denied`, which is permanent for the session. */
  private refused = false;
  /** The text last known to be on disk, so hydration does not write itself back. */
  private stored: string | null = null;
  /** What `forget` goes back to. */
  private readonly initial: T;

  /** Where the first read got to; the same five words `resource` uses. */
  readonly status: ReadableCell<ResourceStatus>;
  /** Why the read did not answer, as a message; null when it did. */
  readonly error: ReadableCell<string | null>;
  /** What is remembered: the default until the read lands. */
  readonly value: ReadableCell<T>;
  /** Writes in the air, for a saving indicator. A count, as `mutate.pending` is. */
  readonly saving: ReadableCell<number>;
  /** Why the last write did not happen, as a message; null when it did. */
  readonly saveError: ReadableCell<string | null>;
  /** Resolves when the first read has settled, whatever it found. */
  readonly hydrated: Promise<void>;

  constructor(
    private readonly adapter: StorageAdapter,
    private readonly key: string,
    options: PersistedOptions<T>
  ) {
    const label = options.label;
    this.initial = options.initial;
    this.held = internalState<T>(options.initial, label);
    this.saves = internalState(0, label === undefined ? undefined : `${label}.saving`);
    this.failure = internalState<string | null>(null, label === undefined ? undefined : `${label}.saveError`);
    this.value = this.held;
    this.saving = this.saves;
    this.saveError = this.failure;
    // A constant key, because the record being read is named once. The
    // resource is eager, so constructing this is what starts the read,
    // which is what "hydration on start" means: nothing has to
    // remember to call a `load()`.
    this.record = resource(
      of(key),
      () => this.load(options.revive),
      label === undefined ? {} : { label: `${label}.hydration` }
    );
    this.status = this.record.status;
    this.error = this.record.error;
    this.hydrated = this.record.settled.then(() => this.apply());
    this.writing = debounced(this.held, options.settle ?? 250)
      // The gate hands a new follower the value the cell already has,
      // which here is the default nobody asked to be written. Only
      // what comes after it is a change.
      .pipe(skip(1))
      .subscribe(value => void this.flush(value));
  }

  /** What is remembered right now, for code that is not subscribing. */
  get current(): T {
    return this.held.value;
  }

  /** Remembers a new value. The write follows once the changes stop. */
  set(value: T): void {
    this.touched = true;
    this.held.value = value;
  }

  /**
   * Writes what is held now, without waiting for the gate.
   *
   * For the moment an application knows it is about to lose the thread:
   * a `visibilitychange`, a route away from an editor, a sign-out.
   */
  save(): Promise<void> {
    return this.flush(this.held.value);
  }

  /**
   * Forgets the record and goes back to the default.
   *
   * Both halves, because a stored value removed while the cell still
   * holds it would be written straight back by the next change.
   */
  async forget(): Promise<void> {
    this.stored = null;
    this.touched = true;
    this.held.value = this.initial;
    await this.adapter.remove(this.key);
  }

  /** Gives back the write subscription and the resource's. */
  dispose(): void {
    this.writing.unsubscribe();
    this.record.dispose();
  }

  private async load(revive: ((raw: unknown) => T | null) | undefined): Promise<T | null> {
    const read = await this.adapter.read(this.key);
    if (read.outcome !== 'ok') {
      if (read.outcome === 'denied') {
        this.refused = true;
      }
      throw new Error(read.error ?? MESSAGES[read.outcome] ?? 'The store could not be read.');
    }
    if (read.value === null) {
      return null;
    }
    this.stored = read.value;
    let parsed: unknown;
    try {
      parsed = JSON.parse(read.value);
    } catch {
      // Half-written, or written by something else entirely. Treated
      // as nothing stored rather than as a failure: there is nothing a
      // person can do about it and a default is a working application.
      return null;
    }
    return revive === undefined ? (parsed as T) : revive(parsed);
  }

  private apply(): void {
    const found = this.record.value.value;
    if (found === null || this.touched) {
      // Nothing stored, or the person got there first. Theirs is the
      // newer truth and it stays.
      return;
    }
    this.held.value = found;
  }

  private async flush(value: T): Promise<void> {
    if (this.refused) {
      return;
    }
    let text: string;
    try {
      text = JSON.stringify(value);
    } catch (error) {
      this.failure.value = error instanceof Error ? error.message : String(error);
      return;
    }
    if (text === this.stored) {
      // Hydration writing what it just read, or a change that came
      // back round to where it started. Either way there is nothing
      // to say to the disk.
      return;
    }
    this.saves.value = this.saves.value + 1;
    try {
      const outcome = await this.adapter.write(this.key, text);
      if (outcome === 'ok') {
        this.stored = text;
        this.failure.value = null;
        return;
      }
      if (outcome === 'denied') {
        this.refused = true;
      }
      this.failure.value = MESSAGES[outcome] ?? 'The store could not be written to.';
    } finally {
      this.saves.value = Math.max(0, this.saves.value - 1);
    }
  }
}

/**
 * A value read from a store on start and written back as it changes.
 *
 *   const settings = persisted(new IndexedDbStorage(), 'settings', {
 *     initial: DEFAULTS,
 *     revive: raw => (isSettings(raw) ? raw : null)
 *   });
 *
 * See `PersistedState` for what a screen sees before the read lands
 * and what each kind of storage failure does.
 */
export function persisted<T>(adapter: StorageAdapter, key: string, options: PersistedOptions<T>): PersistedState<T> {
  return new PersistedState(adapter, key, options);
}
