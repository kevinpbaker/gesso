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
 * number in hand.
 */

/** Who made the playlist, as the card header shows them. */
export interface CuratorView {
  readonly name: string;
  /**
   * The curator's picture at about 150px, as urls on every mirror Audius
   * lists for it, best first; empty when the curator has none. Several
   * because the network's nodes are not all up at once, and an `Image`
   * given the list tries them in order.
   */
  readonly avatar: readonly string[];
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
  /** Square artwork at 150px, on every mirror Audius lists, best first; empty when the track has none. */
  readonly art: readonly string[];
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

/**
 * What is queued to play, and what the person has liked and saved.
 *
 * Whether sound is coming out is *not* here: that is the shell's
 * element, reported through `AudioService` on the render thread. The
 * queue only says which track is current and what comes after it, and
 * the render thread's player glue turns a change of `current` into a
 * load. Likes and saves live here rather than in a module on the
 * render side because they are application state that outlives a
 * screen, which is what this thread is for.
 */
export interface QueueView {
  /** The card whose tracks are queued, or null when nothing is. */
  readonly playlistId: string | null;
  /** Track ids in the order they will play. */
  readonly order: readonly string[];
  /** Index into `order`, or -1 when the queue is empty or finished. */
  readonly index: number;
  /** The track at `index`, flattened for the screen. */
  readonly current: TrackView | null;
  readonly shuffled: boolean;
  /** Ids of liked tracks. */
  readonly likedTracks: readonly string[];
  /** Card ids of liked playlists. */
  readonly likedPlaylists: readonly string[];
  /** Card ids of playlists saved to the library. */
  readonly savedPlaylists: readonly string[];
}

export interface QueueCommands {
  /** Queue a playlist and start it, from a given track or from its first. */
  play(target: { readonly playlistId: string; readonly trackId?: string }): void;
  /** Advance; at the end the queue finishes and `current` becomes null. */
  next(): void;
  /** Step back; at the first track it stays there. */
  previous(): void;
  /** Slot a track in straight after the current one. */
  playNext(trackId: string): void;
  /** Flip shuffle; a queue already playing is reordered from the current track on. */
  toggleShuffle(): void;
  toggleLikeTrack(trackId: string): void;
  toggleLikePlaylist(playlistId: string): void;
  toggleSavedPlaylist(playlistId: string): void;
}

export const Queue = channel<QueueView, QueueCommands>('queue', {
  playlistId: null,
  order: [],
  index: -1,
  current: null,
  shuffled: false,
  likedTracks: [],
  likedPlaylists: [],
  savedPlaylists: []
});
