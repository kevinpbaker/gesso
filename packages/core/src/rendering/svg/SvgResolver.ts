import { parseSvg, type SvgDocument } from './SvgDocument';

/**
 * Turns an SVG source into a read document, as `ImageResolver` turns a
 * picture's into a bitmap: fetched once, read once, shared by every
 * node that shows it.
 */
export interface SvgResolver {
  /** The read document, or a rejection when it will not fetch or is not SVG. */
  resolve(source: string): Promise<SvgDocument>;
  /** The document when it has already been read, so a node built in this frame draws it at once. */
  peek?(source: string): SvgDocument | null;
}

export interface DefaultSvgResolverOptions {
  /** How many read files to keep. They are small: a tree of elements, no pixels. */
  capacity?: number;
  /** Injectable for specs, and for an app that fetches through its own stack. */
  fetch?: (source: string) => Promise<string>;
}

/**
 * Whether a source is an SVG file, from its name or its data URL's
 * type: what `Image` asks before it decodes, since the platform
 * decoder refuses SVG and this one draws it.
 */
export function isSvgSource(source: string): boolean {
  if (/^data:image\/svg\+xml[;,]/i.test(source)) {
    return true;
  }
  const path = source.split(/[?#]/)[0] ?? '';
  return /\.svgz?$/i.test(path);
}

const DEFAULT_CAPACITY = 64;

/**
 * Fetch, read, keep.
 *
 * Kept by recency and never closed, unlike a bitmap: a read file holds
 * no decoded pixels, so there is nothing to release promptly, and a
 * file a screen shows a hundred times (an icon in every row) is read
 * once. A failed fetch is not kept, so the next node tries again.
 */
export class DefaultSvgResolver implements SvgResolver {
  private readonly entries = new Map<string, Promise<SvgDocument>>();
  private readonly settled = new Map<string, SvgDocument>();
  private readonly capacity: number;
  private readonly fetchText: (source: string) => Promise<string>;

  constructor(options: DefaultSvgResolverOptions = {}) {
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
    this.fetchText = options.fetch ?? defaultFetch;
  }

  resolve(source: string): Promise<SvgDocument> {
    const existing = this.entries.get(source);
    if (existing !== undefined) {
      // Most recently used last, so the oldest is first to go.
      this.entries.delete(source);
      this.entries.set(source, existing);
      return existing;
    }
    const entry = this.fetchText(source)
      .then(text => {
        const document = parseSvg(text);
        if (this.entries.get(source) === entry) {
          this.settled.set(source, document);
        }
        return document;
      })
      .catch((error: unknown) => {
        if (this.entries.get(source) === entry) {
          this.entries.delete(source);
        }
        throw error;
      });
    entry.catch(() => {});
    this.entries.set(source, entry);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
      this.settled.delete(oldest);
    }
    return entry;
  }

  peek(source: string): SvgDocument | null {
    return this.settled.get(source) ?? null;
  }
}

async function defaultFetch(source: string): Promise<string> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Fetching the SVG '${source}' failed with ${response.status} ${response.statusText}.`);
  }
  return response.text();
}
