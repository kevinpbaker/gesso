/**
 * Media that moves: the container parser and the playback in front of
 * `VideoDecoder`.
 *
 * Beside `rendering/ImageResolver` rather than inside it, because a
 * still and a moving picture share a paint path and share nothing
 * else: one is decoded once and cached by its pixels, the other is
 * decoded continuously and cached by its surface.
 */
export { demuxMp4Video, type Mp4Sample, type Mp4VideoTrack } from './Mp4Demuxer';
export {
  DefaultVideoResolver,
  canDecodeVideo,
  type DefaultVideoResolverOptions,
  type VideoPlayback,
  type VideoResolver
} from './VideoResolver';
