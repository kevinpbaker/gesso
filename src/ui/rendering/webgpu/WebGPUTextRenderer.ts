import type { TextMeasurer } from '../../layout/TextMeasurer';
import type { LayoutBox } from '../../layout/LayoutTypes';
import { layoutTextLines, buildFontString } from '../TextRenderer';
import {
  createPaintState,
  normalizeTextOverflow,
  normalizeTextWrap,
  type TextAlign,
  type VerticalAlign
} from '../PaintState';
import { createTextPipeline, TEXT_INSTANCE_STRIDE_FLOATS, type TextPipeline } from './WebGPUTextPipeline';
import type { TextRenderItem } from './WebGPURenderData';
import { viewportScissor } from './WebGPURenderData';

interface TextTexture {
  texture: GPUTexture;
  width: number;
  height: number;
  generation: number;
}

export class WebGPUTextRenderer {
  private pipeline: TextPipeline | null = null;
  private readonly cache = new Map<string, TextTexture>();
  private generation = 0;
  private readonly scratchPaint = createPaintState();

  constructor(
    private readonly device: GPUDevice,
    private readonly format: GPUTextureFormat
  ) {}

  initialize(): void {
    this.pipeline = createTextPipeline(this.device, this.format);
  }

  dispose(): void {
    for (const entry of this.cache.values()) {
      entry.texture.destroy();
    }
    this.cache.clear();
    this.pipeline = null;
  }

  render(
    pass: GPURenderPassEncoder,
    items: readonly TextRenderItem[],
    measurer: TextMeasurer,
    logicalWidth: number,
    logicalHeight: number,
    dpr: number
  ): void {
    if (this.pipeline === null || items.length === 0) {
      return;
    }

    this.generation++;
    const viewport = viewportScissor(logicalWidth, logicalHeight, dpr);

    const instanceData = new Float32Array(items.length * TEXT_INSTANCE_STRIDE_FLOATS);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const offset = i * TEXT_INSTANCE_STRIDE_FLOATS;
      const snapX = Math.round(item.x * dpr) / dpr;
      const snapY = Math.round(item.y * dpr) / dpr;
      const snapW = Math.round(item.width * dpr) / dpr;
      const snapH = Math.round(item.height * dpr) / dpr;
      const transform = translateTransform(item.transform, snapX - item.x, snapY - item.y);
      instanceData[offset + 0] = 0;
      instanceData[offset + 1] = 0;
      instanceData[offset + 2] = snapW;
      instanceData[offset + 3] = snapH;
      instanceData[offset + 4] = item.opacity;
      // Padding keeps the following vec2f transforms 8-byte aligned.
      instanceData[offset + 5] = 0;
      instanceData[offset + 6] = transform[0];
      instanceData[offset + 7] = transform[1];
      instanceData[offset + 8] = transform[2];
      instanceData[offset + 9] = transform[3];
      instanceData[offset + 10] = transform[4];
      instanceData[offset + 11] = transform[5];
    }

    const vertexUsage = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.VERTEX : 0x20;
    const copyDstUsage = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.COPY_DST : 0x8;
    const instanceBuffer = this.device.createBuffer({
      size: instanceData.byteLength,
      usage: vertexUsage | copyDstUsage,
      mappedAtCreation: true
    });
    new Float32Array(instanceBuffer.getMappedRange()).set(instanceData);
    instanceBuffer.unmap();

    this.device.queue.writeBuffer(this.pipeline.uniformBuffer, 0, new Float32Array([logicalWidth, logicalHeight]));

