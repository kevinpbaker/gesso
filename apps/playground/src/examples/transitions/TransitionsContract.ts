import { channel } from '@gesso/framework';
import { SNAPSHOT } from './snapshot';

/**
 * The barrier for the playlists app.
 *
 * Imported by the render worker and the application worker, and
 * holding nothing but names and shapes, exactly as `NotesContract`
 * does. Everything behind it, the Audius client, the fallback chain and
 * the shaping, is plain code the render worker never loads.
 *
 * Every string here is already formatted for the screen: a play count
 * with its thousands separators, a duration as "1h 50m", a date as a
 * month and a year. Formatting is presentation, and the view model on
 * the application side is the last place allowed to do it with the raw
 * number in hand; see `decisions/0030-thread-model.md` §3.
 */

/** Who made the playlist, as the card header shows them. */
export interface CuratorView {
  readonly name: string;
  /** A square picture at about 150px, or '' when the curator has none. */
  readonly avatar: string;
}

/**
 * What Audius knows about one of the three playlists. The card's own
 * design, its colours and its photograph, is not here: that is the
 * render side's and lives in `playlists.ts`, keyed by the same `id`.
 */
export interface PlaylistView {
  /** The card's id: '1', '2' or '3'. */
  readonly id: string;
  readonly title: string;
  /** The curator's own words, or '' when they wrote none. */
  readonly description: string;
  readonly curator: CuratorView;
  /** "April 2023": when the playlist was last changed. */
  readonly date: string;
  /** "119,356": how often its tracks have been played. */
  readonly plays: string;
  /** "1h 2m": the playable tracks end to end. */
  readonly time: string;
  readonly trackCount: number;
  /** The playlist's page on audius.co. */
  readonly url: string;
}

export interface TrackView {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  /** "4:11" */
  readonly duration: string;
  readonly seconds: number;
  /** Square artwork at 150px, or '' when the track has none. */
  readonly art: string;
  /** The track's page on audius.co. */
  readonly url: string;
  /** The mp3, behind a redirect the browser follows on its own. */
  readonly stream: string;
}

/**
 * Where the catalogue on screen came from.
 *
 *   - `snapshot`: the copy committed with the example, shown until the
 *     network answers. It is the channel's initial value, so the first
 *     frame has real titles on it and never a spinner.
 *   - `live`: Audius answered, for at least one playlist.
 *   - `offline`: every request failed; the snapshot stays, and the
 *     list says so in one quiet line.
 */
export type CatalogueSource = 'snapshot' | 'live' | 'offline';

export interface CatalogueView {
  readonly playlists: readonly PlaylistView[];
  /** Tracks by card id. */
  readonly tracks: Readonly<Record<string, readonly TrackView[]>>;
  readonly source: CatalogueSource;
}

export interface CatalogueCommands {
  /** Ask Audius again, after a failure. */
  reload(): void;
}

/**
 * `playlists` and `tracks` are separate keys because they change at
 * different sizes: a refreshed play count is one small patch, a
 * playlist's tracks are the large value, and one object holding both
 * would put the tracks through the differ for every count.
 */
export const Catalogue = channel<CatalogueView, CatalogueCommands>('catalogue', {
  playlists: SNAPSHOT.playlists,
  tracks: SNAPSHOT.tracks,
  source: 'snapshot'
});
