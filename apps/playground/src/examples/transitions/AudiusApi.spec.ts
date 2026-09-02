import { describe, expect, it, vi } from 'vitest';

import { AudiusApi, formatClock, formatCount, formatMonth, formatSpan, mapPlaylist, mapTrack } from './AudiusApi';

const HOST = 'https://api.example.test';

function user(name: string, avatar?: string) {
  return { name, profile_picture: avatar === undefined ? null : { '150x150': avatar } };
}

function track(id: string, title: string, seconds: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    title,
    duration: seconds,
    permalink: `/artist/${id}`,
    is_streamable: true,
    is_stream_gated: false,
    artwork: { '150x150': `https://cdn.example.test/${id}.jpg` },
    user: user('Artist'),
    ...extra
  };
}

/** A fetch that answers from a table of url substrings, and records what it was asked. */
function fakeFetch(answers: Record<string, unknown>) {
  const calls: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(answers).find(candidate => url.includes(candidate));
    if (key === undefined) {
      return new Response('nope', { status: 404, statusText: 'Not Found' });
    }
    return new Response(JSON.stringify(answers[key]), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe('AudiusApi', () => {
  it('discovers a host once and asks it for a playlist with its tracks', async () => {
    const { impl, calls } = fakeFetch({
      'api.audius.co': { data: [HOST] },
      '/v1/playlists/abc?': {
        data: [
          {
            id: 'abc',
            playlist_name: ' Deep House ',
            description: 'Vibes\n',
            permalink: '/dj/playlist/deep-house',
            total_play_count: 96690,
            created_at: '2024-01-05T00:00:00Z',
            updated_at: '2025-07-09T10:00:00Z',
            user: user('DreamEater', 'https://cdn.example.test/dj.jpg'),
            tracks: [
              track('t1', 'One', 270),
              track('t2', 'Gated', 100, { is_stream_gated: true }),
              track('t3', 'Three', 200)
            ]
          }
        ]
      }
    });
    const api = new AudiusApi({ fetch: impl });

    const result = await api.playlist('abc', '1');
    await api.playlist('abc', '1');

    expect(calls.filter(url => url === 'https://api.audius.co')).toHaveLength(1);
    expect(result.playlist).toEqual({
      id: '1',
      title: 'Deep House',
      description: 'Vibes',
      curator: { name: 'DreamEater', avatar: 'https://cdn.example.test/dj.jpg' },
      date: 'July 2025',
      plays: '96,690',
      time: '8m',
      trackCount: 2,
      url: 'https://audius.co/dj/playlist/deep-house'
    });
    expect(result.tracks.map(entry => entry.id)).toEqual(['t1', 't3']);
    expect(result.tracks[0]).toEqual({
      id: 't1',
      title: 'One',
      artist: 'Artist',
      duration: '4:30',
      seconds: 270,
      art: 'https://cdn.example.test/t1.jpg',
      url: 'https://audius.co/artist/t1',
      stream: `${HOST}/v1/tracks/t1/stream?app_name=gesso-playground`
    });
  });

  it('falls back to the tracks endpoint when the playlist does not embed them', async () => {
    const { impl } = fakeFetch({
      '/v1/playlists/abc?': {
        data: [{ id: 'abc', playlist_name: 'P', permalink: '/p', created_at: '2024-01-05T00:00:00Z', user: user('U') }]
      },
      '/v1/playlists/abc/tracks': { data: [track('t9', 'Nine', 60)] }
    });
    const api = new AudiusApi({ fetch: impl, host: HOST });

    const result = await api.playlist('abc', '2');

    expect(result.tracks.map(entry => entry.title)).toEqual(['Nine']);
    expect(result.playlist.time).toBe('1m');
  });

  it('rejects when the playlist is missing, and forgets a failed discovery', async () => {
    const { impl, calls } = fakeFetch({ '/v1/playlists/abc?': { data: [] } });
    const api = new AudiusApi({ fetch: impl });

    await expect(api.discover()).rejects.toThrow();
    await expect(api.discover()).rejects.toThrow();
    expect(calls.filter(url => url === 'https://api.audius.co')).toHaveLength(2);

    const pinned = new AudiusApi({ fetch: impl, host: HOST });
    await expect(pinned.playlist('abc', '1')).rejects.toThrow("no playlist 'abc'");
    await expect(pinned.playlist('missing', '1')).rejects.toThrow('404');
  });

  it('searches playlists and returns their ids in order', async () => {
    const { impl, calls } = fakeFetch({ '/v1/playlists/search': { data: [{ id: 'x' }, { id: 'y' }] } });
    const api = new AudiusApi({ fetch: impl, host: HOST });

    expect(await api.searchPlaylists('deep house')).toEqual(['x', 'y']);
    expect(calls[0]).toContain('query=deep%20house');
  });
});

describe('formatting', () => {
  it('writes clocks, spans, counts and months the way the screen shows them', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3599.6)).toBe('60:00');
    expect(formatSpan(2501)).toBe('42m');
    expect(formatSpan(6634)).toBe('1h 51m');
    expect(formatCount(6948)).toBe('6,948');
    expect(formatMonth('2023-04-07T07:09:45Z')).toBe('April 2023');
    expect(formatMonth('not a date')).toBe('');
  });

  it('maps a track without artwork or a curator without a picture to empty strings', () => {
    const mapped = mapTrack({ ...track('t', 'T', 10), artwork: null }, HOST);
    expect(mapped.art).toBe('');
    const playlist = mapPlaylist(
      { id: 'p', playlist_name: 'P', permalink: '/p', created_at: '2024-02-01T00:00:00Z', user: user('U') },
      '3',
      []
    );
    expect(playlist.curator.avatar).toBe('');
    expect(playlist.description).toBe('');
    expect(playlist.plays).toBe('0');
    expect(playlist.date).toBe('February 2024');
  });
});
