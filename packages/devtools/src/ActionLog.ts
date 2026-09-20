import {
  applyPatch,
  isChannelClientMessage,
  isChannelHostMessage,
  markInstant,
  type ActionCause,
  type ActionEntry,
  type ChannelErrorEntry,
  type ChannelPort,
  type CommandEntry,
  type FrameEntry,
  type Patch,
  type PatchEntry,
  type WorkerHandle
} from '@gesso/framework';

/**
 * The entries are declared with the rest of the devtools vocabulary in
 * `@gesso/framework`, for the reason `ConsoleEntry` is: they are plain
 * data that crosses a thread to reach a panel, and in the worker
 * configuration they cross on the framework's own devtools channel.
 * They are re-exported here because this is where a reader looks for
 * them.
 */
export type { ActionCause, ActionEntry, ChannelErrorEntry, CommandEntry, FrameEntry, PatchEntry };

/**
 * The store action log: every command a view sent
 * across the barrier, every patch that came back, on one timeline,
 * with the view rewindable to any point on it.
 *
 * The seam is the port. A channel is two message types over a
 * `ChannelPort`, so a recorder that sits in the middle of one sees
 * both directions at their only crossing, needs nothing from the
 * framework beyond the two type guards the protocol already exports,
 * and can put a patch back on the wire, which is what makes time
 * travel a replay rather than a second write path into the replica.
 *
 * Nothing here touches the DOM. That is deliberate: the tap belongs
 * wherever the ports already are, which in the worker configuration is
 * the render worker, and a recorder that imported a document could not
 * go there. `ActionLogPanel` is the half that draws.
 *
 * **What time travel does.** It rewrites what the *view* holds. The
 * authoritative state lives on the other thread and is not rewound,
 * cannot be rewound from here, and does not know this happened. While
 * the log is pinned to a step, patches still arriving are recorded and
 * held rather than delivered, so the view stays where it was put;
 * going live delivers the state the application actually reached. A
 * command sent from the view while pinned is forwarded like any other,
 * because the application is still running and pretending otherwise
 * would be a lie about a button that visibly did something.
 */
export interface ActionLog {
  /**
   * Wraps a worker handle so every channel opened on it is recorded.
   *
   * `tokens` is read for one thing: the value both ends of a channel
   * start from. The first patch a provider sends is a diff against the
   * token's initial, so a recorder that started from nothing would
   * reconstruct an early step out of a patch whose base it never had.
   */
  tap(handle: WorkerHandle, tokens: readonly ActionLogToken[]): WorkerHandle;
  /**
   * Wraps one port, for a channel fed from this thread.
   *
   * `createChannelRegistry` makes the pair for a `source` registration
   * itself and hands out neither end, so a local channel is tapped by
   * providing it by hand instead: call `provide(token, source, port)`
   * on one end of a `MessageChannel` and register the other through
   * this.
   */
  tapPort(port: ChannelPort, token: ActionLogToken): ChannelPort;
  /**
   * Names what is being answered for as long as the returned function
   * has not been called, so everything recorded meanwhile carries the
   * same `ActionCause`.
   *
   * Called around the dispatch of one input, which is the only moment
   * where a cause is known rather than guessed: the command a click's
   * listener sends is sent synchronously inside it. Nothing is
   * allocated for an input that records nothing, so wrapping every
   * pointer move costs a function call and a null check.
   *
   * The patches that answer such a command are given the same cause,
   * which is an inference and the record says so: the barrier carries
   * no request id, so the recorder ties the next patch batch on that
   * channel to the command that preceded it, until a frame has drawn
   * one or another command replaces it.
   */
  cause(label: string): () => void;
  /**
   * Records the frame that drew whatever has been recorded since the
   * last one, closing the chain from click to command to patches to
   * pixels.
   *
   * Nothing is recorded for a frame with nothing to close, so an
   * application drawing sixty frames a second while its channels are
   * quiet adds nothing to the timeline.
   */
  frame(id: number): void;
  /** The timeline, oldest first. */
  readonly entries: readonly ActionEntry[];
  /** The channels this log is tapping, by name, in the order tapped. */
  readonly channels: readonly string[];
  /**
   * The entry the view is pinned to, or null when the view is live.
   *
   * A sequence number rather than an index, because entries fall off
   * the front of a bounded log and an index would then mean a
   * different entry than it did a moment ago.
   */
  readonly pinnedTo: number | null;
  /**
   * Rewinds every tapped channel's view to the state it held once
   * `seq` had been applied, or catches it up to the application when
   * `seq` is null.
   *
   * Each key is posted to the replica as one `{ op: 'set', path: [] }`,
   * which is the shape a reattaching client is already answered with,
   * so nothing downstream can tell a replay from a resync.
   */
  jumpTo(seq: number | null): void;
  /** Empties the timeline and goes live. Tapped channels stay tapped. */
  clear(): void;
  /** Called whenever the timeline or the pinned step changed. */
  subscribe(listener: () => void): () => void;
  /**
   * Stops recording, leaving every tapped channel working.
   *
   * The relay is not removed. A port handed to a replica cannot be
   * taken back out of the middle of it, so what this does is stop
   * listening: messages pass through, nothing is written down, and a
   * held patch could not be stranded by it.
   */
  dispose(): void;
}

