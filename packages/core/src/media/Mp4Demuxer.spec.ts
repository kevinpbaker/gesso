import { describe, expect, it } from 'vitest';

import { demuxMp4Audio, demuxMp4Video } from './Mp4Demuxer';
import {
  buildFragmentedMp4,
  buildMp4,
  mdatStart,
  type AudioTrackSpec,
  type FragmentedSpec,
  type TrackSpec
} from './Mp4TestUtils';

/**
 * The demuxer, against files built here byte by byte.
 *
 * A fixture `.mp4` would be a better test of reality and a worse test
 * of this code: when it failed you would not know which of forty boxes
 * was misread. Building the file means every assertion below names the
 * exact field it is about, and the awkward cases — a chunk holding
 * several samples, composition offsets reordering them, a track with
 * no `stss` — can be constructed rather than hunted for.
 *
 * What this cannot check is that the byte layout matches what encoders
 * actually write. That is checked against a real file, in a browser,
 * by the transitions example playing.
 *
 * The writer itself lives in `Mp4TestUtils`, because the resolver's
 * spec plays the files this one reads.
 */

const BASE: TrackSpec = {
  timescale: 1000,
  deltas: [{ count: 4, delta: 100 }],
  sizes: [10, 20, 30, 40],
  chunkOffsets: [0],
  chunkRuns: [{ firstChunk: 1, samplesPerChunk: 4 }],
  width: 640,
  height: 480
};

/** Builds once to learn where `mdat` is, then rebuilds pointing at it. */
function withMdatOffsets(spec: TrackSpec): { data: ArrayBuffer; base: number } {
  const probe = buildMp4(spec);
  const base = mdatStart(probe);
  const aimed = { ...spec, chunkOffsets: spec.chunkOffsets.map(offset => offset + base) };
  const data = buildMp4(aimed);
  return { data, base: mdatStart(data) };
}

