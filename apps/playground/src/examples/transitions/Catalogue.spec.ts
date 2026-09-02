import { describe, expect, it, vi } from 'vitest';

import type { AudiusApi, AudiusPlaylistResult } from './AudiusApi';
import { Catalogue, type CuratedCard } from './Catalogue';
import { SNAPSHOT } from './snapshot';
import type { PlaylistView, TrackView } from './TransitionsContract';

const CARDS: readonly CuratedCard[] = [
  { id: '1', audiusId: 'a1', query: 'one' },
  { id: '2', audiusId: 'a2', query: 'two' }
];

function result(cardId: string, title: string, trackCount = 1): AudiusPlaylistResult {
  const tracks: TrackView[] = Array.from({ length: trackCount }, (_, index) => ({
    id: `${cardId}-${index}`,
    title: `Track ${index}`,
    artist: 'A',
    duration: '1:00',
    seconds: 60,
    art: '',
    url: '',
    stream: ''
  }));
  const playlist: PlaylistView = {
    id: cardId,
    title,
    description: '',
    curator: { name: 'C', avatar: '' },
    date: 'May 2026',
    plays: '1',
    time: '1m',
    trackCount,
    url: ''
  };
  return { playlist, tracks };
}

function fakeApi(playlist: (audiusId: string, cardId: string) => Promise<AudiusPlaylistResult>, search?: string[]) {
  return {
    playlist: vi.fn(playlist),
    searchPlaylists: vi.fn(async () => search ?? [])
  } as unknown as AudiusApi & { playlist: ReturnType<typeof vi.fn>; searchPlaylists: ReturnType<typeof vi.fn> };
}

function latest<T>(observable: { subscribe(next: (value: T) => void): { unsubscribe(): void } }): T {
  let value: T | undefined;
  observable.subscribe(next => (value = next)).unsubscribe();
  return value as T;
}

describe('Catalogue', () => {
  it('starts on the snapshot and swaps to the live playlists in one update', async () => {
    const api = fakeApi(async (audiusId, cardId) => result(cardId, `Live ${audiusId}`));
    const catalogue = new Catalogue(api, CARDS);
    const sources: string[] = [];
    catalogue.source.subscribe(source => sources.push(source));
    const playlistUpdates: number[] = [];
    catalogue.playlists.subscribe(list => playlistUpdates.push(list.length));

    expect(latest(catalogue.playlists)).toBe(SNAPSHOT.playlists);
    await catalogue.load();

    expect(latest(catalogue.playlists).map(playlist => playlist.title)).toEqual(['Live a1', 'Live a2']);
    expect(Object.keys(latest(catalogue.tracks))).toEqual(['1', '2']);
    expect(sources).toEqual(['snapshot', 'live']);
    // The snapshot, then the live list: never a list with one of each.
    expect(playlistUpdates).toEqual([SNAPSHOT.playlists.length, 2]);
  });

  it('searches when the curated playlist is gone or empty, and keeps the snapshot entry when that fails too', async () => {
    const api = fakeApi(
      async (audiusId, cardId) => {
        if (audiusId === 'a1') {
          throw new Error('gone');
        }
        if (audiusId === 'a2') {
          return result(cardId, 'Empty', 0);
        }
        if (audiusId === 'found') {
          return result(cardId, 'Found');
        }
        throw new Error('unknown');
      },
      ['nothing', 'found']
    );
    const catalogue = new Catalogue(api, CARDS);

    await catalogue.load();

    const titles = latest(catalogue.playlists).map(playlist => playlist.title);
    expect(titles).toEqual(['Found', 'Found']);
    expect(api.searchPlaylists).toHaveBeenCalledWith('one');
    expect(api.searchPlaylists).toHaveBeenCalledWith('two');
    expect(latest(catalogue.source)).toBe('live');
  });

  it('reports offline and leaves the snapshot in place when nothing answers', async () => {
    const api = fakeApi(async () => {
      throw new Error('no network');
    });
    const catalogue = new Catalogue(api, CARDS);

    await catalogue.load();

    expect(latest(catalogue.playlists)).toBe(SNAPSHOT.playlists);
    expect(latest(catalogue.tracks)).toBe(SNAPSHOT.tracks);
    expect(latest(catalogue.source)).toBe('offline');
  });

  it('keeps a snapshot card beside live ones when only that card failed', async () => {
    const api = fakeApi(async (_audiusId, cardId) => {
      if (cardId === '2') {
        throw new Error('gone');
      }
      return result(cardId, 'Live');
    });
    const catalogue = new Catalogue(api, CARDS);

    await catalogue.load();

    const list = latest(catalogue.playlists);
    expect(list[0]?.title).toBe('Live');
    expect(list[1]).toBe(SNAPSHOT.playlists.find(playlist => playlist.id === '2'));
    expect(latest(catalogue.source)).toBe('live');
  });

  it('shares one load between concurrent callers', async () => {
    const api = fakeApi(async (_audiusId, cardId) => result(cardId, 'Live'));
    const catalogue = new Catalogue(api, CARDS);

    await Promise.all([catalogue.load(), catalogue.load()]);

    expect(api.playlist).toHaveBeenCalledTimes(2);
  });
});
