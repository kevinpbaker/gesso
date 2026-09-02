/**
 * The three cards' own design: colours, type and the photograph or clip
 * each one carries.
 *
 * What the cards say, their titles, curators, counts and tracks, comes
 * from Audius through the `Catalogue` channel, keyed by the same `id`.
 * This module holds only what a designer chose and a network cannot
 * supply, and it is kept apart for the reason every other example keeps
 * its data separate: the interesting part of this example is the motion,
 * and a reader looking for it should not have to scroll past a wall of
 * colours to reach it.
 */

export interface CardMedia {
  readonly kind: 'image' | 'video';
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export interface CardDesign {
  /** Matches `PlaylistView.id` and `CuratedCard.id`. */
  readonly id: string;
  readonly background: string;
  /** A repeating texture over the background, as the pink card has. */
  readonly backgroundImage?: string;
  readonly text: string;
  readonly secondaryText: string;
  readonly media: CardMedia;
}

export const CARDS: readonly CardDesign[] = [
  {
    id: '1',
    background: '#000000',
    text: '#ffffff',
    secondaryText: '#c3c3c3',
    media: { kind: 'image', url: '/transitions/sax-player.webp', width: 275, height: 360 }
  },
  {
    id: '2',
    background: '#ebd9ea',
    backgroundImage: '/transitions/pink-card-bg.png',
    text: '#8b689c',
    secondaryText: '#ab91b8',
    media: { kind: 'video', url: '/transitions/dancing-woman.mp4', width: 1280, height: 992 }
  },
  {
    id: '3',
    background: '#6d75ff',
    text: '#ffffff',
    secondaryText: '#e1e1e1',
    media: { kind: 'image', url: '/transitions/guitar-player.webp', width: 414, height: 360 }
  }
];

export function cardById(id: string): CardDesign {
  return CARDS.find(card => card.id === id) ?? CARDS[0]!;
}

/**
 * The icon paths, straight from Heroicons, in a 24-unit box, except
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
  pause:
    'M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 ' +
    '0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z',
  /** Two crossing arrows: Heroicons `arrows-right-left`, read here as shuffle. */
  shuffle: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
  check: 'M4.5 12.75l6 6 9-13.5',
  /** The outline heart, for a track that is not yet liked; `heart` below is the filled one. */
  heartOutline:
    'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 ' +
    '3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z',
  /** An arrow leaving a box: Heroicons `arrow-top-right-on-square`, for a link that leaves the app. */
  external:
    'M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 ' +
    '3m0 0h-5.25M21 3v5.25',
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
