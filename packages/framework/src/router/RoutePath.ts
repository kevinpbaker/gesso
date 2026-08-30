/**
 * Paths, patterns and the params inside them.
 *
 * A pattern is a path with `:name` in the places that vary:
 * `/mail/:folder/:id`. Nothing else is special — no regular
 * expressions, no optional segments, no repeats. That is deliberate:
 * every extra form is one more thing the type below has to model, and
 * a pattern whose params the compiler cannot name is a pattern that
 * gives up the one thing this router is for.
 *
 * A trailing `/*` is the exception, and only because a layout route
 * has to be able to say "and anything below me". It captures the rest
 * of the path as `rest`.
 */

/** One piece of a parsed pattern. */
export type PatternSegment =
  | { readonly kind: 'static'; readonly text: string }
  | { readonly kind: 'param'; readonly name: string }
  | { readonly kind: 'rest' };

/**
 * The params a pattern declares, as a type.
 *
 * `RouteParams<'/mail/:folder/:id'>` is `{ folder: string; id: string }`,
 * so `router.go(MailItem, { folder: 'inbox', id: '2' })` is checked, a
 * misspelled param is a compile error, and a missing one is too. This
 * is the whole reason routes are declared with full paths rather than
 * relative fragments: a relative fragment knows only its own segments,
 * and the params a screen actually receives include its parents'.
 */
export type RouteParams<Path extends string> = Prettify<ParamsOf<Path>>;

type ParamsOf<Path extends string> = Path extends `${infer Head}/${infer Rest}`
  ? ParamOfSegment<Head> & ParamsOf<Rest>
  : ParamOfSegment<Path>;

type ParamOfSegment<Segment extends string> = Segment extends `:${infer Name}`
  ? { [K in Name]: string }
  : Segment extends '*'
    ? { rest: string }
    : {};

/** Flattens an intersection so hovering a param object shows its keys. */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/** True when the pattern declares no params, so `go()` may omit them. */
export type HasNoParams<Path extends string> = keyof ParamsOf<Path> extends never ? true : false;

/**
 * Splits a path into its segments, ignoring leading, trailing and
 * doubled slashes so `/mail/`, `mail` and `//mail` are one path.
 */
export function pathSegments(path: string): string[] {
  return path.split('/').filter(segment => segment.length > 0);
}

/** Parses a pattern once, at declaration time. */
export function parsePattern(pattern: string): PatternSegment[] {
  return pathSegments(pattern).map((segment, index, all) => {
    if (segment === '*') {
      if (index !== all.length - 1) {
        throw new Error(`Route pattern '${pattern}' has '*' before its last segment; a rest may only end a pattern.`);
      }
      return { kind: 'rest' as const };
    }
    if (segment.startsWith(':')) {
      const name = segment.slice(1);
      if (name.length === 0) {
        throw new Error(`Route pattern '${pattern}' has an unnamed ':' segment.`);
      }
      return { kind: 'param' as const, name };
    }
    return { kind: 'static' as const, text: segment };
  });
}

/**
 * Matches a parsed pattern against a path's segments.
 *
 * Returns the captured params, or null when the pattern does not
 * describe this path. An exact match is required: a pattern with
 * three segments does not match a path with four unless it ends in a
 * rest.
 */
export function matchPattern(
  segments: readonly PatternSegment[],
  path: readonly string[]
): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    if (segment.kind === 'rest') {
      params.rest = path.slice(index).join('/');
      return params;
    }
    const value = path[index];
    if (value === undefined) {
      return null;
    }
    if (segment.kind === 'static') {
      if (segment.text !== value) {
        return null;
      }
      continue;
    }
    params[segment.name] = decodeURIComponent(value);
  }
  return path.length === segments.length ? params : null;
}

/**
 * Fills a pattern's params back in, which is what makes a link out of
 * a route and a params object.
 */
export function buildPath(pattern: string, params: Readonly<Record<string, string>> = {}): string {
  const parts = parsePattern(pattern).map(segment => {
    if (segment.kind === 'static') {
      return segment.text;
    }
    if (segment.kind === 'rest') {
      return params.rest ?? '';
    }
    const value = params[segment.name];
    if (value === undefined) {
      throw new Error(`Route '${pattern}' needs a '${segment.name}' param.`);
    }
    return encodeURIComponent(value);
  });
  const path = parts.filter(part => part.length > 0).join('/');
  return `/${path}`;
}

/** A url split into the path the routes match and the query they carry. */
export interface ParsedUrl {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
}

/**
 * Splits a url into path and query.
 *
 * Any hash is dropped: the shell decides whether the fragment is where
 * the app's url lives (see `shellHistory`), and by the time a url
 * reaches the router that decision has already been unwound.
 */
export function parseUrl(url: string): ParsedUrl {
  const withoutHash = url.split('#')[0] ?? '';
  const [rawPath = '', rawQuery = ''] = splitOnce(withoutHash, '?');
  const query: Record<string, string> = {};
  for (const pair of rawQuery.split('&')) {
    if (pair.length === 0) {
      continue;
    }
    const [key = '', value = ''] = splitOnce(pair, '=');
    query[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return { path: `/${pathSegments(rawPath).join('/')}`, query };
}

/** Joins a path and a query back into the url the history stores. */
export function formatUrl(path: string, query: Readonly<Record<string, string>> = {}): string {
  const pairs = Object.entries(query).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  const normalized = `/${pathSegments(path).join('/')}`;
  return pairs.length === 0 ? normalized : `${normalized}?${pairs.join('&')}`;
}

function splitOnce(text: string, separator: string): [string, string] {
  const index = text.indexOf(separator);
  return index === -1 ? [text, ''] : [text.slice(0, index), text.slice(index + separator.length)];
}
