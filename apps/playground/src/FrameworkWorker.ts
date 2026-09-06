import { renderRoot } from '@gesso/framework';
import { createActionLog, tapRenderWorker } from '@gesso/devtools';
import { DemoCounter, FrameworkDemoRoot } from './FrameworkPlayground';
import { Heavy } from './HeavyWork';
import { Ticker } from './TickerChannel';

/**
 * Render worker for the framework playground.
 *
 * The entire UI lives here. It spawns nothing: the shell creates the
 * application worker and hands this one a port to it, so both channels
 * resolve over that port without this file knowing where it leads.
 *
 * One service and two channels, which is the taxonomy in three lines.
 * `DemoCounter` is shared state that never leaves this thread, so it is
 * simply called. `Heavy` and `Ticker` are application state on another
 * thread, reached through view keys and commands.
 */
const app = renderRoot(FrameworkDemoRoot).useService(DemoCounter);

/**
 * The action log, here in the render worker, which is where the ports
 * are (`EXCELLENCE_ROADMAP.md` X15).
 *
 * `decisions/0047` wrote the recorder to run in a worker and then did
 * not run it in one, because the only two ways to wire it up at the
 * time were a line in this file, which that change did not own, or
 * routing every patch through the shell, which would have falsified
 * the one thing this route exists to show. This is that line. The
 * shell still holds neither end of a channel: the tap stands on the
 * worker's own global, between the shell's messages and the runtime,
 * and posts what it records to the panel as devtools events.
 *
 * Development only. A recorder in a production bundle holds patch
 * batches for a session nobody is watching.
 */
if (import.meta.env.DEV) {
  const actions = createActionLog();
  // After `renderRoot`, whose constructor installs the handler this
  // wraps, and before `init` arrives, which is when the channels are
  // opened over the port it captures.
  const tap = tapRenderWorker(actions);
  const applicationWorker = tap.applicationWorker([Heavy, Ticker]);
  app.useChannel(Heavy, { worker: applicationWorker }).useChannel(Ticker, { worker: applicationWorker });
} else {
  app.useChannel(Heavy).useChannel(Ticker);
}

/**
 * Hot module replacement (`ROADMAP.md` F7).
 *
 * The framework knows nothing about Vite: it offers `reload(root)`,
 * and an entry that has an HMR client asks it for the new module and
 * hands the root over. Two lines, which is what the roadmap promised.
 *
 * The channels are not re-registered and must not be. `Heavy` and
 * `Ticker` are served by another worker that this replacement does not
 * touch, and their replicas belong to the runtime rather than to the
 * tree, so the rebuilt screen binds to the tick count that was already
 * there instead of starting from zero.
 */
import.meta.hot?.accept('./FrameworkPlayground', module => {
  if (module !== undefined) {
    const replacement = module as unknown as {
      FrameworkDemoRoot: typeof FrameworkDemoRoot;
      DemoCounter: typeof DemoCounter;
    };
    app.reload(replacement.FrameworkDemoRoot, [replacement.DemoCounter]);
  }
});
