import { BehaviorSubject, type Observable } from 'rxjs';

import type { QueueView, TrackView } from './TransitionsContract';

/** Where the queue finds a playlist's tracks; `Catalogue` is the real one. */
export interface TrackSource {
  tracksFor(playlistId: string): readonly TrackView[];
}

const EMPTY: QueueView = {
  playlistId: null,
  order: [],
  index: -1,
  current: null,
  shuffled: false,
  likedTracks: [],
  likedPlaylists: [],
  savedPlaylists: []
};

/**
 * The play order, the current track, and the library of likes and
 * saves. Plain code on the application thread; the specs run in node.
 *
 * It knows nothing about sound. `current` changing is the whole of its
 * output to the player, and `next()` is the whole of the player's
 * input to it when a track ends. Shuffle keeps the current track where
 * it is and reorders what follows, so pressing it never interrupts
 * anything.
 */
export class Queue {
  private readonly subject = new BehaviorSubject<QueueView>(EMPTY);
  private readonly tracks: TrackSource;
  private readonly random: () => number;

  readonly view: Observable<QueueView> = this.subject.asObservable();

  constructor(tracks: TrackSource, random: () => number = Math.random) {
    this.tracks = tracks;
    this.random = random;
  }

  get current(): QueueView {
    return this.subject.value;
  }

  play(target: { readonly playlistId: string; readonly trackId?: string }): void {
    const tracks = this.tracks.tracksFor(target.playlistId);
    if (tracks.length === 0) {
      return;
    }
    const ids = tracks.map(track => track.id);
    const start = target.trackId !== undefined && ids.includes(target.trackId) ? target.trackId : ids[0]!;
    const order = this.current.shuffled ? [start, ...this.shuffle(ids.filter(id => id !== start))] : ids;
    this.set({ playlistId: target.playlistId, order, index: order.indexOf(start) });
  }

  next(): void {
    const { index, order } = this.current;
    if (index < 0) {
      return;
    }
    this.set({ index: index + 1 < order.length ? index + 1 : -1 });
  }

  previous(): void {
    const { index } = this.current;
    if (index <= 0) {
      return;
    }
    this.set({ index: index - 1 });
  }

  playNext(trackId: string): void {
    const { index, order, playlistId } = this.current;
    if (index < 0 || playlistId === null) {
      return;
    }
    const rest = order.filter((id, at) => at <= index || id !== trackId);
    rest.splice(index + 1, 0, trackId);
    this.set({ order: rest });
  }

  toggleShuffle(): void {
    const { shuffled, index, order } = this.current;
    if (index < 0) {
      this.set({ shuffled: !shuffled });
      return;
    }
    const currentId = order[index]!;
    if (shuffled) {
      // Back to the playlist's own order, keeping our place in it.
      const natural = this.tracks.tracksFor(this.current.playlistId!).map(track => track.id);
      const restored = natural.length > 0 ? natural : order;
      this.set({ shuffled: false, order: restored, index: Math.max(0, restored.indexOf(currentId)) });
      return;
    }
    const played = order.slice(0, index);
    const upcoming = this.shuffle(order.slice(index + 1));
    this.set({ shuffled: true, order: [...played, currentId, ...upcoming], index });
  }

  toggleLikeTrack(trackId: string): void {
    this.set({ likedTracks: toggled(this.current.likedTracks, trackId) });
  }

  toggleLikePlaylist(playlistId: string): void {
    this.set({ likedPlaylists: toggled(this.current.likedPlaylists, playlistId) });
  }

  toggleSavedPlaylist(playlistId: string): void {
    this.set({ savedPlaylists: toggled(this.current.savedPlaylists, playlistId) });
  }

  private set(changes: Partial<Omit<QueueView, 'current'>>): void {
    const next = { ...this.current, ...changes };
    const id = next.index >= 0 ? next.order[next.index] : undefined;
    const current =
      id === undefined || next.playlistId === null
        ? null
        : (this.tracks.tracksFor(next.playlistId).find(track => track.id === id) ?? null);
    this.subject.next({ ...next, current });
  }

  private shuffle(ids: readonly string[]): string[] {
    const out = [...ids];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
}

function toggled(list: readonly string[], id: string): readonly string[] {
  return list.includes(id) ? list.filter(entry => entry !== id) : [...list, id];
}
