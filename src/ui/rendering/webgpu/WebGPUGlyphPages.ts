import type { TexturedPipeline } from './WebGPUPipeline';
import type { WebGPUGlyphAtlas, GlyphUpload } from './WebGPUGlyphAtlas';
import { createTexture, createTexturedBindGroup } from './WebGPUTextureCache';

/**
 * The GPU half of the glyph atlas: one texture per page, and the
 * rasterisation that fills the cells the builder allocated.
 *
 * The builder runs before this and has already decided where every
 * glyph goes, so all that is left here is to draw each newly allocated
 * cluster into a scratch canvas and copy it into its cell. That copy
 * happens once per glyph for the life of the page — a scrolling list
 * of a thousand rows uploads nothing after its first frame, because
 * the second row's letters are the first row's.
 *
 * Cells are rasterised in the run's own colour, so what the sampler
 * reads is exactly what `fillText` would have put on the canvas.
 */
export class WebGPUGlyphPages {
  private readonly textures: (GPUTexture | null)[] = [];
  private readonly bindGroups: (GPUBindGroup | null)[] = [];
  private scratch: OffscreenCanvas | HTMLCanvasElement | null = null;
  private scratchContext: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  /** Cells uploaded since the renderer was created; for tests and metrics. */
  uploads = 0;

  constructor(
    private readonly device: GPUDevice,
    private readonly pipeline: TexturedPipeline,
    private readonly atlas: WebGPUGlyphAtlas
  ) {}

  /**
   * Recycles the textures of cleared pages and rasterises every cell
   * the last build allocated. Call after building a render list and
   * before encoding the pass that draws it.
   */
  flush(): void {
    for (const page of this.atlas.takeCleared()) {
      this.textures[page]?.destroy();
      this.textures[page] = null;
      this.bindGroups[page] = null;
    }
    const pending = this.atlas.takePending();
    for (const upload of pending) {
      this.upload(upload);
    }
  }

  /** The bind group for a page, creating its texture on first use. */
  bindGroup(page: number): GPUBindGroup | null {
    const existing = this.bindGroups[page];
    if (existing !== undefined && existing !== null) {
      return existing;
    }
    const texture = this.textureFor(page);
    if (texture === null) {
      return null;
    }
    const bindGroup = createTexturedBindGroup(this.device, this.pipeline, texture, this.pipeline.textSampler);
    this.bindGroups[page] = bindGroup;
    return bindGroup;
  }

  dispose(): void {
    for (const texture of this.textures) {
      texture?.destroy();
    }
    this.textures.length = 0;
    this.bindGroups.length = 0;
    this.scratch = null;
    this.scratchContext = null;
  }

  private textureFor(page: number): GPUTexture | null {
    const existing = this.textures[page];
    if (existing !== undefined && existing !== null) {
      return existing;
    }
    const size = this.atlas.pageSize;
    const texture = createTexture(this.device, size, size);
    this.textures[page] = texture;
    return texture;
  }

  private upload(upload: GlyphUpload): void {
    const context = this.scratchFor(upload.pixelWidth, upload.pixelHeight);
    if (context === null) {
      return;
    }
    const texture = this.textureFor(upload.slot.page);
    if (texture === null) {
      return;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, upload.pixelWidth, upload.pixelHeight);
    context.scale(upload.dpr, upload.dpr);
    context.font = upload.font;
    context.fillStyle = upload.color;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    // The pen is in physical pixels — its subpixel phase is a fraction
    // of one — and the context is scaled to logical, so divide it back.
    context.fillText(upload.cluster, upload.penX / upload.dpr, upload.penY / upload.dpr);

    this.device.queue.copyExternalImageToTexture(
      { source: this.scratch as GPUImageCopyExternalImageSource },
      { texture, origin: [upload.pageX, upload.pageY] },
      [upload.pixelWidth, upload.pixelHeight]
    );
    this.uploads++;
  }

  /**
   * One scratch canvas, grown to the largest cell seen. Growing resets
   * the context, which costs nothing here: every draw sets its own
   * font, fill and transform.
   */
  private scratchFor(width: number, height: number): typeof this.scratchContext {
    const canvas = this.scratch;
    if (canvas !== null && canvas.width >= width && canvas.height >= height) {
      return this.scratchContext;
    }
    const nextWidth = Math.max(width, canvas?.width ?? 0);
    const nextHeight = Math.max(height, canvas?.height ?? 0);
    const created = createCanvas(nextWidth, nextHeight);
    if (created === null) {
      return null;
    }
    this.scratch = created;
    this.scratchContext = created.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    return this.scratchContext;
  }
}

function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement | null {
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
