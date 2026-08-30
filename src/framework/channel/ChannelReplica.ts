import { InputCell } from '../Input';
import { applyPatches, type Patch } from '../store/StorePatch';
import { isChannelHostMessage, type ChannelClientMessage, type ChannelPort } from './ChannelProtocol';
import { viewKeys, type ChannelToken } from './ChannelToken';
import { isPortErrorMessage } from '../worker/WorkerPorts';

/**
 * The render thread's end of a channel.
 *
 * It runs none of the application's logic. It holds the latest value
 * of each view key and forwards commands, and that asymmetry is the
 * point — the work stays on the thread that owns the data.
 *
 * Every key is an `InputCell`: a component reads it, binds it, and
 * cannot write it, which is the same contract a prop has. Whether a
 * value arrived from a parent or from across the barrier makes no
 * difference to the component that reads it, so it is not worth a
 * second name.
 */
export class ChannelReplica<View extends object, Commands extends object> {
  private readonly cells = new Map<string, InputCell<unknown>>();
  private readonly commandProxy: Commands;
  private errorListener: ((message: string, stack?: string) => void) | null = null;
  private pending: Patch[] | null = null;
  private scheduleFlush: (() => void) | null = null;

  constructor(
    private readonly token: ChannelToken<View, Commands>,
    private readonly port: ChannelPort
  ) {
    for (const key of viewKeys(token)) {
      // Seeded from the token, so nothing ever observes `undefined`
      // for a declared key. The provider starts from the same value,
      // so an application already in its initial state sends nothing.
      this.cells.set(key, new InputCell((token.initial as Record<string, unknown>)[key]));
    }
    this.commandProxy = this.createCommandProxy();
    this.port.onmessage = event => this.receive(event.data);
    // Asking rather than waiting to be pushed to keeps the two ends
    // independent of which finished starting up first.
    this.post({ type: 'channel:sync' });
  }

  /** The view keys, each an `InputCell` to read or bind. */
  get view(): { readonly [K in keyof View]: InputCell<View[K]> } {
    return this.viewProxy as { readonly [K in keyof View]: InputCell<View[K]> };
  }

  /**
   * The channel's commands, typed as declared.
   *
   * Fire and forget: the effect comes back as a patch, never a return
   * value. There is no synchronous answer across a thread, and
   * pretending otherwise would invite code that cannot work.
   */
  get send(): Commands {
    return this.commandProxy;
  }

  private readonly viewProxy = new Proxy({} as Record<string, InputCell<unknown>>, {
    get: (_target, property): unknown => {
      if (typeof property !== 'string') {
        return undefined;
      }
      const cell = this.cells.get(property);
      if (cell === undefined) {
        const names = [...this.cells.keys()].sort().join(', ');
        throw new Error(
          `'${property}' is not a view key on channel '${this.token.name}'. ` +
            `Declared keys: ${names.length > 0 ? names : '(none)'}.`
        );
      }
      return cell;
    }
  });

  private createCommandProxy(): Commands {
    return new Proxy({} as Commands, {
      get: (_target, property): unknown => {
        if (typeof property !== 'string') {
          return undefined;
        }
        return (payload?: unknown) => {
          this.post({ type: 'channel:command', command: property, payload });
        };
      }
    }) as Commands;
  }

  /** Receives errors reported by the thread that owns the channel. */
  onError(listener: ((message: string, stack?: string) => void) | null): void {
    this.errorListener = listener;
  }

  private receive(data: unknown): void {
    if (isPortErrorMessage(data)) {
      // Nothing on the other thread serves this channel's name.
      // Reported like any other channel error, because from here it is
      // one: no patch will ever arrive.
      this.report(data.message);
      return;
    }
    if (!isChannelHostMessage(data)) {
      return;
    }
    if (data.type === 'channel:error') {
      this.report(data.message, data.stack);
      return;
    }
    if (this.pending === null) {
      this.applyPatches(data.patches);
      return;
    }
    this.pending.push(...data.patches);
    this.scheduleFlush?.();
  }

  private report(message: string, stack?: string): void {
    const listener =
      this.errorListener ?? ((text, trace) => console.error(`[nodal channel ${this.token.name}] ${text}`, trace));
    listener(message, stack);
  }

  /**
   * Defers patch application to the next frame.
   *
   * A chatty application thread can deliver many patches between two
   * frames. Applied on arrival each one pushes a value through the
   * bindings watching it, rebuilding a subtree once per patch when
   * only the last state is ever drawn. Queued, a burst costs one pass.
   */
  deferPatches(scheduleFlush: () => void): void {
    this.scheduleFlush = scheduleFlush;
    this.pending = [];
  }

  get hasPendingPatches(): boolean {
    return this.pending !== null && this.pending.length > 0;
  }

  flush(): void {
    if (this.pending === null || this.pending.length === 0) {
      return;
    }
    const batch = this.pending;
    this.pending = [];
    this.applyPatches(batch);
  }

  /**
   * Applies a batch, emitting once per affected key.
   *
   * Grouping matters: a batch touching one key three times must not
   * push three values through the bindings watching it.
   */
  applyPatches(patches: readonly Patch[]): void {
    const byKey = new Map<string, Patch[]>();
    for (const patch of patches) {
      const existing = byKey.get(patch.projection);
      if (existing === undefined) {
        byKey.set(patch.projection, [patch]);
      } else {
        existing.push(patch);
      }
    }
    for (const [key, group] of byKey) {
      const cell = this.cells.get(key);
      if (cell === undefined) {
        // A key this build does not know about. Ignoring it lets a
        // newer application thread talk to an older view.
        continue;
      }
      cell.next(applyPatches(cell.value, group));
    }
  }

  private post(message: ChannelClientMessage): void {
    this.port.postMessage(message);
  }

  dispose(): void {
    this.port.onmessage = null;
  }
}
