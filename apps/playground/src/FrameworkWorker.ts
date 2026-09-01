import { renderRoot } from '@gesso/framework';
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
const app = renderRoot(FrameworkDemoRoot).useService(DemoCounter).useChannel(Heavy).useChannel(Ticker);

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
