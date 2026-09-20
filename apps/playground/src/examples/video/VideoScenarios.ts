import { DefaultVideoResolver, type RangeResponse, type VideoPlayback, type VideoResolver } from 'gesso-core';

/**
 * What a source cost to fetch, and how.
 *
 * Recorded on this side rather than reported by the component, because
 * the interesting numbers belong to the *transport* and a component
 * cannot see them: how many requests a clip took, how many bytes
 * moved, whether the server honoured a range at all. That is the
 * subject of half the scenarios on this page, so it has to be visible
 * on the page.
 */
export interface FetchReport {
  requests: number;
  bytes: number;
  /** Null until something is known; false where a range was refused. */
  ranged: boolean | null;
  note?: string;
}

/** The prefix that routes a source to the ranged reader. */
export const RANGED = 'ranged:';

/**
 * One resolver over two, chosen by a prefix on the source.
 *
 * A runtime has one video resolver, and this page wants to show two
 * transports at once: the whole-file read that every other example
 * uses, and the ranged one that makes an hour of video possible.
 * Rather than run two runtimes, the source says which it wants.
 *
 * That prefix is a device of this example and not something the
 * framework knows about. An application picks a transport when it
 * builds its resolver and never thinks about it again.
 */
export class ScenarioResolver implements VideoResolver {
  readonly reports = new Map<string, FetchReport>();

  private readonly whole: VideoResolver;
  private readonly ranged: VideoResolver;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.whole = new DefaultVideoResolver({
      fetch: async (source: string) => {
        const report = this.reportFor(source);
        const response = await fetch(source);
        if (!response.ok) {
          throw new Error(`Fetching '${source}' failed with ${response.status} ${response.statusText}.`);
        }
        const data = await response.arrayBuffer();
        report.requests++;
        report.bytes += data.byteLength;
        report.ranged = false;
        report.note = `the whole file, ${Math.round(data.byteLength / 1024)} kB in one request`;
        this.announce();
        return data;
      }
    });

    this.ranged = new DefaultVideoResolver({
      fetchRange: async (source: string, start: number, end: number): Promise<RangeResponse> => {
        const url = source.slice(RANGED.length);
        const report = this.reportFor(source);
        const response = await fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` } });
        const data = await response.arrayBuffer();
        report.requests++;
        report.bytes += data.byteLength;
        // A server that answers 200 gave back the whole body and
        // ignored the header. Worth saying rather than assuming: a
        // reader that took that for the range it asked for would index
        // into the wrong bytes.
        report.ranged = response.status === 206;
        const contentRange = response.headers.get('Content-Range');
        const total =
          contentRange === null ? data.byteLength : Number(contentRange.slice(contentRange.indexOf('/') + 1));
        report.note =
          report.ranged === true
            ? `${Math.round(report.bytes / 1024)} kB of ${Math.round(total / 1024)} kB, in ${report.requests} request${report.requests === 1 ? '' : 's'}`
            : `the server answered ${response.status}, not 206`;
        this.announce();
        return { data, total };
      }
    });
  }

  /**
   * Told whenever a fetch lands, so a card can show what it cost.
   *
   * A registry rather than a constructor callback, because the
   * resolver is built in the worker entry before any of the tree
   * exists and each card wants to hear about its own source. The
   * returned function removes the listener.
   */
  onReport(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private announce(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  reportFor(source: string): FetchReport {
    let report = this.reports.get(source);
    if (report === undefined) {
      report = { requests: 0, bytes: 0, ranged: null };
      this.reports.set(source, report);
    }
    return report;
  }

  resolve(source: string): Promise<VideoPlayback> {
    return source.startsWith(RANGED) ? this.ranged.resolve(source) : this.whole.resolve(source);
  }

  release(source: string): void {
    if (source.startsWith(RANGED)) {
      this.ranged.release(source);
      return;
    }
    this.whole.release(source);
  }

  dispose(): void {
    this.whole.dispose();
    this.ranged.dispose();
  }
}

/**
 * Fetches a file and hands back the same bytes as a `blob:` URL.
 *
 * What an application has after a drag and drop, a file picker, or a
 * download it did itself. The resolver does not care: it is a url that
 * `fetch` answers.
 */
export async function blobUrlOf(url: string): Promise<string> {
  const data = await (await fetch(url)).arrayBuffer();
  return URL.createObjectURL(new Blob([data], { type: 'video/mp4' }));
}

/**
 * The same bytes again, inlined.
 *
 * Here because it is the one transport that cannot be read in ranges:
 * `fetch` on a `data:` URL answers 200 with the whole body whatever
 * header it was given.
 */
export async function dataUrlOf(url: string): Promise<string> {
  const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let binary = '';
  // Chunked: spreading a few hundred thousand arguments into
  // `fromCharCode` overflows the call stack.
  for (let at = 0; at < data.length; at += 0x8000) {
    binary += String.fromCharCode(...data.subarray(at, at + 0x8000));
  }
  return `data:video/mp4;base64,${btoa(binary)}`;
}
