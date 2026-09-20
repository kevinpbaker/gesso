/**
 * Where a demuxed file's bytes come from.
 *
 * The seam that lets one `Mp4Playback` serve both of the things a
 * video file can be. A fifteen-second loop is a few megabytes, is
 * wanted in its entirety within a second of starting, and is simplest
 * held in one `ArrayBuffer` — which is what this framework did, and
 * still does by default. An hour of video is none of those things: it
 * is a gigabyte, a viewer will watch four minutes of it, and holding
 * it in memory to do so is not a trade-off but a mistake.
 *
 * Both are the same demux. A sample table names byte offsets into a
 * file, and whether those bytes are already in memory or have to be
 * asked for is a question about *transport*, not about the format. So
 * the playback reads through this, and the two answers to that
 * question are `bufferSource` and `rangeSource`.
 *
 * **`read` is synchronous and may answer null**, which is the whole
 * design. The decoder is fed from inside a presentation, on the frame
 * clock, and a `fill` that awaited anything would turn every frame
 * into a microtask and every stall into a dropped frame. So `read`
 * answers immediately or not at all, and a caller that gets null
 * calls `request` and gets on with the frame it is in.
 */
export interface ByteSource {
  /** The whole file's length in bytes. */
  readonly size: number;
  /**
   * The bytes at `offset`, if they are already here. Null means they
   * are not, and says nothing about whether they ever will be.
   */
  read(offset: number, size: number): Uint8Array | null;
  /**
   * Asks for a region, resolving once `read` will answer for it.
   *
   * Calling it for a region already in flight joins that request
   * rather than making a second one.
   */
  request(offset: number, size: number): Promise<void>;
  /** Releases whatever is held. */
  close(): void;
}

/** A file already in memory, which is every file this framework read before. */
export function bufferSource(data: ArrayBuffer): ByteSource {
  return {
    size: data.byteLength,
    read(offset: number, size: number): Uint8Array | null {
      if (offset < 0 || offset + size > data.byteLength) {
        return null;
      }
      return new Uint8Array(data, offset, size);
    },
    request(): Promise<void> {
      return Promise.resolve();
    },
    close(): void {}
  };
}

/**
 * How much is fetched at a time.
 *
 * Big enough that a request is worth its round trip — a quarter of a
 * megabyte is a second or two of ordinary video, so a clip playing
 * forwards asks for one every second or so rather than every frame —
 * and small enough that a seek does not drag a great deal of video
 * nobody will watch.
 *
 * It is also what a reader's first request should be, so that the
 * bytes it read to find the header land on a block boundary and can
 * be kept; see `prefetched`. A megabyte, the first value here, was
 * larger than the whole of a short file, so the header probe could
 * never seed a block and the front of the file was always fetched
 * twice.
 */
export const DEFAULT_BLOCK_SIZE = 256 * 1024;

/**
 * How many blocks to keep.
 *
 * Eight megabytes, which is enough that playing forwards never evicts
 * a block it is about to want, and a bound rather than a cache that
 * grows to the size of the file — which would make the whole exercise
 * pointless.
 */
const BLOCK_CAPACITY = 32;

export interface RangeSourceOptions {
  /** Fetches `[start, end)`. Inclusive-exclusive, like every other range in this codebase. */
  readonly fetchRange: (source: string, start: number, end: number) => Promise<ArrayBuffer>;
  /** The file's length, which a caller usually learns from the same response that told it the head. */
  readonly size: number;
  readonly blockSize?: number;
  readonly capacity?: number;
  /**
   * Bytes the caller has already fetched, starting at `start`.
   *
   * A reader almost always has some: finding the `moov` means reading
   * the front of the file, and without this that read is thrown away
   * and the first block is fetched all over again. On a short file
   * that duplicate was most of the transfer.
   *
   * Only the *whole* blocks inside it are kept. A partial block at
   * either end is dropped rather than stored short, because a block
   * held short would answer `read` for bytes it does not have.
   */
  readonly prefetched?: { readonly start: number; readonly data: ArrayBuffer };
}

