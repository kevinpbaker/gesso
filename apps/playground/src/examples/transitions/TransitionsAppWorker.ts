import { distinctUntilChanged, map, type Observable } from 'rxjs';

import { serveChannels } from '@gesso/framework';
import { AudiusApi } from './AudiusApi';
import { Catalogue } from './Catalogue';
import { Queue } from './Queue';
import { Catalogue as CatalogueChannel, Queue as QueueChannel } from './TransitionsContract';

/**
 * The playlists application, on its own thread.
 *
 * The same four-line shape as `NotesAppWorker`: plain classes wired
 * together and one call that publishes them. The catalogue starts on
 * the committed snapshot and asks Audius at once; the render worker
 * sees the swap as an ordinary patch. Nothing above `serveChannels` in
 * this file's imports touches the framework, so `AudiusApi` and
 * `Catalogue` are specified in bare vitest against canned responses.
 */
const catalogue = new Catalogue(new AudiusApi());
const queue = new Queue(catalogue);
void catalogue.load();

serveChannels([
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
      // One observable for eight keys: the differ patches only what
      // changed, so a like is one small patch even though the view
      // travels as a whole.
      view: {
        playlistId: pick(queue.view, 'playlistId'),
        order: pick(queue.view, 'order'),
        index: pick(queue.view, 'index'),
        current: pick(queue.view, 'current'),
        shuffled: pick(queue.view, 'shuffled'),
        likedTracks: pick(queue.view, 'likedTracks'),
        likedPlaylists: pick(queue.view, 'likedPlaylists'),
        savedPlaylists: pick(queue.view, 'savedPlaylists')
      },
      commands: {
        play: target => queue.play(target),
        next: () => queue.next(),
        previous: () => queue.previous(),
        playNext: trackId => queue.playNext(trackId),
        toggleShuffle: () => queue.toggleShuffle(),
        toggleLikeTrack: trackId => queue.toggleLikeTrack(trackId),
        toggleLikePlaylist: playlistId => queue.toggleLikePlaylist(playlistId),
        toggleSavedPlaylist: playlistId => queue.toggleSavedPlaylist(playlistId)
      }
    }
  }
]);

function pick<T, K extends keyof T>(source: Observable<T>, key: K): Observable<T[K]> {
  return source.pipe(
    map(value => value[key]),
    distinctUntilChanged()
  );
}
