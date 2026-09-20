import { describe, expect, it, vi } from 'vitest';

import { bufferSource, rangeSource } from './ByteSource';

/**
 * Where a file's bytes come from, and what it costs to get them.
 *
 * The assertions worth making here are about *requests*: how many go
 * out, whether two reads of the same region make one, and whether
 * playing forwards evicts something it is about to want. Whether the
 * bytes are right is the easy half.
 */

function filled(size: number, at = 0): ArrayBuffer {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index++) {
    bytes[index] = (at + index) & 0xff;
  }
  return bytes.buffer;
}

describe('bufferSource', () => {
  it('reads what it holds without being asked first', () => {
    const source = bufferSource(filled(64));
    expect(Array.from(source.read(4, 3) ?? [])).toEqual([4, 5, 6]);
  });

  it('answers null past the end rather than a short read', () => {
    const source = bufferSource(filled(16));
    expect(source.read(12, 8)).toBeNull();
    expect(source.read(-1, 2)).toBeNull();
  });
});

describe('rangeSource', () => {
  function make(size: number, options: { blockSize?: number; capacity?: number } = {}) {
    const ranges: [number, number][] = [];
    const fetchRange = vi.fn((_source: string, start: number, end: number) => {
      ranges.push([start, end]);
      return Promise.resolve(filled(end - start, start));
    });
    const source = rangeSource('clip.mp4', {
      fetchRange,
      size,
      blockSize: options.blockSize ?? 16,
      capacity: options.capacity ?? 4
    });
    return { source, ranges, fetchRange };
  }

  it('answers null until the bytes have been asked for', async () => {
    const { source } = make(64);
    expect(source.read(0, 4)).toBeNull();

    await source.request(0, 4);

    // Synchronous or not at all: the decoder is fed from inside a
    // frame, and a read that awaited would turn every frame into a
    // microtask.
    expect(Array.from(source.read(0, 4) ?? [])).toEqual([0, 1, 2, 3]);
  });

  it('fetches whole aligned blocks rather than the exact range', async () => {
    const { source, ranges } = make(64, { blockSize: 16 });
    await source.request(4, 2);

    // Aligned so that two samples in the same part of the file share
    // one request, and so the cache can be keyed on a number.
    expect(ranges).toEqual([[0, 16]]);
  });

  it('makes one request for a region already in flight', async () => {
    const { source, fetchRange } = make(64);
    await Promise.all([source.request(0, 4), source.request(8, 4), source.request(2, 2)]);
    expect(fetchRange).toHaveBeenCalledTimes(1);
  });

  it('does not fetch a block it already holds', async () => {
    const { source, fetchRange } = make(64);
    await source.request(0, 4);
    await source.request(5, 4);
    expect(fetchRange).toHaveBeenCalledTimes(1);
  });

  it('reads across a block boundary', async () => {
    const { source } = make(64, { blockSize: 16 });
    await source.request(14, 4);

    // Copied out of the two blocks either side rather than viewed,
    // which is the one read that cannot be a subarray.
    expect(Array.from(source.read(14, 4) ?? [])).toEqual([14, 15, 16, 17]);
  });

  it('answers null when only one side of a straddling read is here', async () => {
    const { source } = make(64, { blockSize: 16 });
    await source.request(0, 4);
    expect(source.read(14, 4)).toBeNull();
  });

  it('does not fetch past the end of the file', async () => {
    const { source, ranges } = make(20, { blockSize: 16 });
    await source.request(18, 2);
    expect(ranges).toEqual([[16, 20]]);
  });

  it('evicts the least recently used block rather than the earliest', async () => {
    const { source, fetchRange } = make(256, { blockSize: 16, capacity: 2 });
    await source.request(0, 4); // block 0
    await source.request(16, 4); // block 1
    // Touching block 0 makes block 1 the oldest.
    source.read(0, 4);
    await source.request(32, 4); // block 2, evicting block 1

    // A viewer who seeks back into what they just watched should find
    // it still here.
    expect(source.read(0, 4)).not.toBeNull();
    expect(source.read(16, 4)).toBeNull();
    expect(fetchRange).toHaveBeenCalledTimes(3);
  });

  it('holds no more than its capacity', async () => {
    const { source } = make(1024, { blockSize: 16, capacity: 2 });
    for (let block = 0; block < 6; block++) {
      await source.request(block * 16, 4);
    }
    expect(source.read(0, 4)).toBeNull();
    expect(source.read(80, 4)).not.toBeNull();
  });

  it('lets go of everything when it is closed', async () => {
    const { source } = make(64);
    await source.request(0, 4);
    source.close();
    expect(source.read(0, 4)).toBeNull();
  });
});

describe('rangeSource seeded with what the caller already had', () => {
  it('serves whole blocks out of the prefetched bytes without fetching them again', async () => {
    const fetchRange = vi.fn((_s: string, start: number, end: number) => Promise.resolve(filled(end - start, start)));
    const source = rangeSource('clip.mp4', {
      fetchRange,
      size: 64,
      blockSize: 16,
      prefetched: { start: 0, data: filled(32) }
    });

    // Finding the header means reading the front of the file, and
    // without this that read is thrown away and fetched again.
    expect(Array.from(source.read(0, 4) ?? [])).toEqual([0, 1, 2, 3]);
    expect(Array.from(source.read(16, 4) ?? [])).toEqual([16, 17, 18, 19]);
    expect(fetchRange).not.toHaveBeenCalled();
  });

  it('drops a partial block rather than holding one short', async () => {
    const fetchRange = vi.fn((_s: string, start: number, end: number) => Promise.resolve(filled(end - start, start)));
    const source = rangeSource('clip.mp4', {
      fetchRange,
      size: 64,
      blockSize: 16,
      // Twenty bytes: block 0 whole, and four bytes of block 1.
      prefetched: { start: 0, data: filled(20) }
    });

    // A block held short would answer `read` for bytes it does not
    // have, which is far worse than fetching it.
    expect(source.read(0, 4)).not.toBeNull();
    expect(source.read(16, 4)).toBeNull();
  });

  it('keeps the final short block of a file', async () => {
    const fetchRange = vi.fn((_s: string, start: number, end: number) => Promise.resolve(filled(end - start, start)));
    const source = rangeSource('clip.mp4', {
      fetchRange,
      size: 20,
      blockSize: 16,
      prefetched: { start: 0, data: filled(20) }
    });

    // The last block of a file is legitimately shorter than the rest.
    expect(Array.from(source.read(16, 4) ?? [])).toEqual([16, 17, 18, 19]);
    expect(fetchRange).not.toHaveBeenCalled();
  });
});
