import type { UiChild } from '@gesso/core';
import { internalState, type ComponentContext } from '@gesso/framework';
import { map } from 'rxjs';

/**
 * The module a hot replacement replaces, for the page on hot module
 * replacement to quote.
 *
 * A root and a service in one file, which is the arrangement that
 * makes the service question visible: replacing this module produces a
 * new `CounterFeed` class object as well as a new `CounterApp`, so the
 * entry has to hand both over.
 */
// #region service
export class CounterFeed {
  /** Survives a replacement, because it belongs to the runtime. */
  readonly samples = internalState(0);

  constructor() {
    setInterval(() => (this.samples.value += 1), 1000);
  }
}
// #endregion service

// #region app
export function CounterApp(_props: Record<string, never>, ctx: ComponentContext): UiChild {
  const feed = ctx.inject(CounterFeed);
  const clicks = internalState(0);
  return (
    <column gap={8} padding={16}>
      <text color="primary">{feed.samples.pipe(map(value => `Samples taken: ${value}`))}</text>
      <text color="textMuted">{clicks.pipe(map(value => `Clicks: ${value}`))}</text>
      <button label="Add one" onClick={() => clicks.value++}>
        Add one
      </button>
    </column>
  );
}
// #endregion app
