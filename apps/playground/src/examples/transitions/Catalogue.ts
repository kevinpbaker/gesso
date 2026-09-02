import { BehaviorSubject, type Observable } from 'rxjs';

import type { AudiusApi, AudiusPlaylistResult } from './AudiusApi';
import { SNAPSHOT } from './snapshot';
import type { CatalogueSource, PlaylistView, TrackView } from './TransitionsContract';

/**
 * Which Audius playlist stands behind each card, and what to search for
 * if it has gone.
 *
 * Chosen by hand for the card's mood, on 2026-09-01, from playlists whose
 * tracks were all streamable and ungated. A curated playlist can be
 * emptied or deleted by its owner, which is what `query` is for; the
 * snapshot is the last resort after that.
 */
export interface CuratedCard {
  readonly id: string;
  readonly audiusId: string;
  readonly query: string;
}

export const CURATED: readonly CuratedCard[] = [
  { id: '1', audiusId: '1jWbwGy', query: 'deep house' },
  { id: '2', audiusId: 'BJwxAbA', query: 'indie rock' },
  { id: '3', audiusId: 'LKpEw', query: 'classical guitar' }
];

/**
 * The three playlists, from Audius when it answers and from the
 * committed snapshot when it does not.
 *
 * Starts on the snapshot, so the screen has real titles from its first
 * frame, and moves to the live copy in one update rather than a card at
 * a time, so the list never shows two sources at once. A card whose
 * every fallback failed keeps its snapshot entry; `source` reports
 * `live` if any card came from the network and `offline` if none did.
 */
export class Catalogue {
  private readonly playlistsSubject = new BehaviorSubject<readonly PlaylistView[]>(SNAPSHOT.playlists);
  private readonly tracksSubject = new BehaviorSubject<Readonly<Record<string, readonly TrackView[]>>>(SNAPSHOT.tracks);
  private readonly sourceSubject = new BehaviorSubject<CatalogueSource>('snapshot');
  private readonly api: AudiusApi;
  private readonly cards: readonly CuratedCard[];
  private loading: Promise<void> | null = null;

  readonly playlists: Observable<readonly PlaylistView[]> = this.playlistsSubject.asObservable();
  readonly tracks: Observable<Readonly<Record<string, readonly TrackView[]>>> = this.tracksSubject.asObservable();
  readonly source: Observable<CatalogueSource> = this.sourceSubject.asObservable();

  constructor(api: AudiusApi, cards: readonly CuratedCard[] = CURATED) {
    this.api = api;
    this.cards = cards;
  }

  /** Asks Audius for every card. One load at a time; a second call joins the first. */
  load(): Promise<void> {
    if (this.loading === null) {
      this.loading = this.fetchAll().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  private async fetchAll(): Promise<void> {
    const results = await Promise.all(this.cards.map(card => this.fetchCard(card)));
    const playlists: PlaylistView[] = [];
    const tracks: Record<string, readonly TrackView[]> = {};
    let live = 0;
    for (const [index, card] of this.cards.entries()) {
      const result = results[index];
      if (result === null) {
        const fallback = SNAPSHOT.playlists.find(playlist => playlist.id === card.id);
        if (fallback !== undefined) {
          playlists.push(fallback);
          tracks[card.id] = SNAPSHOT.tracks[card.id] ?? [];
        }
        continue;
      }
      live++;
      playlists.push(result.playlist);
      tracks[card.id] = result.tracks;
    }
    if (live === 0) {
      this.sourceSubject.next('offline');
      return;
    }
    this.playlistsSubject.next(playlists);
    this.tracksSubject.next(tracks);
    this.sourceSubject.next('live');
  }

  /**
   * The curated playlist, else the best search result with any playable
   * tracks, else nothing. Every failure is swallowed here on purpose:
   * the caller has a snapshot for exactly this case, and a rejected
   * promise would say less than the `source` key does.
   */
  private async fetchCard(card: CuratedCard): Promise<AudiusPlaylistResult | null> {
    try {
      const curated = await this.api.playlist(card.audiusId, card.id);
      if (curated.tracks.length > 0) {
        return curated;
      }
    } catch {
      // Fall through to the search.
    }
    let found: readonly string[];
    try {
      found = await this.api.searchPlaylists(card.query);
    } catch {
      return null;
    }
    for (const audiusId of found.slice(0, 3)) {
      try {
        const result = await this.api.playlist(audiusId, card.id);
        if (result.tracks.length > 0) {
          return result;
        }
      } catch {
        // This candidate is gone too; try the next.
      }
    }
    return null;
  }
}
