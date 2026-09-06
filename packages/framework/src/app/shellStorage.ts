import { classifyStorageError, storageErrorMessage } from '../storage/StorageAdapter';
import type { ShellStorageOp, ShellStorageResult } from './ShellService';

/** What a shell needs of `localStorage`, and no more. */
export interface ShellLocalStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

const DENIED: ShellStorageResult = {
  outcome: 'denied',
  value: null,
  keys: [],
  error: 'This window has no localStorage.'
};

/**
 * Performs one storage request on the shell's `localStorage`.
 *
 * The whole of what the shell does for `ShellStorage`, written once
 * and called from both configurations, because the shell's half of a
 * request should be identical whether the render side is a worker or
 * the same thread. It decides nothing: the key it is given is the key
 * it uses, and every outcome goes back to the thread that asked.
 *
 * `open` is a function rather than a store, because reading
 * `window.localStorage` is itself what throws when a browser has
 * blocked it. Asking for it inside the `try` is what turns that into a
 * `denied` answer rather than an exception in the shell's message
 * handler.
 */
export function performShellStorage(
  request: { readonly op: ShellStorageOp; readonly key: string; readonly value?: string },
  open: () => ShellLocalStore | null | undefined
): ShellStorageResult {
  try {
    const store = open();
    if (store === null || store === undefined) {
      return DENIED;
    }
    switch (request.op) {
      case 'read':
        return { outcome: 'ok', value: store.getItem(request.key), keys: [], error: null };
      case 'write':
        store.setItem(request.key, request.value ?? '');
        return { outcome: 'ok', value: null, keys: [], error: null };
      case 'remove':
        store.removeItem(request.key);
        return { outcome: 'ok', value: null, keys: [], error: null };
      case 'keys': {
        const keys: string[] = [];
        for (let at = 0; at < store.length; at++) {
          const key = store.key(at);
          if (key !== null) {
            keys.push(key);
          }
        }
        return { outcome: 'ok', value: null, keys, error: null };
      }
    }
  } catch (error) {
    return { outcome: classifyStorageError(error), value: null, keys: [], error: storageErrorMessage(error) };
  }
}

/** The answer for a shell that has no window at all. */
export function shellStorageDenied(): ShellStorageResult {
  return DENIED;
}
