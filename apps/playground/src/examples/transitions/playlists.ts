/**
 * The three playlists, ported from the reference app's `data.json`.
 *
 * Kept as plain data in its own module for the reason every other
 * example here keeps its data separate: the interesting part of this
 * example is the motion, and a reader looking for it should not have
 * to scroll past a wall of colours and captions to reach it.
 */

export interface PlaylistMedia {
  readonly kind: 'image' | 'video';
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export interface Playlist {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly user: { readonly avatar: string; readonly name: string; readonly date: string };
  readonly stats: { readonly count: string; readonly time: string };
  readonly background: string;
  /** A repeating texture over the background, as the pink card has. */
  readonly backgroundImage?: string;
  readonly text: string;
  readonly secondaryText: string;
  readonly media: PlaylistMedia;
}

export const PLAYLISTS: readonly Playlist[] = [
  {
    id: '1',
    title: 'Saxophone House',
    description:
      'Most popular Saxophone House playlist on Spotify since 2013 | Updated weekly | Good vibes only | ' +
      'Photo by Atikh Bana',
    user: { avatar: '/transitions/user-avatar.webp', name: 'Annabelle Lucero', date: 'March 2023' },
    stats: { count: '9,838', time: '5h 22m' },
    background: '#000000',
    text: '#ffffff',
    secondaryText: '#c3c3c3',
    media: { kind: 'image', url: '/transitions/sax-player.webp', width: 275, height: 360 }
  },
  {
    id: '2',
    title: 'Feel-Good Indie Rock',
    description: 'The best indie rock vibes — classic and current. Headphones on | Video by Anna Shvets on pexels.com',
    user: { avatar: '/transitions/user-avatar-2.webp', name: 'Jessica Houston', date: 'February 2023' },
    stats: { count: '12,502', time: '4h 18m' },
    background: '#ebd9ea',
    backgroundImage: '/transitions/pink-card-bg.png',
    text: '#8b689c',
    secondaryText: '#ab91b8',
    media: { kind: 'video', url: '/transitions/dancing-woman.mp4', width: 1280, height: 992 }
  },
  {
    id: '3',
    title: 'Peaceful Guitar',
    description: 'Unwind to these calm classical guitar pieces. Photo by Te NGuyen on Unsplash',
    user: { avatar: '/transitions/user-avatar-3.webp', name: 'David Hickman', date: 'December 2022' },
    stats: { count: '8,908', time: '6h 40m' },
    background: '#6d75ff',
    text: '#ffffff',
    secondaryText: '#e1e1e1',
    media: { kind: 'image', url: '/transitions/guitar-player.webp', width: 414, height: 360 }
  }
];

export function playlistById(id: string): Playlist {
  return PLAYLISTS.find(playlist => playlist.id === id) ?? PLAYLISTS[0]!;
}

export interface Track {
  readonly title: string;
  readonly artist: string;
  readonly art: string;
}

const TRACK_SET: readonly Track[] = [
  { title: 'Sthlm Sunset', artist: 'Ehrling', art: '/transitions/album1.webp' },
  { title: 'Living For Love', artist: 'TWOPILOTS, Natty Rico', art: '/transitions/album2.webp' },
  { title: 'Madan (King)', artist: 'Bakermat', art: '/transitions/album3.webp' },
  { title: 'All the Time', artist: 'Max the Sax', art: '/transitions/album4.webp' },
  { title: 'Maasai', artist: 'Axero', art: '/transitions/album5.webp' },
  { title: 'Love Or Hate Me', artist: 'Charleon', art: '/transitions/album6.webp' }
];

/** Twelve rows, as the reference has: the six above, twice. */
export const TRACKS: readonly Track[] = [...TRACK_SET, ...TRACK_SET];

/**
 * The icon paths, straight from Heroicons, in a 24-unit box — except
 * `gessoStroke`, which is the brand mark's and is drawn in 64.
 *
 * Inline rather than in an asset because that is what `Icon` takes: a
 * path string it rasterises. See `IconRasterizer`.
 */
export const ICONS = {
  plus: 'M12 4.5v15m7.5-7.5h-15',
  back: 'M15.75 19.5L8.25 12l7.5-7.5',
  bars:
    'M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 ' +
    '1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75zM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 ' +
    '1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 01-1.875-1.875V8.625zM3 ' +
    '13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 ' +
    '1.875h-.75A1.875 1.875 0 013 19.875v-6.75z',
  clock:
    'M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 ' +
    '2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z',
  play: 'M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z',
  ban: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  thumbsUp:
    'M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 016 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23h-.777z',
  download:
    'M10.5 3.75a6 6 0 00-5.98 6.496A5.25 5.25 0 006.75 20.25H18a4.5 4.5 0 002.206-8.423 3.75 3.75 0 ' +
    '00-4.133-4.303A6.001 6.001 0 0010.5 3.75zm2.25 6a.75.75 0 00-1.5 0v4.94l-1.72-1.72a.75.75 0 ' +
    '00-1.06 1.06l3 3a.75.75 0 001.06 0l3-3a.75.75 0 10-1.06-1.06l-1.72 1.72V9.75z',
  ellipsis:
    'M4.5 12a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm6 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm6 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z',
  heart:
    'M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 ' +
    '2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 ' +
    '2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 ' +
    '01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z',
  /**
   * The chalk stroke of the Gesso mark, copied from `brand/gesso-mark.svg`.
   *
   * The square it sits on is not here, because a two-colour mark is
   * two nodes: see `BrandMark`. The path is authored in the mark's
   * `64 x 64` box, not the 24 the icons above use.
   */
  gessoStroke: 'M0 40H16V28H32V16H48V4H64V24H48V36H32V48H16V60H0Z'
} as const;
