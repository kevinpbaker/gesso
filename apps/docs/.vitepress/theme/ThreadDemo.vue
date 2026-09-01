<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import { createApp, createComponent, type WorkerApp } from '@gesso/framework';

import { exampleRoot } from '../../src/examples/ExampleRoot';
import { Pulse } from '../../src/examples/PulseExample';
import PulseWorker from '../../src/examples/PulseExampleWorker?worker';

/**
 * The same application, twice, on two different threads — and a button
 * that blocks the one the page is on.
 *
 * The left canvas is a render worker. The right one is the identical
 * component mounted with `mountSync`, which is the single-thread
 * configuration: it runs where this page's JavaScript runs. Blocking
 * the main thread stops the right one dead and leaves the left one
 * sweeping, which is the whole argument of the framework in one
 * gesture.
 *
 * The block is a busy loop rather than a `sleep`, because that is what
 * real work is: `await` yields and a long synchronous computation does
 * not.
 */
const { isDark } = useData();

const workerHost = ref<HTMLElement | null>(null);
const syncHost = ref<HTMLElement | null>(null);
const blocking = ref(false);
const failure = ref<string | null>(null);

let worker: WorkerApp | undefined;
let disposeWorker: (() => void) | undefined;
let disposeSync: (() => void) | undefined;
let syncApp: { setColorScheme(preference: 'light' | 'dark' | 'auto'): unknown } | undefined;

watch(isDark, dark => {
  const scheme = dark ? 'dark' : 'light';
  worker?.setColorScheme(scheme);
  syncApp?.setColorScheme(scheme);
});

onMounted(() => {
  const scheme = isDark.value ? 'dark' : 'light';
  try {
    worker = createApp({
      renderWorker: () => new PulseWorker(),
      colorScheme: scheme,
      onError: message => {
        failure.value = message;
      }
    });
    disposeWorker = worker.mount(workerHost.value!);

    const builder = createApp(exampleRoot(createComponent(Pulse, { label: 'Main thread' })));
    builder.setColorScheme(scheme);
    syncApp = builder;
    disposeSync = builder.mountSync(syncHost.value!);
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error);
  }
});

onUnmounted(() => {
  disposeWorker?.();
  disposeSync?.();
  worker = undefined;
  syncApp = undefined;
});

function blockMainThread(): void {
  blocking.value = true;
  // Let the class change paint before the thread stops answering.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const until = performance.now() + 2000;
      while (performance.now() < until) {
        // Deliberately nothing: this is what a long computation looks
        // like from the outside.
      }
      blocking.value = false;
    });
  });
}
</script>

<template>
  <div class="thread-demo">
    <p v-if="failure" class="thread-demo-failure">{{ failure }}</p>
    <div v-else class="thread-demo-panes">
      <figure>
        <div ref="workerHost" class="thread-demo-canvas" />
        <figcaption>In a render worker</figcaption>
      </figure>
      <figure>
        <div ref="syncHost" class="thread-demo-canvas" />
        <figcaption>On the main thread</figcaption>
      </figure>
    </div>
    <div class="thread-demo-controls">
      <button type="button" :disabled="blocking" @click="blockMainThread">
        {{ blocking ? 'Main thread blocked…' : 'Block the main thread for 2 seconds' }}
      </button>
      <span>Both canvases run the same component. Only one of them survives.</span>
    </div>
  </div>
</template>

<style scoped>
.thread-demo {
  margin: 24px 0;
}

.thread-demo-panes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.thread-demo-panes figure {
  margin: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
}

.thread-demo-canvas {
  height: 150px;
  background: var(--vp-c-bg-soft);
}

.thread-demo-panes figcaption {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--vp-c-text-2);
  border-top: 1px solid var(--vp-c-divider);
}

.thread-demo-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.thread-demo-controls button {
  padding: 8px 14px;
  font: inherit;
  font-size: 14px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.thread-demo-controls button:hover:not(:disabled) {
  background: var(--vp-c-default-soft);
}

.thread-demo-controls button:disabled {
  cursor: progress;
  opacity: 0.7;
}

.thread-demo-controls span {
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.thread-demo-failure {
  padding: 16px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  color: var(--vp-c-danger-1);
}
</style>
