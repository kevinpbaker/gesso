import { serveChannels } from '@gesso/framework';
import { AudiusApi } from './AudiusApi';
import { Catalogue } from './Catalogue';
import { Catalogue as CatalogueChannel } from './TransitionsContract';

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
  }
]);
