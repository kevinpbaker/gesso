/**
 * The page `check-video-decode.ts` drives.
 *
 * Everything the documentation says only a browser can answer happens
 * here: a real `.mp4` is fetched, the demuxer walks its real sample
 * tables, and a real `VideoDecoder` turns the result into pictures.
 * Nothing below asserts — the script reads `window.videoCheck` and
 * does that — because a failure is much easier to read as a value than
 * as an exception thrown inside a headless browser.
 *
 * **It is a matrix over where the bytes came from**, because that is
 * the part a unit test cannot reach and the part an application will
 * actually vary. A clip served from the same origin, one handed over
 * as a `blob:` URL, one inlined as a `data:` URL and one fetched
 * across an origin are four different fetch paths, and only the first
 * two of them were ever exercised by anything here. The interesting
 * result is not that they all decode — they do — but which of them
 * can be read in ranges, which is a property of the *transport* and
 * not of this framework: a `blob:` URL ignores a `Range` header and
 * answers 200 with the whole body, and a reader that believed the
 * response was the range it asked for would index into the wrong
 * bytes. So the ranged pass asks, checks for a 206, and says so.
 */
// By path rather than by name: this fixture lives at the repository
// root, where vite serves it, and the root's `node_modules` carries no
// link to the workspace packages. The source rather than a build, so
// what is exercised is the same module graph the unit tests run
// against.
import {
  canDecodeVideo,
  DefaultVideoResolver,
  type RangeResponse,
  type VideoPlayback
} from '../../../packages/core/src/index.ts';

/** Served by vite out of the playground's public directory. */
const CLIP = '/apps/playground/public/transitions/motion-loop.mp4';

/** Where the second origin is; the script puts the port in the query string. */
const CROSS_ORIGIN = new URL(location.href).searchParams.get('crossOrigin');

interface SourceReport {
  name: string;
  ok: boolean;
  error?: string;
  duration?: number;
  width?: number;
  height?: number;
  frameDurationMs?: number;
  /** How many distinct pictures reached the surface over the first second. */
  picturesDrawn?: number;
  /** Whether anything was ever on the surface. */
  drewSomething?: boolean;
  /** Whether seeking to four fifths in changed the picture, and how long it took. */
  seekChangedPicture?: boolean;
  seekMs?: number;
  /** The ranged pass, where the transport allowed one. */
  ranged?: {
    supported: boolean;
    why?: string;
    duration?: number;
    drewSomething?: boolean;
    requests?: number;
    /** Bytes actually transferred, against the whole file's length. */
    bytesFetched?: number;
    fileBytes?: number;
  };
}

interface Result {
  ok: boolean;
  canDecode: boolean;
  error?: string;
  sources: SourceReport[];
}

/** Lets a decoded frame actually arrive: the decoder is asynchronous. */
function settle(ms = 16): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Plays the first second, seeks near the end, and says what was drawn. */
async function exercise(playback: VideoPlayback, report: SourceReport): Promise<void> {
  report.duration = playback.duration;
  report.width = playback.width;
  report.height = playback.height;
  report.frameDurationMs = playback.frameDurationMs;

  const seen = new Set<number>();
  for (let at = 0; at < 1000; at += playback.frameDurationMs) {
    playback.present(at);
    await settle(16);
    seen.add(playback.surface.version);
  }
  // The assertion the docs page says nothing measures: that a frame
  // decoded at all, and that new ones keep arriving rather than one
  // picture being presented over and over.
  report.picturesDrawn = seen.size;
  report.drewSomething = playback.surface.frame !== null;

  // And a seek, which is the thing that cannot be faked: landing on
  // the keyframe before the target, decoding forward through it, and
  // showing one picture rather than the whole gap.
  const before = playback.surface.version;
  const startedAt = performance.now();
  playback.present(playback.duration * 1000 * 0.8);
  // Polled rather than slept on. The first version of this waited a
  // flat 500ms and then measured, which reported 505ms every time for
  // every source: it was timing the sleep, not the seek.
  const deadline = startedAt + 5000;
  while (playback.surface.version === before && performance.now() < deadline) {
    await settle(8);
  }
  report.seekMs = Math.round(performance.now() - startedAt);
  report.seekChangedPicture = playback.surface.version > before;
}

