import type { ShellService, ShellStorageResult } from '../app/ShellService';
import type { StorageAdapter, StorageOutcome, StorageRead } from './StorageAdapter';

export interface ShellStorageOptions {
  /**
   * What every key is written under, so an application's records are
   * recognisable in devtools and cannot collide with another script's
   * on the same origin. Default `'gesso:'`.
   *
   * Applied on this side rather than on the shell's, because the shell
   * is asked to store a key and nothing more; deciding what the key
   * means is the application's work and belongs on the thread doing
   * the application's work.
   */
  readonly prefix?: string;
}

/**
 * `localStorage`, reached through the shell.
 *
 * The odd one of the three, and worth saying why it exists. It is
 * synchronous on the window and unreachable from a worker, so a render
 * thread asking for it pays a round trip; it holds a few megabytes at
 * most; and writing to it blocks the main thread, which is the thread
 * the framework works hardest to leave alone. None of that makes it a
 * good place for an application's state, and all of it is beside the
 * point for the thing it is actually good for: a small preference that
 * something outside the application also reads, or that has to be
 * there before the first frame of the *next* visit rather than the
 * next frame of this one.
 *
 * Use `OpfsStorage` or `IndexedDbStorage` for anything else.
 *
 * What happens on each failure:
 *
 * - **No shell** (a headless runtime, a spec): `denied`, at once.
 * - **The browser blocks `localStorage`**, which it does in some
 *   private windows and under some site settings: `denied`. Reading
 *   `window.localStorage` is what throws, so the failure arrives on
 *   the first call rather than at start-up.
 * - **The quota is spent**: `full`. `localStorage` has the smallest
 *   quota of the three and reaches it soonest, which is the other
 *   reason not to keep an application's state here.
 * - **Anything else**: `failed`, with the message the shell reported.
 *
 * Every answer crosses the barrier as plain data: a string, a list of
 * strings, and one of four words.
 */
export class ShellStorage implements StorageAdapter {
  private readonly prefix: string;

  constructor(
    private readonly shell: ShellService,
    options: ShellStorageOptions = {}
  ) {
    this.prefix = options.prefix ?? 'gesso:';
  }

  async read(key: string): Promise<StorageRead> {
    const result = await this.ask('read', key);
    return { outcome: result.outcome, value: result.value, error: result.error };
  }

  async write(key: string, value: string): Promise<StorageOutcome> {
    return (await this.ask('write', key, value)).outcome;
  }

  async remove(key: string): Promise<StorageOutcome> {
    return (await this.ask('remove', key)).outcome;
  }

  async keys(): Promise<readonly string[]> {
    // The prefix is this store's namespace, so the keys it reports are
    // its own with the namespace taken back off. A listing that
    // included every other script's key would be a listing an
    // application could not act on.
    const result = await this.ask('keys', '');
    return result.keys.filter(key => key.startsWith(this.prefix)).map(key => key.slice(this.prefix.length));
  }

  private ask(op: 'read' | 'write' | 'remove' | 'keys', key: string, value?: string): Promise<ShellStorageResult> {
    return this.shell.requestStorage({
      op,
      key: op === 'keys' ? '' : `${this.prefix}${key}`,
      ...(value === undefined ? {} : { value })
    });
  }
}
