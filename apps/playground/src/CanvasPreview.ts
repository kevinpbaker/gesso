import {
  type UiNode,
  Canvas2DRenderer,
  CanvasSurface,
  CanvasTextMeasurer,
  createCanvasSurface,
  type CanvasHost,
  type LayoutReader
} from '@gesso/core';

/**
 * The real rendering pipeline for the playground, exposed so the
 * browser page can prove the library works end-to-end.
 *
 * Owns the surface, a canvas-backed text measurer (shared with the
 * layout engine so layout and paint always agree) and the
 * Canvas2DRenderer. render() is called once per frame after the
 * LayoutPlayground has produced fresh LayoutRecords.
 *
 * DOM-free except for the injected CanvasHost: a unit test can back
 * it with a recording context and assert the exact draw calls.
 */
export class CanvasPreview {
  readonly surface: CanvasSurface;
  readonly renderer: Canvas2DRenderer;
  readonly textMeasurer: CanvasTextMeasurer;

  constructor(host: CanvasHost) {
    this.surface = createCanvasSurface(host);
    this.textMeasurer = new CanvasTextMeasurer(this.surface.getContext2D());
    this.renderer = new Canvas2DRenderer({ surface: this.surface });
  }

  setLogicalSize(width: number, height: number, dpr: number = 1): void {
    this.surface.setLogicalSize(width, height, dpr);
  }

  render(root: UiNode, layout: LayoutReader): void {
    this.renderer.render(root, { layout, text: this.textMeasurer });
  }
}
