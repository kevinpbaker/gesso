import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { Basket, basketSource, Highlight, StateScreen } from './StateExample';

// #region register
/**
 * The render worker behind `<LiveExample id="state" />`.
 *
 * One service and one channel, which is the whole taxonomy in two
 * lines. The channel is registered with a `source`, so its data lives
 * on this thread; naming a `worker` instead moves it, and nothing in
 * `StateExample.tsx` changes.
 */
renderRoot(exampleRoot(createComponent(StateScreen, {})))
  .useService(Highlight)
  .useChannel(Basket, { source: basketSource() });
// #endregion register
