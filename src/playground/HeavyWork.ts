import { combineLatest, map, type Observable } from 'rxjs';

import { channel } from '../framework/channel/ChannelToken';
import { internalState } from '../framework/InternalState';

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
  readonly runs = internalState(0);
  readonly checksum = internalState(0);
  readonly lastDurationMs = internalState(0);

  readonly status: Observable<HeavyStatus> = combineLatest([this.runs, this.checksum, this.lastDurationMs]).pipe(
    map(([runs, checksum, lastDurationMs]) => ({ runs, checksum, lastDurationMs: Math.round(lastDurationMs) }))
  );

  /**
   * Burns the calling thread for a second and a half, then publishes
   * the result. Synchronous on purpose: an await would yield and prove
   * nothing about thread isolation.
   */
  compute(): void {
    const started = performance.now();
    let checksum = 0;
    while (performance.now() - started < SPIN_MS) {
      for (let i = 0; i < 100000; i++) {
        checksum = (checksum + Math.sqrt(i)) % 1000000;
      }
    }
    this.checksum.value = Math.round(checksum);
    this.lastDurationMs.value = performance.now() - started;
    this.runs.value++;
  }
}
