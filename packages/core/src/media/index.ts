/**
 * Media that moves: the container parsers and the playback in front of
 * `VideoDecoder`.
 *
 * Beside `rendering/ImageResolver` rather than inside it, because a
 * still and a moving picture share a paint path and share nothing
 * else: one is decoded once and cached by its pixels, the other is
 * decoded continuously and cached by its surface.
 */
export { Mp3Frames, readMp3Header, splitMp3Frames, type Mp3Format, type Mp3Frame, type Mp3Header } from './Mp3Frames';
export { demuxMp4Video, demuxMp4Audio, type Mp4Sample, type Mp4VideoTrack, type Mp4AudioTrack } from './Mp4Demuxer';
export { bufferSource, rangeSource, DEFAULT_BLOCK_SIZE, type ByteSource, type RangeSourceOptions } from './ByteSource';
export {
  DefaultVideoResolver,
  canDecodeVideo,
  type DefaultVideoResolverOptions,
  type RangeResponse,
  type VideoPlayback,
  type VideoResolver
} from './VideoResolver';
export { parseWebVtt, cueAt, type VttCue, type VttTrack } from './WebVtt';
