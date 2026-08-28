import { state } from '../framework/State';
import { Store } from '../framework/store/Store';
import { Action, Projection, State } from '../framework/store/decorators';

const SPIN_MS = 1500;

/**
 * A store whose action is deliberately, brutally slow.
 *
 * Owned by a data worker in the framework playground, so the spin
 * below happens on neither the main thread nor the render worker.
 * That is the arrangement Phase E exists to make possible: business
 * logic can be as expensive as it needs to be without the UI knowing.
 */
export class HeavyStore extends Store {
  @State() runs = state(0);
  @State() checksum = state(0);
  @State() lastDurationMs = state(0);

  @Projection()
  get status(): { runs: number; checksum: number; lastDurationMs: number } {
    return {
      runs: this.runs.value,
      checksum: this.checksum.value,
      lastDurationMs: Math.round(this.lastDurationMs.value)
    };
  }

  /**
   * Burns the calling thread for a second and a half, then publishes
   * the result. Synchronous on purpose: an await would yield and prove
   * nothing about thread isolation.
   */
  @Action()
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
