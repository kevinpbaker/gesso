<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import { createApp, type WorkerApp } from '@gesso/framework';

/**
 * A running Gesso application, embedded in a documentation page.
 *
 * Two things make this work at all, and both are worth knowing before
 * adding an example:
 *
 *  1. **Vite bundles a worker only from a literal URL.** Every route in
 *     the playground writes `new Worker(new URL('../examples/X.ts',
 *     import.meta.url))` out in full for that reason, which a markdown
 *     page cannot do. `import.meta.glob` with a `?worker` query is the
 *     same static analysis performed over a directory: every
 *     `*Worker.ts` beside the examples becomes a Worker constructor the
 *     bundler has already split, addressable here by name.
 *  2. **The site is a single-page app.** A reader who walks five pages
 *     would leave five render workers running, so the app is disposed
 *     on unmount — `dispose()` terminates the worker the same way
 *     leaving a playground route does.
 *
 * The appearance is handed over rather than left to the platform. A
 * Gesso shell follows `prefers-color-scheme` on its own, but this
 * site's toggle *overrides* the OS — a reader on a light system can be
 * reading in dark — so `colorScheme` is set from VitePress's `isDark`
 * and kept in step with it. Passing it at construction rather than
 * after mounting is what stops the first frame painting in the
 * appearance the reader did not choose.
 */
const props = withDefaults(defineProps<{ id: string; height?: number }>(), { height: 240 });

type WorkerModule = { default: new () => Worker };

const modules = import.meta.glob('../../src/examples/*Worker.ts', { query: '?worker' }) as Record<
  string,
  () => Promise<WorkerModule>
>;

/** `.../CounterExampleWorker.ts` → `counter`. */
const registry = new Map<string, () => Promise<WorkerModule>>();
for (const [path, load] of Object.entries(modules)) {
  const file = path.slice(path.lastIndexOf('/') + 1);
  const id = file.replace(/(Example)?Worker\.ts$/, '').toLowerCase();
  if (registry.has(id)) {
    throw new Error(`Two live examples answer to "${id}"; rename one of them.`);
  }
  registry.set(id, load);
}

const { isDark } = useData();

const host = ref<HTMLElement | null>(null);
const failure = ref<string | null>(null);
let app: WorkerApp | undefined;
let dispose: (() => void) | undefined;
let unmounted = false;

watch(isDark, dark => app?.setColorScheme(dark ? 'dark' : 'light'));

onMounted(async () => {
  const load = registry.get(props.id.toLowerCase());
  if (!load) {
    failure.value = `No live example called "${props.id}". Known: ${[...registry.keys()].join(', ')}.`;
    return;
  }

  const { default: ExampleWorker } = await load();
  if (unmounted || !host.value) {
    return;
  }

  try {
    app = createApp({
      renderWorker: () => new ExampleWorker(),
      colorScheme: isDark.value ? 'dark' : 'light',
      onError: error => {
        failure.value = error.message;
      }
    });
    dispose = app.mount(host.value);
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error);
  }
});

onUnmounted(() => {
  unmounted = true;
  dispose?.();
  app = undefined;
});
</script>

<template>
  <div class="live-example">
    <div v-if="failure" class="live-example-failure">{{ failure }}</div>
    <div v-else ref="host" class="live-example-host" :style="{ height: `${props.height}px` }" />
  </div>
</template>

<style scoped>
.live-example {
  margin: 16px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
}

.live-example-host {
  width: 100%;
  background: var(--vp-c-bg-soft);
}

.live-example-failure {
  padding: 16px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  color: var(--vp-c-danger-1);
}
</style>
