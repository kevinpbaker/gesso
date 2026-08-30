import type { Canvas2DContext } from './Canvas2DContext';

/**
 * Something that can host a 2D drawing surface.
 *
 * Covers both HTMLCanvasElement (main thread) and OffscreenCanvas
 * (Worker) without naming either type, so the rendering core stays
 * DOM-free. Both canvas types satisfy this structurally.
 */
export interface CanvasHost {
  width: number;
  height: number;
  getContext(contextId: '2d'): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
}

/**
 * Logical/physical viewport bookkeeping for a canvas surface.
 *
 * Layout and drawing operate in logical (CSS-like) pixels; the
 * backing store holds physical = logical × dpr. Resizing the
 * surface never touches UiNodes, layout records, or bindings - the
 * runtime is told about the new viewport through its existing
 * constraint mechanism and simply renders the next frame.
 */
export class CanvasSurface {
  private logicalW = 0;
  private logicalH = 0;
  private pixelRatio = 1;
  private context: Canvas2DContext | null = null;

  constructor(private readonly canvas: CanvasHost) {}

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
   * The 2D context for the backing store, acquired lazily.
   */
  getContext2D(): Canvas2DContext {
    if (this.context === null) {
      this.context = this.acquireContext();
    }
    return this.context;
  }

  private acquireContext(): Canvas2DContext {
    // The two real context types are structurally compatible with
    // Canvas2DContext; the widening lives at this boundary only.
    const context = this.canvas.getContext('2d') as unknown as Canvas2DContext;
    if (context === null) {
      throw new Error('CanvasSurface: canvas 2D context is unavailable.');
    }
    return context;
  }

  /**
   * Resizes the backing store to logical × dpr.
   *
   * The canvas backing store is only reassigned when the physical
   * size actually changes; reassigning resets context state, so
   * unchanged frames are not disturbed.
   */
  setLogicalSize(width: number, height: number, dpr: number = 1): void {
    this.logicalW = width;
    this.logicalH = height;
    this.pixelRatio = dpr;
    const physicalWidth = Math.max(1, Math.round(width * dpr));
    const physicalHeight = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== physicalWidth || this.canvas.height !== physicalHeight) {
      this.canvas.width = physicalWidth;
      this.canvas.height = physicalHeight;
      // A backing-store resize resets the context state, so an
      // already-cached context is stale. Reacquire immediately so
      // the next frame starts from a clean context; when no context
      // was ever acquired, stay lazy.
      if (this.context !== null) {
        this.context = this.acquireContext();
      }
    }
  }
}

/**
 * Wraps any canvas host (HTMLCanvasElement, OffscreenCanvas, or a
 * test double) in the logical/physical viewport bookkeeping.
 */
export function createCanvasSurface(host: CanvasHost): CanvasSurface {
  return new CanvasSurface(host);
}
