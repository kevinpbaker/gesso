import { renderRoot } from '@gesso/framework';
import { CounterApp, CounterFeed } from './HotReloadApp';

/**
 * A render worker entry with hot module replacement, quoted by the
 * documentation.
 *
 * Deliberately **not** named `*Worker.ts`: the live-example machinery
 * globs that suffix and would offer this as an embeddable example. It
 * is here to be typechecked and read, so the two lines on the page
 * cannot drift from two lines that compile.
 *
 * `import.meta.hot.accept` has to be at the top level of the module,
 * because a bundler reads it statically to decide where the boundary
 * is. That is why it is written out here rather than wrapped in a
 * helper.
 */
// #region entry
const app = renderRoot(CounterApp).useService(CounterFeed);

import.meta.hot?.accept('./HotReloadApp', module => {
  if (module === undefined) {
    return;
  }
  const next = module as unknown as { CounterApp: typeof CounterApp; CounterFeed: typeof CounterFeed };
  app.reload(next.CounterApp, [next.CounterFeed]);
});
// #endregion entry
