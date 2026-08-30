/**
 * Enough of Source Map v3 to turn a compiled stack frame back into the
 * line somebody wrote.
 *
 * Written here rather than taken from npm for the reason the rest of
 * the repository's tooling gives (`scripts/gen-layout-fixtures.ts`,
 * `scripts/check-webgpu-parity.ts`): the whole of what this package
 * needs is a VLQ decoder and a binary search, and a dependency that
 * ships a `SourceMapConsumer` with a WASM payload is a heavier thing to
 * put in front of a developer trying to read an error than the error
 * was.
 *
 * Two deliberate omissions. Index maps (`sections`) are not read — no
 * bundler this project builds with emits one. Names are not read
 * either: a stack frame already carries the function name the engine
 * knew, and the mapped name is only occasionally better.
 */

/** A source map as a bundler writes it. */
export interface SourceMapV3 {
  version: number;
  file?: string;
  sourceRoot?: string;
  sources: (string | null)[];
  sourcesContent?: (string | null)[];
  names?: string[];
  mappings: string;
}

/** Where a generated position came from, with 1-based line and column. */
export interface OriginalPosition {
  /** The source as the map names it, with `sourceRoot` already applied. */
  source: string;
  line: number;
  column: number;
}

/**
 * One decoded mapping segment.
 *
 * Held as a flat tuple rather than an object because a map for a
 * medium application has hundreds of thousands of them, and they exist
 * only to be searched.
 */
