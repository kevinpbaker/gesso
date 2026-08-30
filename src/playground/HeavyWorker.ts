import { serveChannels } from '../framework/channel/serveChannels';
import { serveStores } from '../framework/store/worker/exposeStore';
import { HeavyStore } from './HeavyStore';
import { Ticker } from './TickerChannel';
import { TickerViewModel } from './TickerViewModel';

/**
 * The playground's data worker.
 *
 * It holds two things at once, which is what the named-port transport
 * bought: a `HeavyStore` on the old path, and the `Ticker` channel on
 * the new one. Each answers for its own names on the worker's single
 * global channel and declines the rest.
 *
 * Above `serveChannels` there is no framework: `TickerViewModel` is a
 * plain class over plain subjects, and only plain data crosses.
 */
serveStores({ HeavyStore });

const ticker = new TickerViewModel();
serveChannels([
  {
    token: Ticker,
    source: {
      view: { ticks: ticker.ticks, label: ticker.label, status: ticker.status },
      commands: {
        reset: () => ticker.reset(),
        step: (by: number) => ticker.step(by)
      }
    }
  }
]);
ticker.start();
