import { internalState, type InternalState } from '@gesso/framework';

/**
 * What the person has liked and saved, remembered for the life of the
 * page.
 *
 * Module scope for the same reason `listScroll` is: the list screen and
 * the playlist screen are built and destroyed as you move between them,
 * and a heart pressed on one has to still be red on the other. Keyed
 * lazily, so a playlist or a track that was never touched costs nothing.
 *
 * This is a stopgap with a known successor. The roadmap's P3 moves likes
 * and saves into the queue channel on the application worker, where
 * they belong with the rest of the app's state; until then this keeps
 * the controls honest without inventing a data layer to do it.
 */
const cells = new Map<string, InternalState<boolean>>();

function cell(key: string): InternalState<boolean> {
  let state = cells.get(key);
  if (state === undefined) {
    state = internalState(false);
    cells.set(key, state);
  }
  return state;
}

/** Whether the playlist is in the library. */
export function savedPlaylist(id: string): InternalState<boolean> {
  return cell(`saved:${id}`);
}

/** Whether the playlist is liked. */
export function likedPlaylist(id: string): InternalState<boolean> {
  return cell(`liked:${id}`);
}

/** Whether a track of a playlist is liked. */
export function likedTrack(playlistId: string, index: number): InternalState<boolean> {
  return cell(`liked:${playlistId}:${index}`);
}

export function toggle(state: InternalState<boolean>): void {
  state.value = !state.value;
}
