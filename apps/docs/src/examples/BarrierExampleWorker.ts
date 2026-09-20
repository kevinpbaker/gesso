import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { BarrierScreen, createTaskStore, taskSource, Tasks, tapChannel } from './BarrierExample';

// #region register
/**
 * The render worker behind `<LiveExample id="barrier" />`.
 *
 * Where a channel's data lives is decided here and nowhere else.
 * `worker` names the thread that owns it; this example hands over a
 * tap so the page can show the traffic, and a real application passes
 * the handle for its application worker instead. Nothing in
 * `BarrierScreen` changes either way.
 */
const store = createTaskStore();
const wire = tapChannel(taskSource(store));

renderRoot(exampleRoot(createComponent(BarrierScreen, { traffic: wire.traffic }))).useChannel(Tasks, {
  worker: wire.handle
});
// #endregion register
