import { serveChannels } from 'gesso-framework';
import { AudiusApi } from './AudiusApi';
import { Catalogue, CURATED, withoutPictures } from './Catalogue';
import { Queue } from './Queue';
import { transitionsChannels } from './channels';
import { SNAPSHOT } from './snapshot';
import { isStill } from '../../shell/still';

/**
 * The playlists application, on its own thread.
 *
 * The same shape as `NotesAppWorker`: plain classes wired together and
 * one call that publishes them. The catalogue starts on the committed
 * snapshot and asks Audius at once; the render worker sees the swap as
 * an ordinary patch. Nothing above `serveChannels` in this file's
 * imports touches the framework, so `AudiusApi`, `Catalogue` and
 * `Queue` are specified in bare vitest, and the wiring itself in
 * `channels.spec.ts` through `serveForTest`.
 *
 * In the playground's still mode it never asks: the screenshot gate
 * photographs this app, and a live copy changes under it (a play count
 * ticks over) or does not arrive at all. It shows the snapshot, without
 * the pictures, which are requests too. See `withoutPictures`.
 */
const still = isStill();
const catalogue = new Catalogue(new AudiusApi(), CURATED, still ? withoutPictures(SNAPSHOT) : SNAPSHOT);
const queue = new Queue(catalogue);
if (!still) {
  void catalogue.load();
}

serveChannels(transitionsChannels(catalogue, queue));
