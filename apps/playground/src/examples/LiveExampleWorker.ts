import { renderRoot } from '@gesso/framework';
import { LiveApp, LiveFeed } from './LiveExampleApp';

/**
 * Render worker for the live example. The feed's timer runs here,
 * beside the tree it drives, so a busy main thread cannot stall it.
 */
const app = renderRoot(LiveApp).useService(LiveFeed);

/**
 * Hot module replacement (`ROADMAP.md` F7).
 *
 * The clearest demonstration in the repository, because everything
 * worth keeping across a reload is here: `LiveFeed` is a service, so
 * its timer and its log ring belong to the runtime rather than to the
 * tree, and a rebuilt screen shows the samples that arrived while the
 * module was being edited.
 */
import.meta.hot?.accept('./LiveExampleApp', module => {
  if (module !== undefined) {
    const replacement = module as unknown as { LiveApp: typeof LiveApp; LiveFeed: typeof LiveFeed };
    // `LiveFeed` is defined in this module too, so the replacement is
    // a new class object; handing it over lets the registry adopt it
    // and keep the samples it has already taken.
    app.reload(replacement.LiveApp, [replacement.LiveFeed]);
  }
});
