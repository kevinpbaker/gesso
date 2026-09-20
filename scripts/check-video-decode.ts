/**
 * The video gate: a real file, a real decoder, a real browser.
 *
 * Everything else that covers video here runs in Node against a fake
 * decoder, deliberately — a seek that starts at the wrong keyframe is
 * a mistake in a sample table index, and asserting it against pixels
 * would be slower and vaguer. But that leaves a claim nobody was
 * checking, and the documentation says so outright: "whether a frame
 * decoded, and whether it looked right, is something only a running
 * browser shows, and nothing on this page measures it."
 *
 * This measures it. It opens a page that fetches
 * `motion-loop.mp4` — a real 1280x992 H.264 clip, 120 frames over five
 * seconds — demuxes it with the real `Mp4Demuxer`, decodes it with the
 * platform's own `VideoDecoder`, and reports what reached the surface.
 *
 * **It is a matrix over where the bytes came from**, because that is
 * the axis an application actually varies and the one with no other
 * coverage: the same clip as a path on the server, as a `blob:` URL,
 * as a `data:` URL, and across an origin with CORS. The last needs a
 * second server, which is why this script starts one.
 *
 * Four things are asserted per source, and they are the four the unit
 * tests cannot reach:
 *
 *   - the container was read: a duration, a size and a frame interval
 *     that match the file rather than a default;
 *   - a picture was decoded at all;
 *   - *new* pictures kept arriving, rather than one being presented
 *     over and over — which is what a decoder that stalled after its
 *     first keyframe looks like;
 *   - a seek to four fifths in changed the picture, within a budget.
 *
 * And one thing is reported rather than asserted: whether the
 * transport honoured a `Range` request. A `blob:` URL does not — it
 * answers 200 with the whole body — and that is a fact about the
 * platform rather than a failure here, but it is exactly the fact an
 * application needs before it reaches for `fetchRange`.
 *
 * Not part of `pnpm check`, for the reason the screenshot gates are
 * not: it needs Chrome with H.264, which a Chromium build without
 * proprietary codecs does not have. Run it with `pnpm check:video`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DevTools, findChrome, openPage, waitFor } from './lib/devtools.ts';

const VITE_PORT = 9347;
const CROSS_ORIGIN_PORT = 9348;
const DEVTOOLS_PORT = 9349;

const root = join(import.meta.dirname, '..');
const CLIP = join(root, 'apps/playground/public/transitions/motion-loop.mp4');

/** What the file actually is, so the assertions below name real numbers. */
const EXPECTED = {
  durationSeconds: 5,
  width: 1280,
  height: 992,
  /** 120 frames over five seconds. */
  frameDurationMs: 1000 / 24
};

/** A seek has to feel like one. Generous, because this is a headless software decoder. */
const SEEK_BUDGET_MS = 1500;

interface RangedReport {
  supported: boolean;
  why?: string;
  duration?: number;
  drewSomething?: boolean;
  requests?: number;
  bytesFetched?: number;
  fileBytes?: number;
}

interface SourceReport {
  name: string;
  ok: boolean;
  error?: string;
  duration?: number;
  width?: number;
  height?: number;
  frameDurationMs?: number;
  picturesDrawn?: number;
  drewSomething?: boolean;
  seekChangedPicture?: boolean;
  seekMs?: number;
  ranged?: RangedReport;
}

interface Result {
  ok: boolean;
  canDecode: boolean;
  error?: string;
  sources: SourceReport[];
}

/**
 * A second origin serving the one file, with CORS and with ranges.
 *
 * Small enough to write out rather than pull in: what is being proved
 * is that this framework can read a clip from somewhere that is not
 * where the page came from, and the whole of that is two headers.
 */
function startCrossOrigin(): Promise<{ close: () => void }> {
  const size = statSync(CLIP).size;
  const server = createServer((request, response) => {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      // Without this a cross-origin reader cannot see `Content-Range`
      // at all: `headers.get` answers null, the reader takes the
      // length of the piece it was handed for the length of the whole
      // file, and every offset past the first block is then wrong.
      // The clip still opens, because the header is in that first
      // block, which is what makes it such a good trap. Found by this
      // script reporting that a ranged read had fetched "100% of the
      // file" in one request.
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
      'Access-Control-Allow-Headers': 'Range',
      'Accept-Ranges': 'bytes',
      'Content-Type': 'video/mp4'
    };
    if (request.method === 'OPTIONS') {
      response.writeHead(204, headers);
      response.end();
      return;
    }
    const range = request.headers.range;
    if (range === undefined) {
      response.writeHead(200, { ...headers, 'Content-Length': String(size) });
      createReadStream(CLIP).pipe(response);
      return;
    }
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    const start = match === null ? 0 : Number(match[1]);
    const end = match === null || match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
    response.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1)
    });
    createReadStream(CLIP, { start, end }).pipe(response);
  });
  return new Promise(resolve => {
    server.listen(CROSS_ORIGIN_PORT, () => resolve({ close: () => server.close() }));
  });
}

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

function close(value: number, wanted: number, tolerance: number): boolean {
  return Math.abs(value - wanted) <= tolerance;
}

