import { createSyncApp } from 'gesso-framework';
import { Text } from 'gesso-core';
createSyncApp(() => Text({ text: 'hi' })).mountSync('#app');