describe('demuxMp4Video', () => {
  it('reads the codec, the size and the configuration record', () => {
    const { data } = withMdatOffsets(BASE);
    const track = demuxMp4Video(data);
    // `avc1.PPCCLL` out of the record's profile, compatibility and
    // level bytes — the string `VideoDecoder.configure` is given.
    expect(track.codec).toBe('avc1.64001F');
    expect(track.codedWidth).toBe(640);
    expect(track.codedHeight).toBe(480);
    expect(track.description).toBeInstanceOf(Uint8Array);
    expect([...track.description!]).toEqual([1, 0x64, 0x00, 0x1f, 0xff, 0xe1]);
  });

  it('lays samples end to end inside their chunk', () => {
    const { data, base } = withMdatOffsets(BASE);
    const track = demuxMp4Video(data);
    expect(track.samples.map(sample => sample.size)).toEqual([10, 20, 30, 40]);
    // Four samples in one chunk: each starts where the last one ended.
    expect(track.samples.map(sample => sample.offset - base)).toEqual([0, 10, 30, 60]);
  });

  it('converts the timescale to microseconds and finds the duration', () => {
    const { data } = withMdatOffsets(BASE);
    const track = demuxMp4Video(data);
    // 100 ticks at 1000 per second is a tenth of a second.
    expect(track.samples.map(sample => sample.timestampUs)).toEqual([0, 100_000, 200_000, 300_000]);
    expect(track.samples[0]!.durationUs).toBe(100_000);
    expect(track.durationUs).toBe(400_000);
  });

  it('reports the shortest frame interval, which is what paces playback', () => {
    const { data } = withMdatOffsets(BASE);
    // 100 ticks at 1000 per second: a tenth of a second, so 10fps.
    expect(demuxMp4Video(data).frameDurationUs).toBe(100_000);
  });

  it('takes the shortest interval of a variable-rate track, not the average', () => {
    // Sampling too often costs a wake-up that finds nothing changed;
    // sampling too rarely drops a picture. So the fastest the track
    // ever moves is the safe number to pace by.
    const spec: TrackSpec = {
      ...BASE,
      deltas: [
        { count: 2, delta: 100 },
        { count: 2, delta: 25 }
      ]
    };
    const { data } = withMdatOffsets(spec);
    const track = demuxMp4Video(data);
    expect(track.frameDurationUs).toBe(25_000);
  });

  it('walks several chunks with different sample counts', () => {
    const spec: TrackSpec = {
      ...BASE,
      sizes: [10, 20, 30, 40, 50],
      chunkOffsets: [0, 200],
      // Chunk 1 holds two samples; chunk 2 onwards hold three.
      chunkRuns: [
        { firstChunk: 1, samplesPerChunk: 2 },
        { firstChunk: 2, samplesPerChunk: 3 }
      ],
      deltas: [{ count: 5, delta: 100 }]
    };
    const { data, base } = withMdatOffsets(spec);
    const track = demuxMp4Video(data);
    // Chunk 1: 10 then 20, from 0. Chunk 2: 30, 40, 50, from 200.
    expect(track.samples.map(sample => sample.offset - base)).toEqual([0, 10, 200, 230, 270]);
  });

  it('applies composition offsets without reordering the samples', () => {
    const spec: TrackSpec = {
      ...BASE,
      // The classic IPBB pattern: decode order is not display order.
      compositionOffsets: [
        { count: 1, offset: 0 },
        { count: 1, offset: 300 },
        { count: 2, offset: 100 }
      ]
    };
    const { data } = withMdatOffsets(spec);
    const track = demuxMp4Video(data);
    expect(track.samples.map(sample => sample.timestampUs)).toEqual([0, 400_000, 300_000, 400_000]);
    // Still in decode order: a decoder is fed in the order the file
    // stores, and reorders on the way out. Sorting here would submit a
    // frame before the one it references.
    expect(track.samples[1]!.offset).toBeLessThan(track.samples[2]!.offset);
    // And the duration is how far the furthest frame reaches.
    expect(track.durationUs).toBe(500_000);
  });

  it('treats a track with no stss as all keyframes', () => {
    const { data } = withMdatOffsets(BASE);
    expect(demuxMp4Video(data).samples.every(sample => sample.isKey)).toBe(true);
  });

  it('reads stss as the list of sync samples, one-based', () => {
    const { data } = withMdatOffsets({ ...BASE, syncSamples: [1, 3] });
    expect(demuxMp4Video(data).samples.map(sample => sample.isKey)).toEqual([true, false, true, false]);
  });

  it('names a fragmented file with no fragments in it rather than returning nothing', () => {
    // The failure worth designing for: a file the browser plays
    // perfectly, that this returns zero samples for. Saying which kind
    // of file it is turns an afternoon into a minute. It is a much
    // narrower case than it used to be — fragments are read now — and
    // what is left is a file whose fragments live in other requests.
    const spec: TrackSpec = { ...BASE, sizes: [], chunkOffsets: [], chunkRuns: [], deltas: [] };
    const probe = buildMp4(spec, { fragmented: true });
    expect(() => demuxMp4Video(probe)).toThrow(/fragmented/i);
  });

  it('says so when there is no video track', () => {
    const { data } = withMdatOffsets({ ...BASE, handler: 'soun' });
    expect(() => demuxMp4Video(data)).toThrow(/no video track/i);
  });

  it('rejects something that is not an MP4 at all', () => {
    expect(() => demuxMp4Video(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer)).toThrow(/Not an MP4/i);
  });
});

