import { formatClock } from './time';
import type { PlaylistView, TrackView } from './TransitionsContract';

export { formatClock };

/**
 * The slice of the Audius API the playlists app uses, and the shaping
 * of its answers into the contract's views.
 *
 * Plain code with one injectable `fetch`: it runs on the application
 * worker in the browser and under `vite-node` in `scripts/`, and its
 * specs run in node against canned responses. No framework import.
 *
 * Audius asks third-party apps to identify themselves, and `app_name`
 * is how an app without an API key does it; everything here is a GET
 * and every response probed for this example carried
 * `access-control-allow-origin: *`, including the redirect a stream
 * request answers with and the mp3 host it points at.
 */

export const AUDIUS_APP_NAME = 'gesso-playground';
/** Where the network's current API hosts are listed. */
export const AUDIUS_DISCOVERY = 'https://api.audius.co';
export const AUDIUS_SITE = 'https://audius.co';

/**
 * Artwork as Audius describes it: a url per size on the node that
 * answered, and the origins of the other nodes holding the same file.
 */
interface AudiusArtwork {
  readonly '150x150'?: string;
  readonly '480x480'?: string;
  readonly '1000x1000'?: string;
  readonly mirrors?: readonly string[];
}

/** The parts of an Audius user object that are read here. */
interface AudiusUser {
  readonly name: string;
  readonly profile_picture?: AudiusArtwork | null;
}

interface AudiusTrack {
  readonly id: string;
  readonly title: string;
  readonly duration: number;
  readonly permalink: string;
  readonly is_streamable?: boolean;
  readonly is_stream_gated?: boolean;
  readonly artwork?: AudiusArtwork | null;
  readonly user: AudiusUser;
}

interface AudiusPlaylist {
  readonly id: string;
  readonly playlist_name: string;
  readonly description?: string | null;
  readonly permalink: string;
  readonly total_play_count?: number;
  readonly created_at: string;
  readonly updated_at?: string;
  readonly user: AudiusUser;
  readonly tracks?: readonly AudiusTrack[];
}

interface Envelope<T> {
  readonly data: T;
}

export interface AudiusPlaylistResult {
  readonly playlist: PlaylistView;
  readonly tracks: readonly TrackView[];
}

export interface AudiusApiOptions {
  /** Injectable for specs. The platform's `fetch` by default. */
  readonly fetch?: typeof fetch;
  /** Skip discovery and talk to this host. */
  readonly host?: string;
  /** Read the clock; injectable so a spec can pin "this month". */
  readonly now?: () => number;
}

export class AudiusApi {
  private readonly fetchImpl: typeof fetch;
  private host: Promise<string> | null;

  constructor(options: AudiusApiOptions = {}) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.host = options.host === undefined ? null : Promise.resolve(options.host);
  }

  /**
   * The API host, discovered once and remembered.
   *
   * A failed discovery is not remembered, so the next call asks again
   * rather than failing for the life of the page.
   */
  discover(): Promise<string> {
    if (this.host === null) {
      this.host = this.get<Envelope<readonly string[]>>(AUDIUS_DISCOVERY).then(
        envelope => {
          const host = envelope.data[0];
          if (host === undefined) {
            throw new Error('Audius discovery returned no hosts.');
          }
          return host;
        },
        error => {
          this.host = null;
          throw error;
        }
      );
    }
    return this.host;
  }

  /** One playlist with its tracks, shaped for the card whose id is `cardId`. */
  async playlist(audiusId: string, cardId: string): Promise<AudiusPlaylistResult> {
    const host = await this.discover();
    const envelope = await this.get<Envelope<readonly AudiusPlaylist[]>>(
      `${host}/v1/playlists/${encodeURIComponent(audiusId)}?app_name=${AUDIUS_APP_NAME}`
    );
    const raw = envelope.data[0];
    if (raw === undefined) {
      throw new Error(`Audius has no playlist '${audiusId}'.`);
    }
    // The playlist object embeds its tracks today; the dedicated
    // endpoint is the documented way and the fallback.
    const rawTracks =
      raw.tracks ??
      (
        await this.get<Envelope<readonly AudiusTrack[]>>(
          `${host}/v1/playlists/${encodeURIComponent(audiusId)}/tracks?app_name=${AUDIUS_APP_NAME}`
        )
      ).data;
    const tracks = rawTracks.filter(playable).map(track => mapTrack(track, host));
    return { playlist: mapPlaylist(raw, cardId, tracks), tracks };
  }

  /** Ids of the playlists Audius finds for a query, best first. */
  async searchPlaylists(query: string): Promise<readonly string[]> {
    const host = await this.discover();
    const envelope = await this.get<Envelope<readonly AudiusPlaylist[]>>(
      `${host}/v1/playlists/search?query=${encodeURIComponent(query)}&app_name=${AUDIUS_APP_NAME}`
    );
    return envelope.data.map(playlist => playlist.id);
  }

  private async get<T>(url: string): Promise<T> {
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Audius answered ${response.status} ${response.statusText} for ${url}.`);
    }
    return (await response.json()) as T;
  }
}

/** Audius marks tracks it will not stream to anyone, and tracks it streams only to some. */
function playable(track: AudiusTrack): boolean {
  return track.is_streamable !== false && track.is_stream_gated !== true;
}

export function mapTrack(track: AudiusTrack, host: string): TrackView {
  return {
    id: track.id,
    title: track.title,
    artist: track.user.name,
    duration: formatClock(track.duration),
    seconds: track.duration,
    art: artworkUrls(track.artwork, '150x150'),
    url: `${AUDIUS_SITE}${track.permalink}`,
    stream: `${host}/v1/tracks/${encodeURIComponent(track.id)}/stream?app_name=${AUDIUS_APP_NAME}`
  };
}

export function mapPlaylist(playlist: AudiusPlaylist, cardId: string, tracks: readonly TrackView[]): PlaylistView {
  const seconds = tracks.reduce((total, track) => total + track.seconds, 0);
  return {
    id: cardId,
    title: playlist.playlist_name.trim(),
    description: (playlist.description ?? '').trim(),
    curator: { name: playlist.user.name, avatar: artworkUrls(playlist.user.profile_picture, '150x150') },
    date: formatMonth(playlist.updated_at ?? playlist.created_at),
    plays: formatCount(playlist.total_play_count ?? 0),
    time: formatSpan(seconds),
    trackCount: tracks.length,
    url: `${AUDIUS_SITE}${playlist.permalink}`
  };
}

/**
 * One picture at one size, as a url on every node that holds it: the
 * one Audius answered with first, then each mirror with the same path.
 * Audius's nodes come and go, and the one that served the response is
 * not always the one that will serve the file, so an `Image` given the
 * whole list can move on when the first does not answer.
 */
export function artworkUrls(artwork: AudiusArtwork | null | undefined, size: '150x150' | '480x480'): string[] {
  const primary = artwork?.[size];
  if (primary === undefined || primary === '') {
    return [];
  }
  const urls = [primary];
  let path: string;
  try {
    path = new URL(primary).pathname;
  } catch {
    return urls;
  }
  for (const mirror of artwork?.mirrors ?? []) {
    const candidate = `${mirror.replace(/\/+$/, '')}${path}`;
    if (!urls.includes(candidate)) {
      urls.push(candidate);
    }
  }
  return urls;
}

/** "1h 50m" or "48m", the way a playlist header writes a total. */
export function formatSpan(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** "119,356", in the reader's own grouping. */
export function formatCount(count: number): string {
  return new Intl.NumberFormat('en-US').format(count);
}

/** "April 2023" from an ISO timestamp. */
export function formatMonth(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}