/** Checks one source's report, returning the problems rather than throwing. */
function problemsWith(report: SourceReport): string[] {
  const problems: string[] = [];
  if (report.error !== undefined) {
    problems.push(`resolving failed: ${report.error}`);
    return problems;
  }
  if (report.drewSomething !== true) {
    problems.push('nothing was ever drawn onto the surface');
  }
  if (!close(report.duration ?? 0, EXPECTED.durationSeconds, 0.2)) {
    problems.push(`duration read as ${report.duration}s, expected about ${EXPECTED.durationSeconds}s`);
  }
  if (report.width !== EXPECTED.width || report.height !== EXPECTED.height) {
    problems.push(`size read as ${report.width}x${report.height}, expected ${EXPECTED.width}x${EXPECTED.height}`);
  }
  if (!close(report.frameDurationMs ?? 0, EXPECTED.frameDurationMs, 4)) {
    problems.push(`frame interval read as ${report.frameDurationMs}ms, expected about ${EXPECTED.frameDurationMs}ms`);
  }
  // More than one distinct picture over a second of playback. A
  // decoder that produced its first keyframe and then stalled scores
  // exactly one, and every other assertion here would still pass.
  if ((report.picturesDrawn ?? 0) < 5) {
    problems.push(`only ${report.picturesDrawn} distinct pictures over the first second; the clip is not advancing`);
  }
  if (report.seekChangedPicture !== true) {
    problems.push('seeking to four fifths of the way in did not change the picture');
  }
  if ((report.seekMs ?? 0) > SEEK_BUDGET_MS) {
    problems.push(`the seek took ${report.seekMs}ms, over the ${SEEK_BUDGET_MS}ms budget`);
  }
  return problems;
}

async function main(): Promise<void> {
  const chrome = findChrome();
  const profileDir = mkdtempSync(join(tmpdir(), 'gesso-video-'));
  let vite: ChildProcess | undefined;
  let crossOrigin: { close: () => void } | undefined;
  let browser: ChildProcess | undefined;
  let devtools: DevTools | undefined;

  try {
    crossOrigin = await startCrossOrigin();
    // Vite at the repository root, so the fixture can import
    // `gesso-core` from source and reference the playground's clip by
    // path. Nothing is built: this is the same module graph the tests
    // run against.
    vite = spawn('npx', ['vite', '.', '--port', String(VITE_PORT), '--strictPort'], {
      cwd: root,
      stdio: 'ignore'
    });
    const page = `http://localhost:${VITE_PORT}/scripts/fixtures/video-decode/index.html`;
    // The fixture page rather than `/`: the repository root has no
    // index, so vite answers 404 there however ready it is.
    await waitFor('Vite', async () => ((await fetch(page)).ok ? true : undefined), 30_000);

    const url = `${page}?crossOrigin=${encodeURIComponent(`http://localhost:${CROSS_ORIGIN_PORT}`)}`;
    ({ browser, devtools } = await openPage(chrome, {
      url,
      devtoolsPort: DEVTOOLS_PORT,
      windowSize: [800, 600],
      profileDir
    }));

    const result = await waitFor(
      'the decode check to finish',
      async () => (await devtools!.evaluate<Result | undefined>('window.videoCheck')) ?? undefined,
      120_000
    );

    if (!result.canDecode) {
      fail(result.error ?? 'This browser has no WebCodecs VideoDecoder.');
    }
    if (result.sources.length === 0) {
      fail(result.error ?? 'The page reported no sources at all.');
    }

    let failed = 0;
    for (const report of result.sources) {
      const problems = problemsWith(report);
      if (problems.length === 0) {
        console.log(`  ✓ ${report.name}`);
        console.log(
          `      ${report.width}x${report.height}, ${report.duration?.toFixed(2)}s, ` +
            `${report.frameDurationMs?.toFixed(1)}ms per frame; ` +
            `${report.picturesDrawn} pictures in the first second; seek ${report.seekMs}ms`
        );
      } else {
        failed++;
        console.log(`  ✗ ${report.name}`);
        for (const problem of problems) {
          console.log(`      ${problem}`);
        }
      }
      const ranged = report.ranged;
      if (ranged === undefined) {
        console.log('      ranges: not attempted');
      } else if (ranged.supported) {
        const share =
          ranged.fileBytes === undefined || ranged.bytesFetched === undefined
            ? ''
            : ` (${Math.round((ranged.bytesFetched / ranged.fileBytes) * 100)}% of the file)`;
        // Not a pass/fail: what matters is that it decoded from
        // pieces, and how few bytes that took is the interesting part.
        const drew = ranged.drewSomething === true ? 'Drew a picture' : 'Drew nothing';
        console.log(`      ranges: honoured. ${drew} after ${ranged.requests} requests${share}`);
        if (ranged.drewSomething !== true) {
          failed++;
          console.log('      ✗ the ranged read decoded nothing');
        }
      } else {
        // A fact about the transport, not a failure here.
        console.log(`      ranges: not honoured. ${ranged.why}`);
      }
    }

    if (failed > 0) {
      fail(`${failed} of ${result.sources.length} source${result.sources.length === 1 ? '' : 's'} failed.`);
    }
    console.log(`\n  All ${result.sources.length} sources decoded.\n`);
  } finally {
    devtools?.close();
    browser?.kill();
    vite?.kill();
    crossOrigin?.close();
    // Chrome is still writing its profile as it goes, so a delete
    // here races it — and an `ENOTEMPTY` thrown out of a `finally`
    // replaces whatever real failure brought us here, which cost an
    // afternoon of looking at the wrong error.
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      // A temporary directory left behind is not worth failing over.
    }
  }
}

await main();
