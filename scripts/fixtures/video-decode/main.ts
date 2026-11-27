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
 *
 * **And a second matrix over what the bytes are.** The first one plays
 * one H.264 clip four ways; the playground's fixtures
 * (`scripts/gen-video-fixtures.sh`) are the other axis: the same
 * picture as VP9 and as AV1, whose codec strings are assembled from a
 * `vpcC` and an `av1C`; as a fragmented file, read from its `moof`s;
 * with its `moov` at the end; long, with two-second groups of
 * pictures; and with an AAC track beside it. Each is played, seeked
 * and read in ranges from this server exactly as the local asset is.
 *
 * Whether a browser *has* a decoder for a codec is a fact about the
 * browser, so each format first asks `VideoDecoder.isConfigSupported`
 * with the configuration the demuxer read, and a format the browser
 * cannot decode is reported as that rather than played. Which is also
 * where a codec string this framework assembled wrongly would show up,
 * so the scripts decide which browsers must support which codecs.
 */
// By path rather than by name: this fixture lives at the repository
// root, where vite serves it, and the root's `node_modules` carries no
// link to the workspace packages. The source rather than a build, so
// what is exercised is the same module graph the unit tests run
// against.
import {
  canDecodeVideo,
  DefaultVideoResolver,
  demuxMp4Audio,
  demuxMp4Video,
  type RangeResponse,
  type VideoPlayback
} from '../../../packages/core/src/index.ts';

/** Served by vite out of the playground's public directory. */
const CLIP = '/apps/playground/public/transitions/motion-loop.mp4';

/** Where the playground's codec and container fixtures are served from. */
const FIXTURES = '/apps/playground/public/video';

/**
 * What each fixture is, as `scripts/gen-video-fixtures.sh` builds it,
 * so the scripts compare what was read against the file rather than
 * against a default. All of them are `testsrc2` at 480x270 and 24
 * frames a second.
 */
const FORMATS: readonly Omit<FormatReport, 'ok'>[] = [
  { name: 'H.264, moov first', file: 'clip.mp4', family: 'avc1', expected: { durationSeconds: 6 } },
  { name: 'H.264, moov last', file: 'clip-moov-last.mp4', family: 'avc1', expected: { durationSeconds: 6 } },
  { name: 'H.264, fragmented', file: 'clip-fragmented.mp4', family: 'avc1', expected: { durationSeconds: 6 } },
  { name: 'H.264, 30s, 2s GOP', file: 'clip-long.mp4', family: 'avc1', expected: { durationSeconds: 30 } },
  {
    name: 'H.264 with AAC',
    file: 'clip-audio.mp4',
    family: 'avc1',
    expected: { durationSeconds: 6, audioCodec: 'mp4a.40.2' }
  },
  { name: 'VP9', file: 'clip-vp9.mp4', family: 'vp09', expected: { durationSeconds: 6 } },
  { name: 'AV1', file: 'clip-av1.mp4', family: 'av01', expected: { durationSeconds: 6 } }
];

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
  /** How long the first picture took to reach the surface, in milliseconds. */
  firstPictureMs?: number;
  /** How many distinct pictures reached the surface in the second after the first one. */
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
    /**
     * Set when the transport did honour ranges and reading the clip
     * from them still failed: a failure here, not a fact about the
     * transport, and reported apart from `why` so nobody reads one as
     * the other.
     */
    error?: string;
    duration?: number;
    drewSomething?: boolean;
    requests?: number;
    /** Bytes actually transferred, against the whole file's length. */
    bytesFetched?: number;
    fileBytes?: number;
  };
}

/** One of the playground's fixtures: what it is, and what happened to it. */
interface FormatReport extends SourceReport {
  file: string;
  /** The codec family the file was encoded with, the first part of its codec string. */
  family: 'avc1' | 'vp09' | 'av01';
  expected: { durationSeconds: number; audioCodec?: string };
  /** The codec string the demuxer assembled. */
  codec?: string;
  /** What `VideoDecoder.isConfigSupported` said about the configuration the demuxer read. */
  decoderSupports?: boolean;
  /** The audio track's codec string, where the demuxer found one. */
  audioCodec?: string;
  /** What `AudioDecoder.isConfigSupported` said about it, where there is an `AudioDecoder`. */
  audioDecoderSupports?: boolean;
}

interface Result {
  ok: boolean;
  canDecode: boolean;
  error?: string;
  sources: SourceReport[];
  formats: FormatReport[];
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