/**
 * A channel's identity, structurally.
 *
 * The same erasure `ChannelRegistration` uses, and for the same
 * reason: a list of channels has no single generic instantiation, and
 * the only two things a recorder wants from a token are its name and
 * the value both ends start from.
 */
export interface ActionLogToken {
  readonly name: string;
  readonly initial: object;
}

export interface ActionLogOptions {
  /**
   * Most entries kept. Default 200.
   *
   * A dropped entry is not forgotten, only unaddressable: its patches
   * are folded into the base state each channel is reconstructed from,
   * so a jump to a step that survived is still exact.
   */
  readonly limit?: number;
}

export function createActionLog(options: ActionLogOptions = {}): ActionLog {
  return new Recorder(options.limit ?? 200);
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * Sends each new entry as it is recorded, and returns a function that
 * stops.
 *
 * `subscribe` says only that something changed, so the sequence number
 * is what tells a new entry from the ones already sent; a `clear`
 * resets it, and a bounded log retiring old entries does not. Both
 * routes to a panel need exactly this: the hook, for a log in the
 * page, and the render worker tap, for one on the other side of a
 * thread.
 */
export function forwardNewEntries(log: ActionLog, send: (entry: ActionEntry) => void): () => void {
  // Below the first sequence number, which is zero.
  let lastSeq = -1;
  const flush = (): void => {
    const entries = log.entries;
    if (entries.length === 0) {
      lastSeq = -1;
      return;
    }
    for (const entry of entries) {
      if (entry.seq > lastSeq) {
        lastSeq = entry.seq;
        send(entry);
      }
    }
  };
  flush();
  return log.subscribe(flush);
}

/**
 * One channel with the recorder in the middle of it.
 *
 * It holds two states rather than one. `live` follows every patch that
 * arrives, whether or not the view was allowed to see it, so going
 * live is a single set per key instead of a backlog to drain. `base`
 * is the state as of the oldest entry still on the timeline, which is
 * what keeps a bounded log able to reconstruct exactly.
 */
class TappedChannel {
  readonly base = new Map<string, unknown>();
  readonly live = new Map<string, unknown>();
  private open = true;

  constructor(
    readonly name: string,
    initial: object,
    private readonly toProvider: (message: unknown) => void,
    private readonly toReplica: (message: unknown) => void,
    private readonly recorder: Recorder
  ) {
    for (const [key, value] of Object.entries(initial)) {
      this.base.set(key, value);
      this.live.set(key, value);
    }
  }

  /** The replica's end: commands out, and the sync that starts it all. */
  fromReplica(data: unknown): void {
    if (this.open && isChannelClientMessage(data) && data.type === 'channel:command') {
      // In the browser's own profiler too, on the same timeline as the
      // frame spans, so a command and the frame that answered it are
      // read off one recording rather than two panels.
      markInstant(`command ${this.name}.${data.command}`, data.payload);
      this.recorder.record({ kind: 'command', channel: this.name, command: data.command, payload: data.payload });
    }
    this.toProvider(data);
  }

  /** The owning thread's end: patches and errors. */
  fromProvider(data: unknown): void {
    if (this.open && isChannelHostMessage(data)) {
      if (data.type === 'channel:patch') {
        for (const patch of data.patches) {
          this.live.set(patch.projection, applyPatch(this.live.get(patch.projection), patch));
        }
        markInstant(`patch ${this.name}`, projectionsOf(data.patches));
        this.recorder.record({
          kind: 'patch',
          channel: this.name,
          patches: data.patches,
          keys: projectionsOf(data.patches)
        });
        if (this.recorder.pinnedTo !== null) {
          // Held, not dropped: `live` already has it, and delivering it
          // would drag the view off the step someone is reading.
          return;
        }
      } else {
        this.recorder.record({ kind: 'error', channel: this.name, message: data.message });
      }
    }
    this.toReplica(data);
  }

  /** Folds a dropped entry's patches into the reconstruction base. */
  absorb(patches: readonly Patch[]): void {
    for (const patch of patches) {
      this.base.set(patch.projection, applyPatch(this.base.get(patch.projection), patch));
    }
  }

  /** Puts a whole state on the wire, exactly as a resync is answered. */
  show(state: ReadonlyMap<string, unknown>): void {
    const patches: Patch[] = [];
    for (const [projection, value] of state) {
      patches.push({ op: 'set', projection, path: [], value });
    }
    if (patches.length > 0) {
      this.toReplica({ type: 'channel:patch', patches });
    }
  }

  close(): void {
    this.open = false;
  }
}

function projectionsOf(patches: readonly Patch[]): string[] {
  const keys: string[] = [];
  for (const patch of patches) {
    if (!keys.includes(patch.projection)) {
      keys.push(patch.projection);
    }
  }
  return keys;
}

/**
 * A command waiting to be answered, so the patches that answer it can
 * be given the cause the command had.
 *
 * `claimed` is what ends the wait: once a patch batch has taken this
 * cause, the next frame closes it, because that frame is the one that
 * drew the answer. An unclaimed one waits as long as it takes, which
 * is the case that matters — the playground's `heavy.compute()` takes
 * a second and a half, and a cause that timed out before then would
 * lose exactly the round trip a person most wants to see.
 */
interface PendingCause {
  readonly cause: ActionCause;
  claimed: boolean;
}

/** An entry before the recorder gives it its place on the timeline. */
type NewEntry =
  | Omit<CommandEntry, 'seq' | 'at'>
  | Omit<PatchEntry, 'seq' | 'at'>
  | Omit<ChannelErrorEntry, 'seq' | 'at'>
  | Omit<FrameEntry, 'seq' | 'at'>;

class Recorder implements ActionLog {
  private readonly tapped: TappedChannel[] = [];
  private readonly log: ActionEntry[] = [];
  private readonly listeners = new Set<() => void>();
  private seq = 0;
  private pinned: number | null = null;
  /** The input being dispatched, if one is, and the label it was opened with. */
  private openLabel: string | null = null;
  private openCause: ActionCause | null = null;
  private causeId = 0;
  /** Commands awaiting their patches, by channel. */
  private readonly awaiting = new Map<string, PendingCause>();
  /**
   * The cause shared by everything recorded since the last frame
   * entry: undefined when nothing has been, null when two causes have.
   */
  private frameCause: ActionCause | null | undefined = undefined;
  private recordedSinceFrame = false;

  constructor(private readonly limit: number) {}

  get entries(): readonly ActionEntry[] {
    return this.log;
  }

  get channels(): readonly string[] {
    return this.tapped.map(channel => channel.name);
  }

  get pinnedTo(): number | null {
    return this.pinned;
  }

  tap(handle: WorkerHandle, tokens: readonly ActionLogToken[]): WorkerHandle {
    const initials = new Map(tokens.map(token => [token.name, token.initial]));
    return {
      open: (key: string): MessagePort => {
        const real = handle.open(key);
        // A relay pair, so what the framework receives is a real
        // `MessagePort` and not something shaped like one. `open`
        // promises a port, and a channel registered through a tap has
        // to behave in every way like a channel that was not.
        const relay = new MessageChannel();
        const channel = new TappedChannel(
          key,
          initials.get(key) ?? {},
          message => real.postMessage(message),
          message => relay.port2.postMessage(message),
          this
        );
        real.onmessage = event => channel.fromProvider(event.data);
        relay.port2.onmessage = event => channel.fromReplica(event.data);
        this.tapped.push(channel);
        return relay.port1;
      },
      get spawned(): boolean {
        return handle.spawned;
      },
      terminate: (): void => {
        handle.terminate();
      }
    };
  }

  tapPort(port: ChannelPort, token: ActionLogToken): ChannelPort {
    let listener: ((event: { data: unknown }) => void) | null = null;
    const channel = new TappedChannel(
      token.name,
      token.initial,
      message => port.postMessage(message),
      message => listener?.({ data: message }),
      this
    );
    port.onmessage = event => channel.fromProvider(event.data);
    this.tapped.push(channel);
    return {
      postMessage(message: unknown): void {
        channel.fromReplica(message);
      },
      get onmessage(): ((event: { data: unknown }) => void) | null {
        return listener;
      },
      set onmessage(next: ((event: { data: unknown }) => void) | null) {
        listener = next;
      }
    };
  }

  cause(label: string): () => void {
    const previousLabel = this.openLabel;
    const previousCause = this.openCause;
    this.openLabel = label;
    // Not minted yet: an input that sends no command should not
    // consume an id, so a person reading the timeline sees the causes
    // that did something and not a counter jumping in tens.
    this.openCause = null;
    let closed = false;
    return () => {
      if (closed) {
        return;
      }
      closed = true;
      this.openLabel = previousLabel;
      this.openCause = previousCause;
    };
  }

  frame(id: number): void {
    if (!this.recordedSinceFrame) {
      return;
    }
    this.recordedSinceFrame = false;
    const cause = this.frameCause ?? undefined;
    this.frameCause = undefined;
    // A cause whose answer has been drawn is spent. One still waiting
    // for its first patch is left alone.
    for (const [channel, pending] of this.awaiting) {
      if (pending.claimed) {
        this.awaiting.delete(channel);
      }
    }
    this.append({ kind: 'frame', frame: id, ...(cause === undefined ? {} : { cause }) });
  }

  record(
    entry: Omit<CommandEntry, 'seq' | 'at'> | Omit<PatchEntry, 'seq' | 'at'> | Omit<ChannelErrorEntry, 'seq' | 'at'>
  ): void {
    const cause = this.causeFor(entry);
    this.append(cause === undefined ? entry : { ...entry, cause });
  }

  /**
   * Which cause an entry belongs to.
   *
   * A command belongs to the input being dispatched, which is known
   * rather than guessed. A patch belongs to the command it answers,
   * which is not: the barrier carries no request id, so what stands
   * for one is "the last command on this channel that nothing has
   * answered yet". It is right whenever a channel is answering one
   * thing at a time, which is what a channel driven by a person does,
   * and it is wrong for a channel that also emits on its own between
   * the command and its answer. The panel says `via` rather than
   * `from` for that reason.
   */
  private causeFor(entry: { kind: string; channel: string }): ActionCause | undefined {
    if (entry.kind === 'command') {
      if (this.openLabel === null) {
        this.awaiting.delete(entry.channel);
        return undefined;
      }
      this.openCause ??= { id: ++this.causeId, label: this.openLabel };
      this.awaiting.set(entry.channel, { cause: this.openCause, claimed: false });
      return this.openCause;
    }
    const pending = this.awaiting.get(entry.channel);
    // The open cause first: on a thread where the provider answers
    // synchronously, the patch arrives before the click's dispatch has
    // returned and is the same answer either way.
    const cause = this.openCause ?? pending?.cause;
    if (cause !== undefined && pending?.cause === cause) {
      pending.claimed = true;
    }
    return cause;
  }

  private append(entry: NewEntry): void {
    const complete = { ...entry, seq: this.seq++, at: now() } as ActionEntry;
    if (complete.kind !== 'frame') {
      this.recordedSinceFrame = true;
      const cause = complete.cause;
      if (cause !== undefined) {
        // Null means two causes met before a frame closed them, and
        // the frame then belongs to neither.
        this.frameCause = this.frameCause === undefined || this.frameCause === cause ? cause : null;
      }
    }
    this.log.push(complete);
    while (this.log.length > this.limit) {
      this.drop();
    }
    this.notify();
  }

  jumpTo(seq: number | null): void {
    this.pinned = seq;
    for (const channel of this.tapped) {
      channel.show(seq === null ? channel.live : this.stateAt(channel, seq));
    }
    this.notify();
  }

  clear(): void {
    this.jumpTo(null);
    while (this.log.length > 0) {
      this.drop();
    }
    // A command whose answer is still coming would otherwise hand its
    // cause to a patch on an empty timeline, naming a click nothing
    // shows any more.
    this.awaiting.clear();
    this.frameCause = undefined;
    this.recordedSinceFrame = false;
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    // Released first. A recorder that stopped while pinned would leave
    // the view frozen on a step with nothing left to unfreeze it.
    this.jumpTo(null);
    for (const channel of this.tapped) {
      channel.close();
    }
    this.tapped.length = 0;
    this.log.length = 0;
    this.pinned = null;
    this.awaiting.clear();
    this.openLabel = null;
    this.openCause = null;
    this.frameCause = undefined;
    this.recordedSinceFrame = false;
    this.listeners.clear();
  }

  /** Retires the oldest entry, leaving the reconstruction exact. */
  private drop(): void {
    const dropped = this.log.shift();
    if (dropped?.kind !== 'patch') {
      return;
    }
    for (const channel of this.tapped) {
      if (channel.name === dropped.channel) {
        channel.absorb(dropped.patches);
      }
    }
  }

  private stateAt(channel: TappedChannel, seq: number): Map<string, unknown> {
    const state = new Map(channel.base);
    for (const entry of this.log) {
      if (entry.seq > seq) {
        break;
      }
      if (entry.kind !== 'patch' || entry.channel !== channel.name) {
        continue;
      }
      for (const patch of entry.patches) {
        state.set(patch.projection, applyPatch(state.get(patch.projection), patch));
      }
    }
    return state;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
