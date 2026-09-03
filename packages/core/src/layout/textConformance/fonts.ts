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
export type ConformanceFontId = 'sans';

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
