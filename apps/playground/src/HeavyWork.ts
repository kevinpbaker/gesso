import { channel, internalState } from '@gesso/framework';

const SPIN_MS = 1500;

export interface HeavyStatus {
  readonly runs: number;
  readonly checksum: number;
  readonly lastDurationMs: number;
}

export interface HeavyCommands {
  compute(): void;
}

/** The barrier for the playground's deliberately slow work. */
export const Heavy = channel<{ status: HeavyStatus }, HeavyCommands>('heavy', {
  status: { runs: 0, checksum: 0, lastDurationMs: 0 }
});

/**
 * Work that is deliberately, brutally slow.
 *
 * It runs on the application worker, so the spin below happens on
 * neither the shell nor the render worker: the heartbeat beside it in
 * the playground keeps its cadence throughout. That is the whole claim
 * of the thread model, in a form you can press a button on.
 */
export class HeavyWork {
  /**
   * One cell, written once per run, rather than three written in a row.
   *
   * Three cells under a `combineLatest` publish three patch batches
   * for one press, and the middle two are states this work was never
   * in: a new checksum beside the previous run's duration and count.
   * Nothing on screen showed it, because the last of the three is
   * right and they land in one frame. The action log showed it
   * immediately, which is what an action log is for.
   *
   * The framework has no opinion here and should not: how an
   * application shapes its state is the application's business, and
   * the barrier only asks that what crosses it is plain data. This is
   * that choice made deliberately.
   */
  readonly status = internalState<HeavyStatus>({ runs: 0, checksum: 0, lastDurationMs: 0 });

  /**
   * How long a run burns for. The demo wants a second and a half; a
   * spec wants the behaviour without the wait.
   */
  constructor(private readonly spinMs: number = SPIN_MS) {}

  /**
   * Burns the calling thread for a second and a half, then publishes
   * the result. Synchronous on purpose: an await would yield and prove
   * nothing about thread isolation.
   */
  compute(): void {
    const started = performance.now();
    let checksum = 0;
    while (performance.now() - started < this.spinMs) {
      for (let i = 0; i < 100000; i++) {
        checksum = (checksum + Math.sqrt(i)) % 1000000;
      }
    }
    this.status.value = {
      runs: this.status.value.runs + 1,
      checksum: Math.round(checksum),
      lastDurationMs: Math.round(performance.now() - started)
    };
  }
}
