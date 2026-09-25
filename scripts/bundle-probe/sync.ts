/**
 * The single-thread configuration, measured for contrast rather than
 * for a budget: this one is *supposed* to carry the engine, because it
 * is the thread that runs it.
 */
import { Text } from 'gesso-core';
import { createSyncApp } from 'gesso-framework';

createSyncApp(() => Text({ text: 'probe' })).mountSync('#app');
