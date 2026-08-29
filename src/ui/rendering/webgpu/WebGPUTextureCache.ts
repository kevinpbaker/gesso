import type { UiImage } from '../PaintState';
import type { TexturedPipeline } from './WebGPUPipeline';
import type { TextRenderItem } from './WebGPURenderData';

/** A GPU texture with the bind group that draws it, ready to reuse. */
export interface TextureEntry {
  texture: GPUTexture;
  bindGroup: GPUBindGroup;
  bytes: number;
  /** The last frame this entry was drawn in. */
  lastUsed: number;
}

export interface TextureCacheOptions {
  /** Total bytes of text textures kept before the least recently used go. */
  textBudgetBytes?: number;
  /** Frames a text texture may go unused before it is dropped regardless. */
  textMaxIdleFrames?: number;
}

const DEFAULT_TEXT_BUDGET_BYTES = 64 * 1024 * 1024;
const DEFAULT_TEXT_MAX_IDLE_FRAMES = 600;

/**
 * Textures for the textured pipeline: rasterised text runs and images.
 *
 * Text is drawn into a 2D canvas the size of the run and uploaded once
 * per distinct key; a run that scrolls, moves or changes vertical
 * alignment reuses its texture, because the key holds only what
 * changes the pixels. Images are uploaded once per ImageBitmap and
 * live as long as the bitmap does. Bind groups are created with their
 * texture and dropped with it, so a frame allocates nothing for a run
 * it has drawn before.
 *
 * Eviction is by byte budget with least-recently-used order, plus an
 * idle cap — not "unused this frame", which made scrolling back over
 * a list rasterise every run again.
 */
export class WebGPUTextureCache {
  private readonly text = new Map<string, TextureEntry>();
  private readonly images = new WeakMap<UiImage, TextureEntry>();
  private textBytes = 0;
  private frame = 0;
  private readonly textBudgetBytes: number;
  private readonly textMaxIdleFrames: number;

  constructor(
    private readonly device: GPUDevice,
    private readonly pipeline: TexturedPipeline,
    options: TextureCacheOptions = {}
  ) {
    this.textBudgetBytes = options.textBudgetBytes ?? DEFAULT_TEXT_BUDGET_BYTES;
    this.textMaxIdleFrames = options.textMaxIdleFrames ?? DEFAULT_TEXT_MAX_IDLE_FRAMES;
  }

  /** Number of text textures currently held. */
  get textCount(): number {
    return this.text.size;
  }

  /** Bytes of text textures currently held. */
  get textBytesHeld(): number {
    return this.textBytes;
  }

  /** Marks the start of a frame, for use tracking and eviction. */
  beginFrame(): void {
    this.frame++;
  }

  /** The bind group for a text run, rasterising it on first sight. */
  textBindGroup(item: TextRenderItem): GPUBindGroup | null {
    let entry = this.text.get(item.key);
    if (entry === undefined) {
      const texture = rasterizeText(this.device, item);
      if (texture === null) {
        return null;
      }
      entry = this.createEntry(texture, this.pipeline.textSampler);
      this.text.set(item.key, entry);
      this.textBytes += entry.bytes;
    }
    entry.lastUsed = this.frame;
    return entry.bindGroup;
  }

  /** The bind group for an image, uploading it on first sight. */
  imageBindGroup(image: UiImage): GPUBindGroup | null {
    let entry = this.images.get(image);
    if (entry === undefined) {
      const width = Math.max(1, Math.round(image.width));
      const height = Math.max(1, Math.round(image.height));
      const texture = createTexture(this.device, width, height);
      try {
        this.device.queue.copyExternalImageToTexture({ source: image }, { texture }, [width, height]);
      } catch {
        texture.destroy();
        return null;
      }
      entry = this.createEntry(texture, this.pipeline.imageSampler);
      this.images.set(image, entry);
    }
    entry.lastUsed = this.frame;
    return entry.bindGroup;
  }

  /**
   * Ends a frame: drops text textures idle past the cap, then the
   * least recently used until the byte budget holds.
   */
  endFrame(): void {
    for (const [key, entry] of this.text) {
      if (this.frame - entry.lastUsed > this.textMaxIdleFrames) {
        this.evict(key, entry);
      }
    }
    if (this.textBytes <= this.textBudgetBytes) {
      return;
    }
    const byAge = [...this.text.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key, entry] of byAge) {
      if (this.textBytes <= this.textBudgetBytes) {
        break;
      }
      if (entry.lastUsed === this.frame) {
        // Everything left was drawn this frame; over budget is the truth.
        break;
      }
      this.evict(key, entry);
    }
  }

  dispose(): void {
    for (const entry of this.text.values()) {
      entry.texture.destroy();
    }
    this.text.clear();
    this.textBytes = 0;
  }

  private evict(key: string, entry: TextureEntry): void {
    entry.texture.destroy();
    this.text.delete(key);
    this.textBytes -= entry.bytes;
  }

  private createEntry(texture: GPUTexture, sampler: GPUSampler): TextureEntry {
    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.pipeline.uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: texture.createView() }
      ]
    });
    return { texture, bindGroup, bytes: texture.width * texture.height * 4, lastUsed: this.frame };
  }
}

function createTexture(device: GPUDevice, width: number, height: number): GPUTexture {
  const textureBinding = typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage.TEXTURE_BINDING : 0x4;
  const copyDst = typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage.COPY_DST : 0x8;
  const renderAttachment = typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage.RENDER_ATTACHMENT : 0x10;
  return device.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
    usage: textureBinding | copyDst | renderAttachment
  });
}

/**
 * Draws a run's lines into a canvas at physical resolution and uploads
 * it. The lines are already relative to the texture origin, so this
 * is fillText per line and nothing else — the same calls Canvas2D
 * makes, on the same baselines.
 */
function rasterizeText(device: GPUDevice, item: TextRenderItem): GPUTexture | null {
  const width = Math.max(1, Math.round(item.width * item.dpr));
  const height = Math.max(1, Math.round(item.height * item.dpr));
  const canvas = createCanvas(width, height);
  if (canvas === null) {
    return null;
  }
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (ctx === null) {
    return null;
  }
  ctx.scale(item.dpr, item.dpr);
  ctx.font = item.font;
  ctx.fillStyle = item.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const line of item.lines) {
    ctx.fillText(line.text, line.x, line.baselineY);
  }

  const texture = createTexture(device, width, height);
  device.queue.copyExternalImageToTexture({ source: canvas as GPUImageCopyExternalImageSource }, { texture }, [
    width,
    height
  ]);
  return texture;
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}