  // Wait for the first picture before the first second starts, rather
  // than starting the clock at load. The first decoder a browser
  // process opens pays for setting the platform's decoder up, and on a
  // slow shared CI runner that took longer than the whole loop below —
  // which runs a second of video in about half a second of wall time.
  // The source checked first absorbed it every time: "nothing was ever
  // drawn" and one distinct picture, while the same clip from three
  // other sources drew twenty-four, and the seek straight after it
  // landed within budget on the very decoder that had supposedly
  // stalled. That is a slow start, not a stall, and the assertion
  // below is about stalls. So the start gets the same bounded patience
  // the seek and the ranged read already get, is reported rather than
  // hidden, and a decoder that draws nothing within it still fails.
  const startedAt = performance.now();
  playback.present(0);
  const firstPictureBy = startedAt + 5000;
  while (playback.surface.frame === null && performance.now() < firstPictureBy) {
    await settle(8);
  }
  report.firstPictureMs = Math.round(performance.now() - startedAt);

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
  const seekStartedAt = performance.now();
  playback.present(playback.duration * 1000 * 0.8);
  // Polled rather than slept on. The first version of this waited a
  // flat 500ms and then measured, which reported 505ms every time for
  // every source: it was timing the sleep, not the seek.
  const deadline = seekStartedAt + 5000;
  while (playback.surface.version === before && performance.now() < deadline) {
    await settle(8);
  }
  report.seekMs = Math.round(performance.now() - seekStartedAt);
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
    const message = error instanceof Error ? error.message : String(error);
    // A refused range is the transport's; an error after every range
    // was honoured is this framework's, and the two used to share one
    // field, which reported a broken ranged read as "not honoured".
    report.ranged =
      refused === null
        ? { supported: true, error: message, drewSomething: false, requests, bytesFetched, fileBytes }
        : { supported: false, why: refused, requests, fileBytes };
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

/**
 * Plays one of the playground's fixtures, if this browser can decode it.
 *
 * The demuxer is run here as well as inside the resolver, for the
 * configuration it reads: that is what `isConfigSupported` is asked
 * about, so "this browser has no AV1 decoder" and "the resolver failed
 * on an AV1 file" come out as different answers.
 */
async function exerciseFormat(format: Omit<FormatReport, 'ok'>): Promise<FormatReport> {
  const report: FormatReport = { ...format, ok: false };
  const url = `${FIXTURES}/${format.file}`;
  try {
    const bytes = await bytesOf(url);
    const track = demuxMp4Video(bytes);
    report.codec = track.codec;
    const audio = demuxMp4Audio(bytes);
    if (audio !== null) {
      report.audioCodec = audio.codec;
      if (typeof AudioDecoder !== 'undefined') {
        const support = await AudioDecoder.isConfigSupported({
          codec: audio.codec,
          sampleRate: audio.sampleRate,
          numberOfChannels: audio.channels,
          ...(audio.description === undefined ? {} : { description: audio.description })
        });
        report.audioDecoderSupports = support.supported === true;
      }
    }
    const support = await VideoDecoder.isConfigSupported({
      codec: track.codec,
      codedWidth: track.codedWidth,
      codedHeight: track.codedHeight,
      ...(track.description === undefined ? {} : { description: track.description })
    });
    report.decoderSupports = support.supported === true;
  } catch (error: unknown) {
    report.error = error instanceof Error ? error.message : String(error);
    return report;
  }
  if (!report.decoderSupports) {
    return report;
  }

  const resolver = new DefaultVideoResolver();
  try {
    const playback = await resolver.resolve(url);
    await exercise(playback, report);
    report.ok = report.drewSomething === true;
  } catch (error: unknown) {
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    resolver.dispose();
  }
  await exerciseRanged(url, report);
  return report;
}

async function run(): Promise<Result> {
  if (!canDecodeVideo()) {
    return {
      ok: false,
      canDecode: false,
      error: 'This browser has no WebCodecs VideoDecoder.',
      sources: [],
      formats: []
    };
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

  const formats: FormatReport[] = [];
  for (const format of FORMATS) {
    formats.push(await exerciseFormat(format));
  }

  return {
    ok: reports.every(report => report.ok) && formats.every(format => format.ok || format.decoderSupports === false),
    canDecode: true,
    sources: reports,
    formats
  };
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
      formats: [],
      error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
    };
  });
