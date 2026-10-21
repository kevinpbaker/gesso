import { exampleOf } from './still';

/**
 * The one render worker behind every `<LiveExample>`.
 *
 * Each `examples/*Worker.ts` is a module whose import runs its example:
 * it calls `renderRoot` at top level. Built as a worker of its own,
 * every one of them was a separate bundle with the whole framework in
 * it, and Vite bundles each worker in a build of its own. At eighty-eight
 * examples that was 600 kB apiece and a build that outgrew Vercel's
 * eight gigabytes, where it swapped until it was cancelled. Here they
 * are chunks of a single worker, so the framework is bundled once and
 * shared, and a page still loads only the examples it shows.
 *
 * The example to run arrives as the worker's name (see `src/still.ts`),
 * since a `?worker` constructor's url is fixed and the name is the only
 * thing a page can say to a worker before it starts.
 */
type WorkerScope = {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
};

const scope = self as unknown as WorkerScope;

const modules = import.meta.glob('./examples/*Worker.ts');

/** `./examples/CounterExampleWorker.ts` → `counter`. */
const registry = new Map<string, () => Promise<unknown>>();
for (const [path, load] of Object.entries(modules)) {
  const file = path.slice(path.lastIndexOf('/') + 1);
  const id = file.replace(/(Example)?Worker\.ts$/, '').toLowerCase();
  if (registry.has(id)) {
    throw new Error(`Two live examples answer to "${id}"; rename one of them.`);
  }
  registry.set(id, load);
}

// `renderRoot` installs its handler synchronously because the shell
// sends `init` the moment the worker exists. Here the module that calls
// it is still loading when that message lands, so whatever arrives first
// is held and handed to the real handler once it is in place. Nothing
// can arrive in between: the replay runs in the same task the import
// resolves in.
const early: MessageEvent[] = [];
scope.onmessage = event => early.push(event);

const id = exampleOf();
const load = id === undefined ? undefined : registry.get(id);
if (!load) {
  scope.postMessage({
    type: 'error',
    message: `No live example called "${id}". Known: ${[...registry.keys()].join(', ')}.`,
    source: 'uncaught'
  });
} else {
  await load();
  for (const event of early) {
    scope.onmessage?.(event);
  }
}
