<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import { createApp, type WorkerApp } from 'gesso-framework';
import ExampleWorker from '../../src/exampleWorker?worker';
import { workerName } from '../../src/still';
import { embeddedAppOptions } from './embeddedApp';

/**
 * A running Gesso application, embedded in a documentation page.
 *
 * Two things make this work at all, and both are worth knowing before
 * adding an example:
 *
 *  1. **Every example runs in the same worker.** Vite bundles a
 *     worker only from a literal URL, which a markdown page cannot
 *     write, so `src/exampleWorker.ts` is the one worker every example
 *     runs in, and the example's id goes over as the worker's name.
 *     It finds the example among the `*Worker.ts` modules beside the
 *     examples and imports it, and only that one is fetched. One
 *     worker rather than one per example is what keeps the framework
 *     bundled once; that file says why that matters.
 *  2. **The site is a single-page app.** A reader who walks five pages
 *     would leave five render workers running, so the app is disposed
 *     on unmount: `dispose()` terminates the worker the same way
 *     leaving a playground route does.
 *  3. **An example is a guest on this page.** The options it starts
 *     with come from `embeddedAppOptions`, which is where the memory
 *     history lives: an example with routes navigates a history of
 *     its own and never the site's address bar.
 *
 * `?still` on the page's url asks every example on it to hold a frame,
 * so a screenshot gate has something to photograph. A worker has no
 * url of its own, so the flag crosses as the worker's name; see
 * `src/still.ts`.
 *
 * The appearance is handed over rather than left to the platform. A
 * Gesso shell follows `prefers-color-scheme` on its own, but this
 * site's toggle *overrides* the OS, since a reader on a light system
 * can be reading in dark, so `colorScheme` is set from VitePress's
 * `isDark` and kept in step with it. Passing it at construction rather than
 * after mounting is what stops the first frame painting in the
 * appearance the reader did not choose.
 */
// `height` arrives as a string from markdown (`height="240"`), so the
// prop takes either and the style interpolates whichever it got.
const props = withDefaults(defineProps<{ id: string; height?: number | string }>(), { height: 240 });

const { isDark } = useData();

const host = ref<HTMLElement | null>(null);
const failure = ref<string | null>(null);
let app: WorkerApp | undefined;
let dispose: (() => void) | undefined;

watch(isDark, dark => app?.setColorScheme(dark ? 'dark' : 'light'));

onMounted(() => {
  if (!host.value) {
    return;
  }

  try {
    app = createApp(
      embeddedAppOptions({
        renderWorker: () => new ExampleWorker({ name: workerName(props.id.toLowerCase()) }),
        colorScheme: isDark.value ? 'dark' : 'light',
        onError: message => {
          failure.value = message;
        }
      })
    );
    dispose = app.mount(host.value);
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error);
  }
});

onUnmounted(() => {
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
