import { channel } from '@gesso/framework';

/**
 * The barrier contract for the playground's ticker.
 *
 * Imported by both the render worker and the data worker, and holding
 * nothing but names and shapes — no class, no decorator, nothing to
 * bundle. Whatever produces these values on the other side is the
 * application's business; the framework only diffs plain data.
 */
export interface TickerView {
  ticks: number;
  label: string;
  status: 'waiting' | 'running';
}

export interface TickerCommands {
  reset(): void;
  step(by: number): void;
}

export const Ticker = channel<TickerView, TickerCommands>('ticker', {
  ticks: 0,
  label: 'channel: waiting for the data worker',
  status: 'waiting'
});
