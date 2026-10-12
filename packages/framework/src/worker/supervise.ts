import { BehaviorSubject } from 'rxjs';

/**
 * A worker that runs code this application does not trust to behave: a
 * plugin, a user's script, a parser fed whatever a file holds. It is
 * started, asked every second whether it is there, and stopped if it has
 * not answered for too long, or has not said it is ready in time, so a
 * loop in it costs a core and nothing else: no thread waits on it, and
 * the person is told.
 *
 * Two halves. `SupervisedWorker` is the side that starts the worker, in
 * an application worker or the page; `superviseSelf` is the worker's,
 * which answers the questions, says when it is ready, and reports what
 * nothing in it caught. Their own messages are told apart from the
 * application's by a field of their own, so either side's protocol is
 * its business: `onMessage` and `post` carry everything else.
 *
 * Found building Gesso Code's plugins, whose host did all of this by
 * hand.
 */

/** Where a supervised worker is in its life. */
export type SupervisedState = 'starting' | 'running' | 'failed' | 'stopped';

export interface SupervisedStatus {
  readonly state: SupervisedState;
  /** Why it failed or was stopped; `''` while it starts or runs. */
  readonly message: string;
  /** The stack of what it threw, when it failed by throwing; `''` otherwise. */
  readonly stack: string;
}

/** What the worker said that went wrong: `failed` before it was ready, `error` after, which it lives through. */
export interface SupervisedError {
  readonly message: string;
  readonly stack: string;
}

/** The field the two halves' own messages carry, so an application's never collide with them. */
const KEY = '__gessoSupervised';

type Supervision =
  | { readonly [KEY]: 'ping'; readonly n: number }
  | { readonly [KEY]: 'pong'; readonly n: number }
  | { readonly [KEY]: 'ready' }
  | { readonly [KEY]: 'failed'; readonly message: string; readonly stack: string }
  | { readonly [KEY]: 'error'; readonly message: string; readonly stack: string };

function isSupervision(data: unknown): data is Supervision {
  return typeof data === 'object' && data !== null && KEY in data;
}

/** What `SupervisedWorker` needs of a worker: a `Worker`, or anything shaped like one, as a spec's fake. */
export interface SupervisableWorker {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface SupervisedWorkerOptions {
  /** How long it may go without answering, in ms: 5 s by default. */
  readonly unansweredMs?: number;
  /** How long it has to say it is ready, in ms: 10 s by default. */
  readonly startMs?: number;
  /** How often it is asked, in ms: every second by default. */
  readonly pingMs?: number;
  /** Every message that is not the supervision's own. */
  readonly onMessage?: (data: unknown) => void;
  /** What it reported that nothing in it caught, while it ran on. */
  readonly onError?: (error: SupervisedError) => void;
  /**
   * The clock and the timer: a spec passes its own, and calls `check`.
   * `schedule` returns what cancels it.
   */
  readonly now?: () => number;
  readonly schedule?: (check: () => void, everyMs: number) => () => void;
}

export class SupervisedWorker {
  /** Where it is, and why it stopped. */
  readonly status$: BehaviorSubject<SupervisedStatus>;
  private readonly started: number;
  private lastAnswer: number;
  private pinged = 0;
  private readonly cancel: () => void;
  private readonly now: () => number;
  private readonly unansweredMs: number;
  private readonly startMs: number;

  constructor(
    private readonly worker: SupervisableWorker,
    private readonly options: SupervisedWorkerOptions = {}
  ) {
    this.now = options.now ?? (() => performance.now());
    this.unansweredMs = options.unansweredMs ?? 5000;
    this.startMs = options.startMs ?? 10_000;
    this.started = this.now();
    this.lastAnswer = this.started;
    this.status$ = new BehaviorSubject<SupervisedStatus>({ state: 'starting', message: '', stack: '' });
    worker.onmessage = event => this.receive(event.data);
    worker.onerror = event => {
      // The worker's script itself would not load or run: nothing more will come from it.
      event.preventDefault();
      this.end('failed', `Its worker failed: ${event.message}`);
    };
    const schedule =
      options.schedule ??
      ((check, everyMs) => {
        const timer = setInterval(check, everyMs);
        return () => clearInterval(timer);
      });
    this.cancel = schedule(() => this.check(), options.pingMs ?? 1000);
  }

  get state(): SupervisedState {
    return this.status$.value.state;
  }

  /** Whether it can still be sent anything: it has not failed or been stopped. */
  get alive(): boolean {
    return this.state === 'starting' || this.state === 'running';
  }

