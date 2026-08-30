import { BehaviorSubject, map, type Observable } from 'rxjs';

import type { TickerView } from './TickerChannel';

/**
 * The application layer behind the ticker channel.
 *
 * Plain classes and plain RxJS: no framework import, no decorator, no
 * base class. It is testable with bare vitest and knows nothing about
 * graphs, layout or workers — which is the whole point of the barrier
 * being a declared contract rather than a shared framework object.
 */
export class TickerViewModel {
  private readonly count = new BehaviorSubject(0);
  private timer: ReturnType<typeof setInterval> | undefined;

  readonly ticks: Observable<number> = this.count;
  readonly label: Observable<string> = this.count.pipe(
    map(value =>
      value === 0 ? 'channel: waiting for the data worker' : `channel: ${value} ticks from the data worker`
    )
  );
  readonly status: Observable<TickerView['status']> = this.count.pipe(
    map(value => (value === 0 ? 'waiting' : 'running'))
  );

  start(everyMs = 1000): void {
    this.timer ??= setInterval(() => this.step(1), everyMs);
  }

  step(by: number): void {
    this.count.next(this.count.value + by);
  }

  reset(): void {
    this.count.next(0);
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
