import type { Patch } from './StorePatch';

/**
 * A two-way channel endpoint. `MessagePort` satisfies it, as does a
 * test double, so nothing in the channel layer depends on Worker.
 */
export interface ChannelPort {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

/** Render thread → the thread that owns the channel. */
export type ChannelClientMessage =
  | { type: 'channel:sync' }
  | { type: 'channel:command'; command: string; payload: unknown };

/** The owning thread → render thread. */
export type ChannelHostMessage =
  | { type: 'channel:patch'; patches: Patch[] }
  | { type: 'channel:error'; message: string; stack?: string };

export function isChannelClientMessage(value: unknown): value is ChannelClientMessage {
  const type = (value as { type?: unknown } | null)?.type;
  return type === 'channel:sync' || type === 'channel:command';
}

export function isChannelHostMessage(value: unknown): value is ChannelHostMessage {
  const type = (value as { type?: unknown } | null)?.type;
  return type === 'channel:patch' || type === 'channel:error';
}