/**
 * Reads the same clip in ranges, if the transport will serve them.
 *
 * A `blob:` or `data:` URL will not: `fetch` ignores the header and
 * answers the whole body with a 200, which is not a failure of
 * anything here but does mean a ranged read would be reading the wrong
 * bytes. Detected rather than assumed, and reported either way.
 */
async function exerciseRanged(url: string, report: SourceReport): Promise<void> {
  let requests = 0;
  let bytesFetched = 0;
  let fileBytes = 0;
  let refused: string | null = null;

  const resolver = new DefaultVideoResolver({
    fetchRange: async (source: string, start: number, end: number): Promise<RangeResponse> => {
      requests++;
      const response = await fetch(source, { headers: { Range: `bytes=${start}-${end - 1}` } });
      const data = await response.arrayBuffer();
      bytesFetched += data.byteLength;
      if (response.status !== 206) {
        refused ??= `The server answered ${response.status} rather than 206, so ranges are not honoured here.`;
      }
      const contentRange = response.headers.get('Content-Range');
      const total = contentRange === null ? data.byteLength : Number(contentRange.slice(contentRange.indexOf('/') + 1));
      fileBytes = Math.max(fileBytes, total);
      return { data, total };
    }
  });

  try {
    const playback = await resolver.resolve(url);
    if (refused !== null) {
      report.ranged = { supported: false, why: refused, requests, fileBytes };
      resolver.dispose();
      return;
    }
    playback.present(0);
    const waitUntil = performance.now() + 5000;
    while (playback.surface.frame === null && performance.now() < waitUntil) {
      await settle(8);
    }
    report.ranged = {
      supported: true,
      duration: playback.duration,
      drewSomething: playback.surface.frame !== null,
      requests,
      bytesFetched,
      fileBytes
    };
  } catch (error: unknown) {
    report.ranged = {
      supported: false,
      why: refused ?? (error instanceof Error ? error.message : String(error)),
      requests,
      fileBytes
    };
  } finally {
    resolver.dispose();
  }
}

async function bytesOf(url: string): Promise<ArrayBuffer> {
  return (await fetch(url)).arrayBuffer();
}

function base64Of(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Chunked, because spreading four hundred thousand arguments into
  // `fromCharCode` overflows the call stack.
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

/** The ways an application might hand this framework the same clip. */
async function sources(): Promise<{ name: string; url: string; revoke?: () => void }[]> {
  const list: { name: string; url: string; revoke?: () => void }[] = [{ name: 'local asset on the server', url: CLIP }];

  const buffer = await bytesOf(CLIP);

  const blob = new Blob([buffer], { type: 'video/mp4' });
  const blobUrl = URL.createObjectURL(blob);
  list.push({ name: 'blob: URL', url: blobUrl, revoke: () => URL.revokeObjectURL(blobUrl) });

  list.push({ name: 'data: URL', url: `data:video/mp4;base64,${base64Of(buffer)}` });

  if (CROSS_ORIGIN !== null) {
    list.push({ name: 'cross-origin URL with CORS', url: `${CROSS_ORIGIN}/motion-loop.mp4` });
  }

  return list;
}

async function run(): Promise<Result> {
  if (!canDecodeVideo()) {
    return { ok: false, canDecode: false, error: 'This browser has no WebCodecs VideoDecoder.', sources: [] };
  }

  const reports: SourceReport[] = [];
  for (const source of await sources()) {
    const report: SourceReport = { name: source.name, ok: false };
    reports.push(report);
    const resolver = new DefaultVideoResolver();
    try {
      const playback = await resolver.resolve(source.url);
      await exercise(playback, report);
      report.ok = report.drewSomething === true;
    } catch (error: unknown) {
      report.error = error instanceof Error ? error.message : String(error);
    } finally {
      resolver.dispose();
    }
    await exerciseRanged(source.url, report);
    source.revoke?.();
  }

  return { ok: reports.every(report => report.ok), canDecode: true, sources: reports };
}

run()
  .then(result => {
    (window as unknown as { videoCheck: Result }).videoCheck = result;
  })
  .catch((error: unknown) => {
    (window as unknown as { videoCheck: Result }).videoCheck = {
      ok: false,
      canDecode: false,
      sources: [],
      error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
    };
  });