describe('demuxMp4Audio', () => {
  const AUDIO: AudioTrackSpec = {
    timescale: 44100,
    deltas: [{ count: 4, delta: 1024 }],
    sizes: [100, 100, 100, 100],
    chunkOffsets: [0],
    chunkRuns: [{ firstChunk: 1, samplesPerChunk: 4 }],
    channels: 2,
    sampleRate: 44100
  };

  it('answers nothing for a file with no sound, which is not an error', () => {
    // The ordinary case for the clips this framework plays: a looping
    // background has no audio track and nothing has gone wrong.
    expect(demuxMp4Audio(buildMp4(BASE))).toBeNull();
  });

  it('reads the track beside the video', () => {
    const data = buildMp4(BASE, { audio: AUDIO });
    const track = demuxMp4Audio(data);
    expect(track?.sampleRate).toBe(44100);
    expect(track?.channels).toBe(2);
    expect(track?.samples).toHaveLength(4);
  });

  it('assembles the codec string out of the esds', () => {
    // `40` is MPEG-4 audio, from the DecoderConfigDescriptor; `2` is
    // AAC-LC, from the top five bits of the AudioSpecificConfig. A
    // player that got either wrong would configure a decoder that
    // refuses the stream.
    expect(demuxMp4Audio(buildMp4(BASE, { audio: AUDIO }))?.codec).toBe('mp4a.40.2');
  });

  it('keeps the AudioSpecificConfig for the decoder to be configured with', () => {
    const track = demuxMp4Audio(buildMp4(BASE, { audio: AUDIO }));
    expect(Array.from(track?.description ?? [])).toEqual([0x12, 0x10]);
  });

  it('reads an object type that is not AAC-LC', () => {
    // 0x28 >> 3 is 5: HE-AAC.
    const config = [0x28, 0x10];
    expect(demuxMp4Audio(buildMp4(BASE, { audio: { ...AUDIO, config } }))?.codec).toBe('mp4a.40.5');
  });

  it('reads the audio track of a file whose video track comes first', () => {
    // The walk must not stop at the first `trak` it sees just because
    // that one is the wrong kind.
    const track = demuxMp4Audio(buildMp4(BASE, { audio: AUDIO }));
    expect(track).not.toBeNull();
  });

  it('still reads the video track of a file that has both', () => {
    const video = demuxMp4Video(buildMp4(BASE, { audio: AUDIO }));
    expect(video.codedWidth).toBe(640);
    expect(video.samples).toHaveLength(4);
  });
});

describe('codec strings', () => {
  it('assembles an AV1 string rather than claiming the bare format', () => {
    // `av01` alone is not a codec string: `VideoDecoder` answers
    // `supported: false` for it, so a file reported that way never
    // played at all. Profile 0, level 4, main tier, 8-bit.
    const data = buildMp4({ ...BASE, codec: 'av01', configBytes: [0x04, 0x00] });
    expect(demuxMp4Video(data).codec).toBe('av01.0.04M.08');
  });

  it('reads an AV1 high tier and ten-bit depth', () => {
    // seq_profile 0, seq_level_idx 8; then tier high and high_bitdepth.
    const data = buildMp4({ ...BASE, codec: 'av01', configBytes: [0x08, 0xc0] });
    expect(demuxMp4Video(data).codec).toBe('av01.0.08H.10');
  });

  it('does not hand AV1 a description it carries in band', () => {
    // AV1 keeps its sequence header in the stream, and `configure`
    // rejects a config that supplies one as well.
    const data = buildMp4({ ...BASE, codec: 'av01', configBytes: [0x04, 0x00] });
    expect(demuxMp4Video(data).description).toBeUndefined();
  });

  it('assembles a VP9 string out of the vpcC', () => {
    // Profile 0, level 31, 8-bit.
    const data = buildMp4({ ...BASE, codec: 'vp09', configBytes: [0x00, 0x1f, 0x80] });
    expect(demuxMp4Video(data).codec).toBe('vp09.00.31.08');
  });

  it('falls back to the format for a record too short to read', () => {
    // Claiming a precise string from bytes that are not there is worse
    // than claiming none: `isConfigSupported` is the right judge.
    const data = buildMp4({ ...BASE, codec: 'av01', configBytes: [] });
    expect(demuxMp4Video(data).codec).toBe('av01');
  });
});

