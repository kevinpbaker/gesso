import type { StateOperation, StatePatch } from './StatePatch';

/**
 * Messages sent from the main thread to the data worker.
 */
export type DataWorkerMessage =
  | { type: 'init' }
  | { type: 'connectRender'; port: MessagePort }
  | { type: 'control'; op: StateOperation }
  | { type: 'dispose' };

/**
 * Messages sent from the data worker back to the main thread.
 */
export type DataWorkerOutputMessage = { type: 'patch'; patch: StatePatch } | { type: 'error'; message: string };