/**
 * A file fetched a block at a time.
 *
 * Blocks rather than exact ranges, and aligned to their own size, so
 * that two samples in the same part of the file share one request and
 * so the cache can be keyed on a number. A sample straddling a block
 * boundary is copied out of the two blocks either side of it; every
 * other read is a view, which matters because the common case is a
 * frame's worth of bytes on the way to a decoder.
 *
 * **Eviction is by last use, not by position.** A viewer who seeks
 * backwards into what they just watched should find it still here, and
 * a strictly forward-looking policy would have thrown it away.
 */
export function rangeSource(source: string, options: RangeSourceOptions): ByteSource {
  const blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE;
  const capacity = options.capacity ?? BLOCK_CAPACITY;
  const blocks = new Map<number, Uint8Array>();
  const inFlight = new Map<number, Promise<void>>();
  let closed = false;

  const blockOf = (offset: number): number => Math.floor(offset / blockSize);

  /** Slices whatever the caller already had into blocks this can serve. */
  const seed = (start: number, data: ArrayBuffer): void => {
    const bytes = new Uint8Array(data);
    const end = start + bytes.length;
    // The first block boundary at or after `start`, and the last one
    // at or before `end` -- or the end of the file, whose final block
    // is legitimately short.
    for (let index = Math.ceil(start / blockSize); ; index++) {
      const blockStart = index * blockSize;
      const blockEnd = Math.min(blockStart + blockSize, options.size);
      if (blockEnd > end) {
        break;
      }
      blocks.set(index, bytes.subarray(blockStart - start, blockEnd - start));
      if (blockEnd === options.size) {
        break;
      }
    }
  };

  /** Marks a block as the most recently used, which a Map's order gives us for free. */
  const touch = (index: number, bytes: Uint8Array): void => {
    blocks.delete(index);
    blocks.set(index, bytes);
    while (blocks.size > capacity) {
      const oldest = blocks.keys().next();
      if (oldest.done === true) {
        break;
      }
      blocks.delete(oldest.value);
    }
  };

  const fetchBlock = (index: number): Promise<void> => {
    const existing = inFlight.get(index);
    if (existing !== undefined) {
      return existing;
    }
    const start = index * blockSize;
    const end = Math.min(start + blockSize, options.size);
    const request = options
      .fetchRange(source, start, end)
      .then(buffer => {
        if (closed) {
          return;
        }
        touch(index, new Uint8Array(buffer));
      })
      .finally(() => inFlight.delete(index));
    inFlight.set(index, request);
    return request;
  };

  if (options.prefetched !== undefined) {
    seed(options.prefetched.start, options.prefetched.data);
  }

  return {
    size: options.size,
    read(offset: number, size: number): Uint8Array | null {
      if (offset < 0 || size < 0 || offset + size > options.size) {
        return null;
      }
      const first = blockOf(offset);
      const last = blockOf(offset + Math.max(0, size - 1));
      const head = blocks.get(first);
      if (head === undefined) {
        return null;
      }
      if (first === last) {
        touch(first, head);
        return head.subarray(offset - first * blockSize, offset - first * blockSize + size);
      }
      // Straddling a boundary: every block it touches has to be here,
      // and the result is a copy rather than a view.
      const out = new Uint8Array(size);
      let written = 0;
      for (let index = first; index <= last; index++) {
        const block = blocks.get(index);
        if (block === undefined) {
          return null;
        }
        const blockStart = index * blockSize;
        const from = Math.max(0, offset - blockStart);
        const take = Math.min(block.length - from, size - written);
        out.set(block.subarray(from, from + take), written);
        written += take;
      }
      for (let index = first; index <= last; index++) {
        const block = blocks.get(index);
        if (block !== undefined) {
          touch(index, block);
        }
      }
      return written === size ? out : null;
    },
    async request(offset: number, size: number): Promise<void> {
      if (closed || offset < 0 || offset >= options.size) {
        return;
      }
      const first = blockOf(offset);
      const last = blockOf(Math.min(offset + Math.max(0, size - 1), options.size - 1));
      const wanted: Promise<void>[] = [];
      for (let index = first; index <= last; index++) {
        if (!blocks.has(index)) {
          wanted.push(fetchBlock(index));
        }
      }
      await Promise.all(wanted);
    },
    close(): void {
      closed = true;
      blocks.clear();
      inFlight.clear();
    }
  };
}