    pass.setPipeline(this.pipeline.pipeline);
    pass.setVertexBuffer(0, this.pipeline.vertexBuffer);
    pass.setVertexBuffer(1, instanceBuffer);
    pass.setIndexBuffer(this.pipeline.indexBuffer, 'uint16');

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.width <= 0 || item.height <= 0) {
        continue;
      }
      const snapX = Math.round(item.x * dpr) / dpr;
      const snapY = Math.round(item.y * dpr) / dpr;
      const snapW = Math.round(item.width * dpr) / dpr;
      const snapH = Math.round(item.height * dpr) / dpr;
      const key = cacheKey(item, snapW, snapH);
      let cached = this.cache.get(key);
      if (cached === undefined) {
        const raster = this.rasterize(item, measurer, dpr, snapX, snapY, snapW, snapH);
        if (raster === null) {
          continue;
        }
        cached = { ...raster, generation: this.generation };
        this.cache.set(key, cached);
      }
      cached.generation = this.generation;

      const scissor = item.scissor ?? viewport;
      pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);

      const bindGroup = this.device.createBindGroup({
        layout: this.pipeline.uniformBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.pipeline.uniformBuffer } },
          { binding: 1, resource: this.pipeline.sampler },
          { binding: 2, resource: cached.texture.createView() }
        ]
      });

      pass.setBindGroup(0, bindGroup);
      pass.drawIndexed(this.pipeline.indexCount, 1, 0, 0, i);
    }

    // Evict textures that were not used this frame.
    for (const [key, entry] of this.cache) {
      if (entry.generation !== this.generation) {
        entry.texture.destroy();
        this.cache.delete(key);
      }
    }
  }

  private rasterize(
    item: TextRenderItem,
    measurer: TextMeasurer,
    dpr: number,
    snapX: number,
    snapY: number,
    snapW: number,
    snapH: number
  ): Pick<TextTexture, 'texture' | 'width' | 'height'> | null {
    const canvas = createCanvas(Math.round(snapW * dpr), Math.round(snapH * dpr));
    if (canvas === null) {
      return null;
    }

    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      return null;
    }

    ctx.scale(dpr, dpr);

    const box: LayoutBox = {
      x: snapX,
      y: snapY,
      width: snapW,
      height: snapH
    };

    const paint = this.scratchPaint;
    paint.text = item.text;
    paint.fontSize = item.fontSize;
    paint.fontFamily = item.fontFamily;
    paint.fontWeight = item.fontWeight;
    paint.lineHeight = item.lineHeight;
    paint.textAlign = item.textAlign as TextAlign;
    paint.verticalAlign = item.verticalAlign as VerticalAlign;
    paint.textWrap = normalizeTextWrap(item.textWrap);
    paint.maxLines = item.maxLines;
    paint.textOverflow = normalizeTextOverflow(item.textOverflow);

    const placements = layoutTextLines(box, paint, measurer);
    if (placements.length === 0) {
      return null;
    }

    ctx.font = buildFontString(paint);
    ctx.fillStyle = item.textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    for (const placement of placements) {
      const drawX = Math.round((placement.x - snapX) * dpr) / dpr;
      const drawY = Math.round((placement.baselineY - snapY) * dpr) / dpr;
      ctx.fillText(placement.text, drawX, drawY);
    }

    const width = canvas.width;
    const height = canvas.height;
    const textureBindingUsage = typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage.TEXTURE_BINDING : 0x4;
    const copyDstTextureUsage = typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage.COPY_DST : 0x8;
    const renderAttachmentUsage = typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage.RENDER_ATTACHMENT : 0x10;
    const texture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: textureBindingUsage | copyDstTextureUsage | renderAttachmentUsage
    });

    this.device.queue.copyExternalImageToTexture({ source: canvas as GPUImageCopyExternalImageSource }, { texture }, [
      width,
      height
    ]);

    return { texture, width, height };
  }
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

function cacheKey(item: TextRenderItem, width: number, height: number): string {
  return [
    item.text,
    String(item.fontSize),
    item.fontFamily,
    String(item.fontWeight),
    String(item.lineHeight),
    item.textAlign,
    item.verticalAlign,
    item.textWrap,
    String(item.maxLines ?? ''),
    item.textOverflow,
    item.textColor,
    String(width),
    String(height)
  ].join('\0');
}

function translateTransform(
  transform: [number, number, number, number, number, number],
  dx: number,
  dy: number
): [number, number, number, number, number, number] {
  return [transform[0], transform[1], transform[2], transform[3], transform[4] + dx, transform[5] + dy];
}
