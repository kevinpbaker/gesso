import { pickKeys, type ServedChannel } from 'gesso-framework';

import type { Catalogue } from './Catalogue';
import type { Queue } from './Queue';
import { Catalogue as CatalogueChannel, Queue as QueueChannel } from './TransitionsContract';

/**
 * The two channels the playlists app serves, as data `serveChannels`
 * takes.
 *
 * A function of the domain objects rather than a module with side
 * effects, so the same wiring runs on the application worker and under
 * `serveForTest` in a spec, where a command's effect on the view can be
 * asserted without a worker.
 */
export function transitionsChannels(catalogue: Catalogue, queue: Queue): ServedChannel[] {
  return [
    {
      token: CatalogueChannel,
      source: {
        view: { playlists: catalogue.playlists, tracks: catalogue.tracks, source: catalogue.source },
        commands: {
          reload: () => void catalogue.load()
        }
      }
    },
    {
      token: QueueChannel,
      source: {
        // One observable for eight keys, split so the differ patches each
        // on its own: a like is one small patch even though the view
        // model is one object.
        view: pickKeys(queue.view, [
          'playlistId',
          'order',
          'index',
          'current',
          'shuffled',
          'likedTracks',
          'likedPlaylists',
          'savedPlaylists'
        ]),
        commands: {
          play: (target: { readonly playlistId: string; readonly trackId?: string }) => queue.play(target),
          next: () => queue.next(),
          previous: () => queue.previous(),
          playNext: (trackId: string) => queue.playNext(trackId),
          toggleShuffle: () => queue.toggleShuffle(),
          toggleLikeTrack: (trackId: string) => queue.toggleLikeTrack(trackId),
          toggleLikePlaylist: (playlistId: string) => queue.toggleLikePlaylist(playlistId),
          toggleSavedPlaylist: (playlistId: string) => queue.toggleSavedPlaylist(playlistId)
        }
      }
    }
  ];
}
