/**
 * The verdict on the video-decode page's second matrix: the
 * playground's codec and container fixtures, played in a real browser.
 *
 * Shared by `check-video-decode.ts`, which runs it in Chrome, and
 * `check-browsers.ts`, which runs it in Firefox and Safari, so one file
 * says what "this format works" means. The page
 * (`scripts/fixtures/video-decode/main.ts`) reports; this decides.
 *
 * **Which codecs a browser must have is the caller's to say.** A
 * browser without an AV1 decoder is not a failure of this framework,
 * and the page reports it as `decoderSupports: false` rather than
 * playing the file. But a codec string this framework assembled wrongly
 * looks exactly the same from here — `isConfigSupported` says no to
 * both — so a browser known to decode a codec is told it must, and a
 * "no" from it is then a failure rather than a skip.
 */

/** The codec families the fixtures are encoded with. */
export type CodecFamily = 'avc1' | 'vp09' | 'av01';

/** What the page reports for one fixture. Mirrors `FormatReport` there. */
export interface FormatReport {
  name: string;
  file: string;
  family: CodecFamily;
  expected: { durationSeconds: number; audioCodec?: string };
  ok: boolean;
  error?: string;
  codec?: string;
  decoderSupports?: boolean;
  audioCodec?: string;
  audioDecoderSupports?: boolean;
  duration?: number;
  width?: number;
  height?: number;
  frameDurationMs?: number;
  firstPictureMs?: number;
  picturesDrawn?: number;
  drewSomething?: boolean;
  seekChangedPicture?: boolean;
  seekMs?: number;
  ranged?: {
    supported: boolean;
    why?: string;
    error?: string;
    drewSomething?: boolean;
    requests?: number;
    bytesFetched?: number;
    fileBytes?: number;
  };
}

/** Every fixture is `testsrc2` at this size and rate; see `gen-video-fixtures.sh`. */
const SIZE = { width: 480, height: 270 };
const FRAME_DURATION_MS = 1000 / 24;

/** Generous, because a CI runner decodes in software; the same budget `check:video` gives its clip. */
const SEEK_BUDGET_MS = 1500;

/** What happened to one fixture, in a form a script prints. */
export interface FormatVerdict {
  /** `skipped` only when the browser has no decoder for a codec it was not required to have. */
  outcome: 'passed' | 'failed' | 'skipped';
  /** One line on what was read and how it played, or why it was skipped. */
  summary: string;
  problems: string[];
}

function close(value: number, wanted: number, tolerance: number): boolean {
  return Math.abs(value - wanted) <= tolerance;
}

/**
 * Judges one fixture's report.
 *
 * `mustDecode` names the codec families this browser is required to
 * decode; a fixture in one of them that the browser declines fails.
 */
export function judgeFormat(report: FormatReport, mustDecode: ReadonlySet<CodecFamily>): FormatVerdict {
  const problems: string[] = [];

  if (report.error !== undefined && report.decoderSupports === undefined) {
    // The demuxer, or the fetch in front of it, failed before the
    // browser was asked anything.
    return { outcome: 'failed', summary: `${report.file}`, problems: [`reading the file failed: ${report.error}`] };
  }
  if (report.codec !== undefined && !report.codec.startsWith(report.family)) {
    problems.push(`codec string read as ${report.codec}, expected a ${report.family} one`);
  }
  if (report.expected.audioCodec !== undefined && report.audioCodec !== report.expected.audioCodec) {
    problems.push(`audio track read as ${report.audioCodec ?? 'none'}, expected ${report.expected.audioCodec}`);
  }
  if (report.expected.audioCodec === undefined && report.audioCodec !== undefined) {
    problems.push(`an audio track (${report.audioCodec}) was found in a file that has none`);
  }

  if (report.decoderSupports !== true) {
    if (mustDecode.has(report.family)) {
      problems.push(`this browser declined ${report.codec}, and it is required to decode ${report.family}`);
      return { outcome: 'failed', summary: `${report.file}`, problems };
    }
    return {
      outcome: problems.length === 0 ? 'skipped' : 'failed',
      summary: `${report.file}: this browser has no decoder for ${report.codec}`,
      problems
    };
  }

  if (report.error !== undefined) {
    problems.push(`resolving failed: ${report.error}`);
  } else {
    if (report.drewSomething !== true) {
      problems.push('nothing was ever drawn onto the surface');
    }
    if (!close(report.duration ?? 0, report.expected.durationSeconds, 0.2)) {
      problems.push(`duration read as ${report.duration}s, expected about ${report.expected.durationSeconds}s`);
    }
    if (report.width !== SIZE.width || report.height !== SIZE.height) {
      problems.push(`size read as ${report.width}x${report.height}, expected ${SIZE.width}x${SIZE.height}`);
    }
    if (!close(report.frameDurationMs ?? 0, FRAME_DURATION_MS, 4)) {
      problems.push(`frame interval read as ${report.frameDurationMs}ms, expected about ${FRAME_DURATION_MS}ms`);
    }
    if ((report.picturesDrawn ?? 0) < 5) {
      problems.push(`only ${report.picturesDrawn} distinct pictures in a second; the clip is not advancing`);
    }
    if (report.seekChangedPicture !== true) {
      problems.push('seeking to four fifths of the way in did not change the picture');
    }
    if ((report.seekMs ?? 0) > SEEK_BUDGET_MS) {
      problems.push(`the seek took ${report.seekMs}ms, over the ${SEEK_BUDGET_MS}ms budget`);
    }
  }

  // Served by vite, which honours ranges, so a ranged read that fails
  // here is this framework's failure rather than the transport's.
  const ranged = report.ranged;
  if (ranged === undefined) {
    problems.push('the ranged read was not attempted');
  } else if (!ranged.supported) {
    problems.push(`the server did not honour ranges: ${ranged.why}`);
  } else if (ranged.error !== undefined) {
    problems.push(`the ranged read failed: ${ranged.error}`);
  } else if (ranged.drewSomething !== true) {
    problems.push('the ranged read decoded nothing');
  }

  const share =
    ranged?.bytesFetched === undefined || ranged.fileBytes === undefined || ranged.fileBytes === 0
      ? ''
      : `, ${Math.round((ranged.bytesFetched / ranged.fileBytes) * 100)}% of the file`;
  const audio = report.audioCodec === undefined ? '' : `, audio ${report.audioCodec}`;
  const summary =
    `${report.file}: ${report.codec}${audio}, ${report.width}x${report.height}, ${report.duration?.toFixed(2)}s; ` +
    `${report.picturesDrawn} pictures in a second, seek ${report.seekMs}ms; ` +
    `ranged ${ranged?.requests ?? 0} requests${share}`;
  return { outcome: problems.length === 0 ? 'passed' : 'failed', summary, problems };
}
