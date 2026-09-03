/**
 * The real fonts the text conformance fixtures are rendered in.
 *
 * Unlike Ahem, these are not vendored: a Latin face is half a megabyte
 * and a CJK collection is nineteen, and the fixtures do not need the
 * files at test time. The generator finds each face on the machine it
 * runs on, serves it to Chrome from a `file:` URL, and stamps the
 * file's name, size and hash into `expected.json`. The spec replays
 * the run widths Chrome's canvas measured, so it passes on a machine
 * with no fonts at all; only regeneration needs them, exactly as it
 * needs a local Chrome.
 *
 * Each face is declared under a private family name so that nothing
 * installed on the machine can be substituted for it silently: if the
 * file did not load, `document.fonts.check` says so and the generator
 * refuses to write fixtures.
 */
export type ConformanceFontId = 'sans' | 'cjk' | 'arabic' | 'hebrew' | 'devanagari' | 'thai' | 'emoji';

export interface ConformanceFont {
  readonly id: ConformanceFontId;
  /** The CSS family name the page declares; private on purpose. */
  readonly family: string;
  /** The face the cases were written for. */
  readonly face: string;
  /** Environment variable that names the file explicitly. */
  readonly env: string;
  /** Where the file has been found; `~` expands to the home directory. */
  readonly candidates: readonly string[];
}

export const conformanceFonts: readonly ConformanceFont[] = [
  {
    id: 'sans',
    family: 'Gesso Conformance Sans',
    face: 'Noto Sans Regular',
    env: 'GESSO_FONT_SANS',
    candidates: [
      '/usr/share/fonts/noto/NotoSans-Regular.ttf',
      '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
      '/usr/share/fonts/google-noto/NotoSans-Regular.ttf',
      '/usr/share/fonts/TTF/NotoSans-Regular.ttf',
      '~/Library/Fonts/NotoSans-Regular.ttf',
      '/Library/Fonts/NotoSans-Regular.ttf'
    ]
  },
  {
    id: 'cjk',
    family: 'Gesso Conformance CJK',
    // A TrueType collection; Chrome takes its first face, which is the
    // Japanese one. Every ideograph and kana in it is one em wide.
    face: 'Noto Sans CJK JP Regular',
    env: 'GESSO_FONT_CJK',
    candidates: [
      '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc',
      '~/Library/Fonts/NotoSansCJK-Regular.ttc'
    ]
  },
  {
    id: 'arabic',
    family: 'Gesso Conformance Arabic',
    face: 'Noto Sans Arabic Regular',
    env: 'GESSO_FONT_ARABIC',
    candidates: [
      '/usr/share/fonts/noto/NotoSansArabic-Regular.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf',
      '/usr/share/fonts/google-noto/NotoSansArabic-Regular.ttf',
      '~/Library/Fonts/NotoSansArabic-Regular.ttf'
    ]
  },
  {
    id: 'hebrew',
    family: 'Gesso Conformance Hebrew',
    face: 'Noto Sans Hebrew Regular',
    env: 'GESSO_FONT_HEBREW',
    candidates: [
      '/usr/share/fonts/noto/NotoSansHebrew-Regular.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansHebrew-Regular.ttf',
      '/usr/share/fonts/google-noto/NotoSansHebrew-Regular.ttf',
      '~/Library/Fonts/NotoSansHebrew-Regular.ttf'
    ]
  },
  {
    id: 'devanagari',
    family: 'Gesso Conformance Devanagari',
    face: 'Noto Sans Devanagari Regular',
    env: 'GESSO_FONT_DEVANAGARI',
    candidates: [
      '/usr/share/fonts/noto/NotoSansDevanagari-Regular.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf',
      '/usr/share/fonts/google-noto/NotoSansDevanagari-Regular.ttf',
      '~/Library/Fonts/NotoSansDevanagari-Regular.ttf'
    ]
  },
  {
    id: 'thai',
    family: 'Gesso Conformance Thai',
    face: 'Noto Sans Thai Regular',
    env: 'GESSO_FONT_THAI',
    candidates: [
      '/usr/share/fonts/noto/NotoSansThai-Regular.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf',
      '/usr/share/fonts/google-noto/NotoSansThai-Regular.ttf',
      '~/Library/Fonts/NotoSansThai-Regular.ttf'
    ]
  },
  {
    id: 'emoji',
    family: 'Gesso Conformance Emoji',
    // A colour (CBDT) font, ten megabytes; served by URL like the rest.
    face: 'Noto Color Emoji',
    env: 'GESSO_FONT_EMOJI',
    candidates: [
      '/usr/share/fonts/noto/NotoColorEmoji.ttf',
      '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',
      '/usr/share/fonts/google-noto-emoji/NotoColorEmoji.ttf',
      '~/Library/Fonts/NotoColorEmoji.ttf'
    ]
  }
];

export function conformanceFont(id: ConformanceFontId): ConformanceFont {
  const font = conformanceFonts.find(candidate => candidate.id === id);
  if (font === undefined) {
    throw new Error(`No conformance font is called '${id}'.`);
  }
  return font;
}

/** The family as it appears in a CSS `font` shorthand: quoted, because the names have spaces. */
export function cssFamily(id: ConformanceFontId): string {
  return `"${conformanceFont(id).family}"`;
}

/** A font-family list for a case's faces, first face first. */
export function cssFamilyList(ids: readonly ConformanceFontId[]): string {
  return ids.map(cssFamily).join(', ');
}
