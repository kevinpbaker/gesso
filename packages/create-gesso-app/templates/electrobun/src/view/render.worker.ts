/**
 * The render worker: components, layout, paint and hit testing.
 *
 * It attaches to its channels by name and never learns that the other
 * end of them is in another process. The same file in a web
 * application says the same thing; only what is behind the channel
 * changes.
 */
import { DesktopWindows } from '@gesso/electrobun/desktop';
import { renderRoot } from '@gesso/framework';

import { App } from '../render/App';
import { Counter } from '../shared/Counter';

renderRoot(App).useChannel(Counter).useChannel(DesktopWindows);
