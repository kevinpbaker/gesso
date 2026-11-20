/**
 * `gesso-core/video`: the default video decoder, as an entry of its own.
 *
 * Imported with `import()` the first time a `Video` asks for a frame,
 * for the reason `gesso-core/webgpu` is: an MP4 demuxer and a
 * `VideoDecoder` pipeline are about 7 kB gzipped that an app with no
 * video never runs. The root barrel still exports the same names.
 */
export { DefaultVideoResolver } from './media/VideoResolver';
