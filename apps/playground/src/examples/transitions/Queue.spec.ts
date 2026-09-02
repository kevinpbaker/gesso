import { describe, expect, it } from 'vitest';

import { Queue } from './Queue';
import type { TrackView } from './TransitionsContract';

function track(id: string): TrackView {
  return {
    id,
    title: id.toUpperCase(),
    artist: 'A',
    duration: '1:00',
    seconds: 60,
    art: [],
    url: '',
    stream: `${id}.mp3`
  };
}

const LIBRARY: Record<string, TrackView[]> = {
  '1': ['a', 'b', 'c', 'd'].map(track),
  '2': ['x', 'y'].map(track),
  '3': []
};
const source = { tracksFor: (id: string) => LIBRARY[id] ?? [] };

describe('Queue', () => {
  it('starts a playlist from its first track, or from the track pressed', () => {
    const queue = new Queue(source);
    expect(queue.current.current).toBeNull();

    queue.play({ playlistId: '1' });
    expect(queue.current).toMatchObject({ playlistId: '1', order: ['a', 'b', 'c', 'd'], index: 0 });
    expect(queue.current.current?.stream).toBe('a.mp3');

    queue.play({ playlistId: '1', trackId: 'c' });
    expect(queue.current.index).toBe(2);
    expect(queue.current.current?.id).toBe('c');

    queue.play({ playlistId: '3' });
    expect(queue.current.playlistId).toBe('1');
  });

  it('steps forward and back, and finishes at the end', () => {
    const queue = new Queue(source);
    queue.play({ playlistId: '2' });
    queue.previous();
    expect(queue.current.index).toBe(0);
    queue.next();
    expect(queue.current.current?.id).toBe('y');
    queue.next();
    expect(queue.current).toMatchObject({ index: -1, current: null, playlistId: '2' });
    queue.next();
    expect(queue.current.index).toBe(-1);
  });

  it('shuffles what is still to come, keeps the current track, and unshuffles back to the list', () => {
    const queue = new Queue(source, () => 0);
    queue.play({ playlistId: '1', trackId: 'b' });
    queue.toggleShuffle();
    expect(queue.current.shuffled).toBe(true);
    expect(queue.current.order[0]).toBe('a');
    expect(queue.current.order[1]).toBe('b');
    expect(queue.current.index).toBe(1);
    expect([...queue.current.order].sort()).toEqual(['a', 'b', 'c', 'd']);

    queue.toggleShuffle();
    expect(queue.current).toMatchObject({ shuffled: false, order: ['a', 'b', 'c', 'd'], index: 1 });
  });

  it('shuffle set before anything plays starts the next playlist shuffled from the pressed track', () => {
    const queue = new Queue(source, () => 0.99);
    queue.toggleShuffle();
    queue.play({ playlistId: '1', trackId: 'c' });
    expect(queue.current.order[0]).toBe('c');
    expect(queue.current.index).toBe(0);
    expect([...queue.current.order].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('slots a track in after the current one, moving it if it was already queued', () => {
    const queue = new Queue(source);
    queue.play({ playlistId: '1' });
    queue.playNext('d');
    expect(queue.current.order).toEqual(['a', 'd', 'b', 'c']);
    queue.next();
    expect(queue.current.current?.id).toBe('d');
  });

  it('keeps likes and saves, and toggles them off again', () => {
    const queue = new Queue(source);
    queue.toggleLikeTrack('a');
    queue.toggleLikeTrack('b');
    queue.toggleLikeTrack('a');
    queue.toggleLikePlaylist('2');
    queue.toggleSavedPlaylist('1');
    expect(queue.current).toMatchObject({ likedTracks: ['b'], likedPlaylists: ['2'], savedPlaylists: ['1'] });
  });
});
