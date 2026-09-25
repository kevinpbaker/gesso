import { createApp } from 'gesso-framework';
createApp({ renderWorker: () => new Worker(new URL('./w.ts', import.meta.url), { type: 'module' }) }).mount('#app');
