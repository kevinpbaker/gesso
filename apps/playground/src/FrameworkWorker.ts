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
renderRoot(FrameworkDemoRoot).useService(DemoCounter).useChannel(Heavy).useChannel(Ticker);