type Segment = [generatedColumn: number, sourceIndex: number, sourceLine: number, sourceColumn: number];

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Character code → 6-bit value, with -1 for anything not base64. */
const BASE64_VALUE: Int8Array = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < BASE64.length; i++) {
    table[BASE64.charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * Decodes the `mappings` string into one array of segments per
 * generated line.
 *
 * Segments carrying only a generated column — a run of output with no
 * original position, which is what a bundler emits for code it
 * synthesised — are dropped rather than kept with nulls. A lookup that
 * lands in one should fall back to the nearest earlier real mapping,
 * and dropping them is how that happens without a second case.
 */
export function decodeMappings(mappings: string): Segment[][] {
  const lines: Segment[][] = [];
  let line: Segment[] = [];
  let sourceIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  let generatedColumn = 0;
  const fields: number[] = [];
  let index = 0;

  while (index < mappings.length) {
    const char = mappings[index];
    if (char === ';') {
      lines.push(line);
      line = [];
      generatedColumn = 0;
      index++;
      continue;
    }
    if (char === ',') {
      index++;
      continue;
    }

    fields.length = 0;
    while (index < mappings.length && mappings[index] !== ',' && mappings[index] !== ';') {
      let value = 0;
      let shift = 1;
      let digit: number;
      do {
        const code = mappings.charCodeAt(index);
        digit = code < 128 ? BASE64_VALUE[code] : -1;
        if (digit < 0) {
          // A malformed map is not worth a thrown error inside an error
          // reporter: the caller falls back to the raw stack.
          return lines;
        }
        index++;
        value += (digit & 31) * shift;
        shift *= 32;
      } while ((digit & 32) !== 0);
      fields.push(value % 2 === 1 ? -Math.floor(value / 2) : Math.floor(value / 2));
    }

    generatedColumn += fields[0];
    if (fields.length >= 4) {
      sourceIndex += fields[1];
      sourceLine += fields[2];
      sourceColumn += fields[3];
      line.push([generatedColumn, sourceIndex, sourceLine, sourceColumn]);
    }
  }
  lines.push(line);
  return lines;
}

/**
 * A decoded map, answering "which line of which source is this?".
 *
 * Decoding is done once in the constructor because a page that shows
 * one error usually shows several from the same file, and each of them
 * asks about a handful of positions.
 */
export class SourceMapConsumer {
  private readonly lines: Segment[][];
  private readonly sources: string[];
  private readonly contents: (string | null)[];

  constructor(map: SourceMapV3) {
    this.lines = decodeMappings(map.mappings);
    const root = map.sourceRoot ?? '';
    this.sources = map.sources.map(source => joinSourceRoot(root, source ?? '<unknown>'));
    this.contents = map.sourcesContent ?? [];
  }

  /**
   * Maps a generated position — 1-based line and column, as every
   * engine writes them in a stack — back to an original one.
   *
   * Returns the last mapping at or before the column, which is the
   * definition of a source map's coverage: a mapping holds until the
   * next one starts. Null when the line has no mappings at all.
   */
  lookup(line: number, column: number): OriginalPosition | null {
    const segments = this.lines[line - 1];
    if (segments === undefined || segments.length === 0) {
      return null;
    }
    const target = column - 1;
    let low = 0;
    let high = segments.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (segments[middle][0] <= target) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    // Before the first mapping on the line: the first one is still the
    // best answer available, and it is the right one for a frame whose
    // column the engine reported at the statement rather than the call.
    const segment = segments[found === -1 ? 0 : found];
    const source = this.sources[segment[1]];
    if (source === undefined) {
      return null;
    }
    return { source, line: segment[2] + 1, column: segment[3] + 1 };
  }

  /** The original text of a source, when the map inlined it. */
  contentFor(source: string): string | null {
    const index = this.sources.indexOf(source);
    if (index === -1) {
      return null;
    }
    return this.contents[index] ?? null;
  }
}

/**
 * The `sourceMappingURL` a script declares, or null.
 *
 * The last one wins, and the search is a `lastIndexOf` over the whole
 * text rather than a regex over the tail: an inlined map is a single
 * comment megabytes long, so "near the end" is not where its opening
 * is.
 */
export function parseSourceMappingUrl(script: string): string | null {
  const marker = '//# sourceMappingURL=';
  const start = script.lastIndexOf(marker);
  if (start === -1) {
    return null;
  }
  const from = start + marker.length;
  const end = script.indexOf('\n', from);
  const url = (end === -1 ? script.slice(from) : script.slice(from, end)).trim();
  return url === '' ? null : url;
}

/** Reads a `data:` URL's payload, base64 or percent-encoded. */
function decodeDataUrl(url: string): string | null {
  const comma = url.indexOf(',');
  if (comma === -1) {
    return null;
  }
  const meta = url.slice(0, comma);
  const payload = url.slice(comma + 1);
  if (!meta.includes(';base64')) {
    return decodeURIComponent(payload);
  }
  const binary = atob(payload);
  // The map is JSON, and JSON is UTF-8: `atob` gives bytes, and a
  // source path with a non-ASCII character would otherwise come out
  // mojibake.
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/** Applies `sourceRoot`, which is a prefix and not a URL join. */
function joinSourceRoot(root: string, source: string): string {
  if (root === '' || /^[a-z]+:\/\//i.test(source)) {
    return source;
  }
  return root.endsWith('/') ? `${root}${source}` : `${root}/${source}`;
}

/**
 * Fetches and caches the map for each script a stack mentions.
 *
 * Every method resolves rather than rejects: this runs while
 * something has already gone wrong, and an overlay that throws while
 * explaining a throw is worse than an overlay showing a raw stack.
 * A script with no map, a map that 404s and a map that is not JSON all
 * come back as null, and the caller shows what the engine gave it.
 */
export class SourceMapStore {
  private readonly cache = new Map<string, Promise<SourceMapConsumer | null>>();
  private readonly load: (url: string) => Promise<string>;

  constructor(load: (url: string) => Promise<string> = defaultLoad) {
    this.load = load;
  }

  /** The consumer for a script URL, fetched at most once per store. */
  consumerFor(scriptUrl: string): Promise<SourceMapConsumer | null> {
    const cached = this.cache.get(scriptUrl);
    if (cached !== undefined) {
      return cached;
    }
    const pending = this.resolve(scriptUrl).catch(() => null);
    this.cache.set(scriptUrl, pending);
    return pending;
  }

  private async resolve(scriptUrl: string): Promise<SourceMapConsumer | null> {
    const script = await this.load(scriptUrl);
    const mapUrl = parseSourceMappingUrl(script);
    if (mapUrl === null) {
      return null;
    }
    const json = mapUrl.startsWith('data:')
      ? decodeDataUrl(mapUrl)
      : await this.load(new URL(mapUrl, scriptUrl).toString());
    if (json === null) {
      return null;
    }
    const map = JSON.parse(json) as SourceMapV3;
    if (typeof map.mappings !== 'string' || !Array.isArray(map.sources)) {
      return null;
    }
    return new SourceMapConsumer(map);
  }
}

async function defaultLoad(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
}
