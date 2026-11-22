/**
 * The render worker: everything the person sees.
 *
 * A component cannot cross `postMessage`, so the root is named here
 * rather than passed in from `main.ts`. That one constraint is the
 * reason this file exists, and it is why every Gesso application has
 * three files rather than two.
 *
 * It is also where the `clicks` channel gets its data. A larger
 * application keeps that in a worker of its own; this one keeps it
 * here, which is all a count needs. The screen and an AI agent read the
 * same view and send the same commands.
 */
import { BehaviorSubject } from 'rxjs';

import { renderRoot } from 'gesso-framework';
import { App } from './App';
import { Clicks } from './clicks';

const count = new BehaviorSubject(0);

renderRoot(App).useChannel(Clicks, {
  source: {
    view: { count },
    commands: {
      add: (by = 1) => count.next(count.value + by),
      reset: () => count.next(0)
    }
  }
});
