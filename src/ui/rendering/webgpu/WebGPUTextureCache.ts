import type { UiImage } from '../PaintState';
import type { TexturedPipeline } from './WebGPUPipeline';

/** A GPU texture with the bind group that draws it, ready to reuse. */
export interface TextureEntry {
  texture: GPUTexture;
  bindGroup: GPUBindGroup;
}

/**
 * Textures for the textured pipeline's images.
 *
 * An image is uploaded once per `ImageBitmap` and lives as long as the
 * bitmap does — a `WeakMap`, so a bitmap the application drops takes
 * its texture with it. Bind groups are created with their texture, so
 * a frame allocates nothing for an image it has drawn before.
 *
 * Text used to live here too, one texture per run. It is now
 * `WebGPUGlyphPages`: the same drawing, cut into glyphs and packed
 * into a shared atlas, so its memory follows the fonts in use rather
 * than the amount of text on screen.
 */
export class WebGPUTextureCache {
  private readonly images = new WeakMap<UiImage, TextureEntry>();

  constructor(
    private readonly device: GPUDevice,
    private readonly pipeline: TexturedPipeline
  ) {}

  /** The bind group for an image, uploading it on first sight. */
  imageBindGroup(image: UiImage): GPUBindGroup | null {
    const entry = this.images.get(image);
    if (entry !== undefined) {
      return entry.bindGroup;
    }
    const width = Math.max(1, Math.round(image.width));
    const height = Math.max(1, Math.round(image.height));
    const texture = createTexture(this.device, width, height);
    try {
      this.device.queue.copyExternalImageToTexture({ source: image }, { texture }, [width, height]);
    } catch {
      texture.destroy();
      return null;
    }
    const bindGroup = createTexturedBindGroup(this.device, this.pipeline, texture, this.pipeline.imageSampler);
    this.images.set(image, { texture, bindGroup });
    return bindGroup;
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
