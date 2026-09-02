import type { RuntimeErrorSource, WorkerAppOptions } from '@gesso/framework';

/** What a page knows about the application it is embedding. */
export interface EmbeddedExample {
  readonly renderWorker: () => Worker;
  readonly colorScheme: 'light' | 'dark';
  readonly onError: (message: string, stack: string | undefined, source: RuntimeErrorSource) => void;
}

/**
 * The options every live example on this site is started with.
 *
 * The one that matters is the history. A Gesso app keeps its url in
 * the window it runs in, and `path` is the default, which is right for
 * an application deployed at its own origin and wrong for a guest: an
 * example embedded here would be told the documentation page's own
 * address at start-up and would push the site to a new one on every
 * navigation. `memory` is the same history a desktop window and a test
 * get, so a routed example walks a stack of its own and the reader's
 * address bar, Back button and browsing history stay VitePress's.
 *
 * It is set here rather than in an example so that it holds for every
 * example, whoever writes it. A function rather than an object literal
 * inside `LiveExample.vue` because that decision is worth a spec, and
 * a spec cannot reach into a Vue component without a DOM to mount it
 * in.
 */
export function embeddedAppOptions(example: EmbeddedExample): WorkerAppOptions {
  return {
    renderWorker: example.renderWorker,
    colorScheme: example.colorScheme,
    onError: example.onError,
    history: { mode: 'memory' }
  };
}