  /** Sends it a message of the application's; nothing, once it is not alive. */
  post(message: unknown, transfer?: Transferable[]): void {
    if (this.alive) this.worker.postMessage(message, transfer);
  }

  /** Ends it, as the application decided: by the person, or for something it sent. */
  stop(message = 'Stopped.'): void {
    this.end('stopped', message);
  }

  /** Ends it as failed: what it did, or did not do, means it cannot go on. */
  fail(message: string): void {
    this.end('failed', message);
  }

  /** Asks it whether it is there, and ends it if it has been too long. The timer calls it; a spec may. */
  check(): void {
    if (!this.alive) return;
    const now = this.now();
    if (this.state === 'starting' && now - this.started > this.startMs) {
      this.end('failed', `It did not say it was ready within ${seconds(this.startMs)}.`);
      return;
    }
    if (now - this.lastAnswer > this.unansweredMs) {
      this.end('stopped', `It was busy for ${seconds(this.unansweredMs)} without answering.`);
      return;
    }
    this.worker.postMessage({ [KEY]: 'ping', n: ++this.pinged } satisfies Supervision);
  }

  private receive(data: unknown): void {
    if (!this.alive) return;
    // Anything it says is an answer: a busy worker that still sends is not stuck.
    this.lastAnswer = this.now();
    if (!isSupervision(data)) {
      this.options.onMessage?.(data);
      return;
    }
    switch (data[KEY]) {
      case 'pong':
      case 'ping':
        return;
      case 'ready':
        if (this.state === 'starting') this.status$.next({ state: 'running', message: '', stack: '' });
        return;
      case 'failed':
        this.end('failed', data.message, data.stack);
        return;
      case 'error':
        this.options.onError?.({ message: data.message, stack: data.stack });
        return;
    }
  }

  private end(state: 'failed' | 'stopped', message: string, stack = ''): void {
    if (!this.alive) return;
    this.worker.terminate();
    this.cancel();
    this.status$.next({ state, message, stack });
  }
}

function seconds(ms: number): string {
  const s = ms / 1000;
  return `${s} second${s === 1 ? '' : 's'}`;
}

/** What a worker's global is, as far as `superviseSelf` uses it. */
export interface SupervisedScope {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  addEventListener(type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void): void;
}

export interface SupervisedSelf {
  /** Says it is ready: `SupervisedWorker` stops counting toward `startMs`. */
  ready(): void;
  /** Says it could not start (its setup threw): it is ended, as failed, with this. */
  failed(error: unknown): void;
  /** Says something went wrong that it lives through: the other side's `onError` hears it. */
  report(error: unknown): void;
}

/**
 * The worker's half: answers `SupervisedWorker`'s questions as they
 * come, and reports what nothing caught. Call it first, before anything
 * that can loop: an answer is only late while the worker is busy, which
 * is the point.
 *
 * `onMessage` is given every message that is not the supervision's own;
 * a worker can as well add its own listener and ignore those
 * (`isSupervisionMessage`).
 */
export function superviseSelf(
  onMessage?: (data: unknown) => void,
  scope: SupervisedScope = self as unknown as SupervisedScope
): SupervisedSelf {
  const describe = (error: unknown): SupervisedError =>
    error instanceof Error
      ? { message: error.message, stack: error.stack ?? '' }
      : { message: String(error), stack: '' };
  scope.addEventListener('message', event => {
    const data: unknown = event.data;
    if (!isSupervision(data)) {
      onMessage?.(data);
      return;
    }
    if (data[KEY] === 'ping') scope.postMessage({ [KEY]: 'pong', n: data.n } satisfies Supervision);
  });
  scope.addEventListener('error', event =>
    scope.postMessage({ [KEY]: 'error', ...describe(event.error ?? event.message) } satisfies Supervision)
  );
  scope.addEventListener('unhandledrejection', event =>
    scope.postMessage({ [KEY]: 'error', ...describe(event.reason) } satisfies Supervision)
  );
  return {
    ready: () => scope.postMessage({ [KEY]: 'ready' } satisfies Supervision),
    failed: error => scope.postMessage({ [KEY]: 'failed', ...describe(error) } satisfies Supervision),
    report: error => scope.postMessage({ [KEY]: 'error', ...describe(error) } satisfies Supervision)
  };
}

/** Whether a message is one of the supervision's own, which an application's listener can pass over. */
export function isSupervisionMessage(data: unknown): boolean {
  return isSupervision(data);
}
