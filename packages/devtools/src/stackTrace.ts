import type { OriginalPosition, SourceMapStore } from './sourceMap';

/** A position in a compiled file, 1-based as every engine reports it. */
export interface StackLocation {
  url: string;
  line: number;
  column: number;
}

/** One line of a stack, parsed as far as it could be. */
export interface StackFrame {
  /** The line exactly as the engine wrote it. */
  raw: string;
  /** The function name the engine knew, or null for an anonymous frame. */
  fn: string | null;
  /** Where it ran, or null when the line named no file. */
  location: StackLocation | null;
  /** Where it was written, once a source map has been consulted. */
  original: OriginalPosition | null;
}

/**
 * `at fn (url:line:col)`, `at url:line:col`, and the `fn@url:line:col`
 * that Firefox and Safari write.
 *
 * Three engines write three formats and there is no standard, so this
 * is deliberately loose: anything ending in `:digits:digits` is a
 * location, and whatever came before it is a name. A line that does
 * not match is kept as `raw` and shown unparsed rather than dropped —
 * a `[native code]` or `eval` frame is still evidence.
 */
const CHROME_FRAME = /^\s*at\s+(?:(?<fn>.*?)\s+\()?(?<url>.+?):(?<line>\d+):(?<column>\d+)\)?\s*$/;
const MOZILLA_FRAME = /^(?<fn>[^@]*)@(?<url>.+?):(?<line>\d+):(?<column>\d+)\s*$/;

/**
 * Splits a stack string into frames, dropping the message lines an
 * engine puts above them.
 *
 * The message is dropped rather than parsed because the caller already
 * has it: `onError` reports the message and the stack separately, and
 * a V8 stack repeats the message in its first line.
 */
export function parseStack(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const raw of stack.split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      continue;
    }
    const match = CHROME_FRAME.exec(line) ?? MOZILLA_FRAME.exec(line);
    if (match?.groups === undefined) {
      // Only once frames have started: everything above the first one
      // is the message, and repeating it under itself is noise.
      if (frames.length > 0) {
        frames.push({ raw: line.trim(), fn: null, location: null, original: null });
      }
      continue;
    }
    const { fn, url, line: lineNumber, column } = match.groups;
    const name = fn === undefined ? '' : fn.trim();
    frames.push({
      raw: line.trim(),
      fn: name === '' || name === 'Object.<anonymous>' ? null : name,
      location: { url, line: Number(lineNumber), column: Number(column) },
      original: null
    });
  }
  return frames;
}

/**
 * Fills in `original` for every frame whose script has a source map.
 *
 * Maps are fetched once per script and the frames of one stack usually
 * name two or three scripts, so this is a couple of requests. It never
 * rejects: a frame that cannot be mapped keeps its compiled location,
 * which is what the console would have shown anyway.
 */
export async function mapStack(frames: StackFrame[], store: SourceMapStore): Promise<StackFrame[]> {
  return Promise.all(
    frames.map(async frame => {
      if (frame.location === null) {
        return frame;
      }
      const consumer = await store.consumerFor(frame.location.url);
      if (consumer === null) {
        return frame;
      }
      const original = consumer.lookup(frame.location.line, frame.location.column);
      return original === null ? frame : { ...frame, original };
    })
  );
}

/**
 * The first frame worth putting a code frame under.
 *
 * Frames inside the framework are skipped while any application frame
 * remains, because an error thrown from a component surfaces through
 * several layers of runtime and the runtime is almost never where the
 * bug is. If every frame is a framework frame, the first one wins —
 * the framework is then genuinely the answer.
 */
export function primaryFrame(frames: StackFrame[]): StackFrame | null {
  const located = frames.filter(frame => frame.location !== null);
  if (located.length === 0) {
    return null;
  }
  const application = located.find(frame => {
    const path = frame.original?.source ?? frame.location?.url ?? '';
    return !/(^|\/)(node_modules|packages\/(core|framework|components))\//.test(path);
  });
  return application ?? located[0];
}

/**
 * A path short enough to read in a header: same-origin prefix and
 * query string removed, `node_modules` collapsed to the package.
 *
 * The query matters more than it looks. A dev server rewrites imports
 * with cache-busting parameters — `/src/App.tsx?t=1724965201` — and a
 * stack full of those is unreadable for a reason that has nothing to
 * do with the error.
 */
export function shortenPath(url: string, origin?: string): string {
  let path = url;
  if (origin !== undefined && path.startsWith(origin)) {
    path = path.slice(origin.length);
  }
  const query = path.indexOf('?');
  if (query !== -1) {
    path = path.slice(0, query);
  }
  const modules = path.lastIndexOf('/node_modules/');
  if (modules !== -1) {
    path = path.slice(modules + '/node_modules/'.length);
  }
  return path.replace(/^\/@fs/, '').replace(/^\.\//, '');
}

/** `path:line:column` for a frame, mapped when it could be. */
export function formatFrame(frame: StackFrame, origin?: string): string {
  if (frame.original !== null) {
    return `${shortenPath(frame.original.source, origin)}:${frame.original.line}:${frame.original.column}`;
  }
  if (frame.location !== null) {
    return `${shortenPath(frame.location.url, origin)}:${frame.location.line}:${frame.location.column}`;
  }
  return frame.raw;
}