describe('fragmented MP4', () => {
  const FRAGMENTED: FragmentedSpec = {
    trackId: 1,
    timescale: 1000,
    width: 320,
    height: 240,
    fragments: [
      {
        baseMediaDecodeTime: 0,
        samples: [
          { duration: 100, size: 40, isKey: true },
          { duration: 100, size: 10, isKey: false }
        ]
      },
      {
        baseMediaDecodeTime: 200,
        samples: [
          { duration: 100, size: 30, isKey: true },
          { duration: 100, size: 12, isKey: false }
        ]
      }
    ]
  };

  it('reads samples out of the fragments', () => {
    // What DASH and HLS segments are, and what this used to refuse.
    const track = demuxMp4Video(buildFragmentedMp4(FRAGMENTED));
    expect(track.samples).toHaveLength(4);
    expect(track.codedWidth).toBe(320);
  });

  it('accumulates times across fragments', () => {
    const track = demuxMp4Video(buildFragmentedMp4(FRAGMENTED));
    expect(track.samples.map(sample => sample.timestampUs)).toEqual([0, 100_000, 200_000, 300_000]);
    expect(track.durationUs).toBe(400_000);
  });

  it('reads the sync flag out of each sample', () => {
    const track = demuxMp4Video(buildFragmentedMp4(FRAGMENTED));
    // Bit 16 of the sample flags is `sample_is_non_sync_sample`, so a
    // keyframe is the one with it clear — reading it the other way up
    // makes every seek land on a frame the decoder cannot start at.
    expect(track.samples.map(sample => sample.isKey)).toEqual([true, false, true, false]);
  });

  it('places each fragment against its own moof rather than the first', () => {
    const data = buildFragmentedMp4(FRAGMENTED);
    const track = demuxMp4Video(data);
    const [first, second, third] = track.samples;

    // `default-base-is-moof` is what every fragmenter writes, and it
    // makes a fragment self-contained. Taking the older first-traf
    // rule as the general one puts every fragment after the first at
    // the wrong offset, which decodes as noise rather than as an error.
    expect(second!.offset).toBe(first!.offset + first!.size);
    expect(third!.offset).toBeGreaterThan(second!.offset + second!.size);
    // And every sample has to land inside the file it came from.
    for (const sample of track.samples) {
      expect(sample.offset + sample.size).toBeLessThanOrEqual(data.byteLength);
    }
  });

  it('falls back to the trex defaults for a field the trun leaves out', () => {
    // The whole economy of the format: a run of constant-bitrate
    // samples can be a header and nothing else.
    const track = demuxMp4Video(
      buildFragmentedMp4({
        ...FRAGMENTED,
        defaultSampleDuration: 250,
        defaultSampleSize: 20,
        omit: { duration: true, size: true }
      })
    );
    expect(track.samples[0]?.durationUs).toBe(250_000);
    expect(track.samples[0]?.size).toBe(20);
  });

  it('carries on from the last fragment when one states no decode time', () => {
    const track = demuxMp4Video(
      buildFragmentedMp4({
        ...FRAGMENTED,
        fragments: [
          { baseMediaDecodeTime: 0, samples: [{ duration: 100, size: 10, isKey: true }] },
          { samples: [{ duration: 100, size: 10, isKey: false }] }
        ]
      })
    );
    expect(track.samples.map(sample => sample.timestampUs)).toEqual([0, 100_000]);
  });

  it('paces a fragmented clip from its samples like any other', () => {
    expect(demuxMp4Video(buildFragmentedMp4(FRAGMENTED)).frameDurationUs).toBe(100_000);
  });
});

describe('presentation times that do not start at zero', () => {
  it('rebases a track whose composition offsets shift its first picture', () => {
    // What every clip encoded with B-frames looks like: `ctts` shifts
    // each sample forward of its decode time, so the earliest picture
    // is the reorder depth into the file rather than at zero.
    const { data } = withMdatOffsets({
      ...BASE,
      compositionOffsets: [{ count: 4, offset: 200 }]
    });
    const track = demuxMp4Video(data);

    // Without rebasing the first picture would be at 200ms, position
    // zero would have nothing due, and a paused clip would show
    // nothing at all, forever.
    expect(track.samples[0]?.timestampUs).toBe(0);
    expect(track.samples.map(sample => sample.timestampUs)).toEqual([0, 100_000, 200_000, 300_000]);
  });

  it('reports the length of the pictures rather than of the offset plus them', () => {
    const { data } = withMdatOffsets({
      ...BASE,
      compositionOffsets: [{ count: 4, offset: 200 }]
    });
    // Four samples of 100ms is 400ms of video however far into the
    // file the first one is shown.
    expect(demuxMp4Video(data).durationUs).toBe(400_000);
  });

  it('keeps the gaps between samples exactly as they were', () => {
    const { data } = withMdatOffsets({
      ...BASE,
      // An uneven shift, which is what a real reorder produces.
      compositionOffsets: [
        { count: 1, offset: 200 },
        { count: 1, offset: 300 },
        { count: 2, offset: 200 }
      ]
    });
    const track = demuxMp4Video(data);
    // Subtracting a constant moves the clock and nothing else.
    expect(track.samples.map(sample => sample.timestampUs)).toEqual([0, 200_000, 200_000, 300_000]);
  });

  it('leaves a track that already starts at zero alone', () => {
    const { data } = withMdatOffsets(BASE);
    expect(demuxMp4Video(data).samples[0]?.timestampUs).toBe(0);
  });
});
