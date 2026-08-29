import { WebGPUError } from './WebGPUError';

/**
 * Converts a logical dimension to the physical pixel count of the
 * backing store.
 *
 * This is the single definition of that rule, and everything that
 * derives a physical rectangle — scissor rects above all — must go
 * through it. WebGPU rejects a scissor that extends past its
 * attachment by even one pixel, and the rejection discards the whole
 * command buffer, so a backing store rounded one way and a scissor
 * rounded another silently drops every draw in the frame.
 */
export function toPhysicalPixels(logical: number, dpr: number): number {
  return Math.max(1, Math.round(logical * dpr));
}

/**
 * Something that can host a WebGPU drawing surface.
 *
 * HTMLCanvasElement and OffscreenCanvas both satisfy this
 * structurally; the widening to concrete canvas types lives only at
 * the platform boundary.
 */
export interface WebGPUCanvasHost {
  width: number;
  height: number;
  getContext(contextId: 'webgpu'): GPUCanvasContext | null;
}

/**
 * Logical/physical viewport bookkeeping for a WebGPU canvas surface.
 *
 * Mirrors CanvasSurface but for WebGPU: layout works in logical
 * pixels, the configured GPU texture is physical = logical * dpr.
 */
export class WebGPUSurface {
  private logicalW = 0;
  private logicalH = 0;
  private pixelRatio = 1;
  private context: GPUCanvasContext | null = null;
  private configured = false;

  constructor(private readonly canvas: WebGPUCanvasHost) {}

  get logicalWidth(): number {
    return this.logicalW;
  }

  get logicalHeight(): number {
    return this.logicalH;
  }

  get dpr(): number {
    return this.pixelRatio;
  }

  get physicalWidth(): number {
    return this.canvas.width;
  }

  get physicalHeight(): number {
    return this.canvas.height;
  }

  /**
   * The WebGPU context for the backing store, acquired lazily.
   */
  getContext(): GPUCanvasContext {
    if (this.context === null) {
      this.context = this.acquireContext();
    }
    return this.context;
  }

  private acquireContext(): GPUCanvasContext {
    const context = this.canvas.getContext('webgpu');
    if (context === null) {
      throw new WebGPUError('Canvas webgpu context is unavailable.', 'context');
    }
    return context;
  }

  /**
   * Configures the context with the supplied device and format.
   *
   * Reconfiguration is skipped when the physical size has not changed
   * so that the existing GPU texture and swap chain stay valid.
   */
  configure(device: GPUDevice, format: GPUTextureFormat): void {
    const ctx = this.getContext();
    ctx.configure({
      device,
      format,
      alphaMode: 'premultiplied'
    });
    this.configured = true;
  }

  unconfigure(): void {
    if (this.context !== null && this.configured) {
      this.context.unconfigure();
      this.configured = false;
    }
  }

  /**
   * Resizes the backing store to logical * dpr.
   *
   * Does not reconfigure the GPU context here: the renderer checks
   * whether the physical size changed and reconfigures when needed.
   */
  setLogicalSize(width: number, height: number, dpr: number = 1): boolean {
    this.logicalW = width;
    this.logicalH = height;
    this.pixelRatio = dpr;
    const physicalWidth = toPhysicalPixels(width, dpr);
    const physicalHeight = toPhysicalPixels(height, dpr);
    const changed = this.canvas.width !== physicalWidth || this.canvas.height !== physicalHeight;
    if (changed) {
      this.canvas.width = physicalWidth;
      this.canvas.height = physicalHeight;
    }
    return changed;
  }

  getCurrentTexture(): GPUTexture {
    return this.getContext().getCurrentTexture();
  }
}

export function createWebGPUSurface(host: WebGPUCanvasHost): WebGPUSurface {
  return new WebGPUSurface(host);
}
