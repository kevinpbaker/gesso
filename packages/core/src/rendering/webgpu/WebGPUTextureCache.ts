import type { UiImage } from '../PaintState';
import { isVideoSurface, videoFrameSize, type UiVideoSurface } from '../../properties/UiVideo';
import type { TexturedPipeline } from './WebGPUPipeline';

/** A GPU texture with the bind group that draws it, ready to reuse. */
export interface TextureEntry {
  texture: GPUTexture;
  bindGroup: GPUBindGroup;
  /** For a video surface: the frame this texture currently holds. */
  version?: number;
  width?: number;
  height?: number;
}

/** Anything the textured pipeline can be given: a still, or a video's surface. */
export type TextureSource = UiImage | UiVideoSurface;

/**
 * Textures for the textured pipeline's images.
 *
 * An image is uploaded once per `ImageBitmap` and lives as long as the
 * bitmap does — a `WeakMap`, so a bitmap the application drops takes
 * its texture with it. Bind groups are created with their texture, so
 * a frame allocates nothing for an image it has drawn before.
 *
 * **A video is the same map with one more comparison.** Its pixels
 * change every frame while the thing on screen stays the same thing,
 * so keying on the frame — which is a fresh `VideoFrame` object each
 * time — would allocate a texture and a bind group sixty times a
 * second and free none of them until the garbage collector felt like
 * it. Keying on the *surface*, whose identity is stable for the life
 * of the playback, and comparing `version`, means one texture per
 * video and one `copyExternalImageToTexture` per frame into the
 * texture that is already there. See `UiVideo.ts`.
 *
 * Text used to live here too, one texture per run. It is now
 * `WebGPUGlyphPages`: the same drawing, cut into glyphs and packed
 * into a shared atlas, so its memory follows the fonts in use rather
 * than the amount of text on screen.
 */
export class WebGPUTextureCache {
  private readonly images = new WeakMap<TextureSource, TextureEntry>();

  constructor(
    private readonly device: GPUDevice,
    private readonly pipeline: TexturedPipeline
  ) {}

  /** The bind group for a still or a video, uploading it when it must. */
  imageBindGroup(source: TextureSource): GPUBindGroup | null {
    return isVideoSurface(source) ? this.videoBindGroup(source) : this.stillBindGroup(source);
  }

  private stillBindGroup(image: UiImage): GPUBindGroup | null {
    const entry = this.images.get(image);
    if (entry !== undefined) {
      return entry.bindGroup;
    }
    return this.upload(image, image, image.width, image.height, undefined)?.bindGroup ?? null;
  }

  /**
   * The same, for a surface whose contents move.
   *
   * Three outcomes: the version is unchanged and the existing bind
   * group is handed straight back; the version moved but the size did
   * not, so the frame is copied into the texture that is already
   * there; or the size changed too — a stream that switched
   * resolution — and the texture is rebuilt, which is rare enough to
   * be worth nothing more than this comment.
   */
  private videoBindGroup(surface: UiVideoSurface): GPUBindGroup | null {
    const frame = surface.frame;
    if (frame === null) {
      return null;
    }
    const { width, height } = videoFrameSize(surface);
    const entry = this.images.get(surface);
    if (entry !== undefined) {
      if (entry.version === surface.version) {
        return entry.bindGroup;
      }
      if (entry.width === width && entry.height === height) {
        entry.version = surface.version;
        return this.copyInto(entry.texture, frame, width, height) ? entry.bindGroup : null;
      }
      entry.texture.destroy();
      this.images.delete(surface);
    }
    return this.upload(surface, frame, width, height, surface.version)?.bindGroup ?? null;
  }

  private upload(
    key: TextureSource,
    frame: ImageBitmap | VideoFrame,
    width: number,
    height: number,
    version: number | undefined
  ): TextureEntry | null {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const texture = createTexture(this.device, w, h);
    if (!this.copyInto(texture, frame, w, h)) {
      texture.destroy();
      return null;
    }
    const bindGroup = createTexturedBindGroup(this.device, this.pipeline, texture, this.pipeline.imageSampler);
    const entry: TextureEntry = { texture, bindGroup, version, width: w, height: h };
    this.images.set(key, entry);
    return entry;
  }

  private copyInto(texture: GPUTexture, frame: ImageBitmap | VideoFrame, width: number, height: number): boolean {
    try {
      this.device.queue.copyExternalImageToTexture({ source: frame as ImageBitmap }, { texture }, [
        Math.max(1, Math.round(width)),
        Math.max(1, Math.round(height))
      ]);
      return true;
    } catch {
      return false;
    }
  }
}

/** A texture the textured pipeline can sample and be copied into. */
export function createTexture(device: GPUDevice, width: number, height: number): GPUTexture {
  const textureBinding = typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage.TEXTURE_BINDING : 0x4;
  const copyDst = typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage.COPY_DST : 0x8;
  const renderAttachment = typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage.RENDER_ATTACHMENT : 0x10;
  return device.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
    usage: textureBinding | copyDst | renderAttachment
  });
}

/** The pipeline's group 0: view uniforms, a sampler and one texture. */
export function createTexturedBindGroup(
  device: GPUDevice,
  pipeline: TexturedPipeline,
  texture: GPUTexture,
  sampler: GPUSampler
): GPUBindGroup {
  return device.createBindGroup({
    layout: pipeline.bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: pipeline.uniformBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: texture.createView() }
    ]
  });
}
