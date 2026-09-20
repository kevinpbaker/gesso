import { afterEach, describe, expect, it } from 'vitest';

import { serveForTest, type ServedForTest } from 'gesso-testing';

import type { AudiusApi, AudiusPlaylistResult } from './AudiusApi';
import { Catalogue } from './Catalogue';
import { Queue } from './Queue';
import { SNAPSHOT } from './snapshot';
import { Catalogue as CatalogueChannel, Queue as QueueChannel } from './TransitionsContract';
import { transitionsChannels } from './channels';

/** An Audius that answers every playlist with a two-track copy of the snapshot's first. */
function offlineApi(): AudiusApi {
  return {
    playlist: async (_audiusId: string, cardId: string): Promise<AudiusPlaylistResult> => {
      const playlist = { ...SNAPSHOT.playlists[0]!, id: cardId, title: `Live ${cardId}` };
      const tracks = (SNAPSHOT.tracks['1'] ?? []).slice(0, 2);
      return { playlist, tracks };
    },
    searchPlaylists: async () => []
  } as unknown as AudiusApi;
}

describe('the playlists app, served over its channels', () => {
  let served: ServedForTest | undefined;
  afterEach(() => {
    served?.dispose();
    served = undefined;
  });

  it('publishes the live catalogue as patches, and a play command comes back as a current track', async () => {
    const catalogue = new Catalogue(offlineApi());
    const queue = new Queue(catalogue);
    served = serveForTest(transitionsChannels(catalogue, queue));
    const catalog = served.get(CatalogueChannel);
    const player = served.get(QueueChannel);

    // Before anything arrives the replica already holds the snapshot.
    expect(catalog.view.source.value).toBe('snapshot');
    expect(catalog.view.playlists.value.map(playlist => playlist.title)).toEqual(
      SNAPSHOT.playlists.map(playlist => playlist.title)
    );

    await catalogue.load();
    await served.settle(() => catalog.view.source.value === 'live');
    expect(catalog.view.playlists.value.map(playlist => playlist.title)).toEqual(['Live 1', 'Live 2', 'Live 3']);
    expect(catalog.view.tracks.value['2']).toHaveLength(2);

    player.send.play({ playlistId: '2' });
    await served.settle(() => player.view.current.value !== null);
    expect(player.view.playlistId.value).toBe('2');
    expect(player.view.current.value?.id).toBe(catalog.view.tracks.value['2']![0]!.id);

    player.send.toggleLikeTrack(player.view.current.value!.id);
    player.send.next();
    await served.settle(() => player.view.index.value === 1);
    expect(player.view.likedTracks.value).toHaveLength(1);
    expect(served.errors).toEqual([]);
  });
});
