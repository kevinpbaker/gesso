import type { Patch } from '../StorePatch';

/**
 * A two-way message channel between a replica and its authoritative
 * store. MessagePort and Worker both satisfy this, as does a test
 * double, so nothing in the store layer depends on Worker itself.
 */
export interface StorePort {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

/** Replica → authoritative store. */
export type StoreClientMessage = { type: 'store:sync' } | { type: 'store:action'; action: string; payload: unknown };

/** Authoritative store → replica. */
export type StoreHostMessage =
  | { type: 'store:patch'; patches: Patch[] }
  | { type: 'store:error'; message: string; stack?: string };

export function isStoreClientMessage(value: unknown): value is StoreClientMessage {
  const type = (value as { type?: unknown } | null)?.type;
  return type === 'store:sync' || type === 'store:action';
}

export function isStoreHostMessage(value: unknown): value is StoreHostMessage {
  const type = (value as { type?: unknown } | null)?.type;
  return type === 'store:patch' || type === 'store:error';
}
