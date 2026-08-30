import { serveChannels } from '@gesso/framework';
import { Heavy, HeavyWork } from './HeavyWork';
import { Ticker } from './TickerChannel';
import { TickerViewModel } from './TickerViewModel';

/**
 * The playground's application worker.
 *
 * Two channels from one thread over two named ports: a ticker that
 * counts, and work that blocks this thread for a second and a half at
 * a time. Neither can reach the render worker's frames.
 */
const ticker = new TickerViewModel();
const heavy = new HeavyWork();

serveChannels([
  {
    token: Ticker,
    source: {
      view: { ticks: ticker.ticks, label: ticker.label, status: ticker.status },
      commands: { reset: () => ticker.reset(), step: (by: number) => ticker.step(by) }
    }
  },
  {
    token: Heavy,
    source: { view: { status: heavy.status }, commands: { compute: () => heavy.compute() } }
  }
]);
ticker.start();
