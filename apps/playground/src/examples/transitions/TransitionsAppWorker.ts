import { serveChannels } from '@gesso/framework';
import { AudiusApi } from './AudiusApi';
import { Catalogue } from './Catalogue';
import { Queue } from './Queue';
import { transitionsChannels } from './channels';

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
 */
const catalogue = new Catalogue(new AudiusApi());
const queue = new Queue(catalogue);
void catalogue.load();

serveChannels(transitionsChannels(catalogue, queue));
