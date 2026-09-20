import {
  type UiNode,
  WebGPURenderer,
  createWebGPUSurface,
  CanvasTextMeasurer,
  type WebGPUCanvasHost,
  type LayoutReader,
  type Canvas2DContext
} from 'gesso-core';

/**
 * WebGPU rendering pipeline for the playground.
 *
 * Mirrors CanvasPreview but uses the WebGPU backend. Because WebGPU
 * requires an async initialize() step, the first render call is a
 * no-op until the device is ready. If WebGPU is unavailable the
 * renderer stays unready and the preview shows a fallback message.
 *
 * Text measurement uses a separate OffscreenCanvas / hidden canvas so
 * the visible canvas can be configured exclusively for WebGPU.
 */
export class WebGPUPreview {
  readonly surface;
  readonly renderer: WebGPURenderer;
  readonly textMeasurer: CanvasTextMeasurer;
  private initialized = false;
  private initError: string | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.textMeasurer = new CanvasTextMeasurer(this.acquireTextContext());
    this.surface = createWebGPUSurface(this.canvas as unknown as WebGPUCanvasHost);
    this.renderer = new WebGPURenderer({ surface: this.surface });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    try {
      await this.renderer.initialize();
      this.initialized = true;
    } catch (error) {
      this.initError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  get isReady(): boolean {
    return this.initialized && this.renderer.isReady;
  }

  get error(): string | null {
    return this.initError;
  }

  setLogicalSize(width: number, height: number, dpr: number = 1): void {
    this.renderer.resize(width, height, dpr);
  }

  render(root: UiNode, layout: LayoutReader): void {
    if (!this.isReady) {
      return;
    }
    this.renderer.render(root, { layout, text: this.textMeasurer });
  }

  dispose(): void {
    this.renderer.dispose();
  }

  private acquireTextContext(): Canvas2DContext {
    if (typeof OffscreenCanvas !== 'undefined') {
      const offscreen = new OffscreenCanvas(1, 1);
      const ctx = offscreen.getContext('2d');
      if (ctx !== null) {
        return ctx as unknown as Canvas2DContext;
      }
    }
    const hidden = document.createElement('canvas');
    hidden.width = 1;
    hidden.height = 1;
    const ctx = hidden.getContext('2d');
    if (ctx === null) {
      throw new Error('WebGPUPreview: no 2D context available for text measurement.');
    }
    return ctx as unknown as Canvas2DContext;
  }
}
