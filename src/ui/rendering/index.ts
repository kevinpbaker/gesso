export { Canvas2DRenderer, traceRoundedRect } from './Canvas2DRenderer';
export type { Canvas2DRendererOptions } from './Canvas2DRenderer';
export type { Canvas2DContext } from './Canvas2DContext';
export { CanvasSurface, createCanvasSurface } from './CanvasSurface';
export type { CanvasHost } from './CanvasSurface';
export { CanvasTextMeasurer } from './CanvasTextMeasurer';
export {
  createPaintState,
  resolvePaintState,
  normalizeTextAlign,
  normalizeVerticalAlign,
  parseTransform,
  computeObjectFitRect,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_WEIGHT,
  DEFAULT_TEXT_COLOR,
  DEFAULT_LINE_HEIGHT_FACTOR
} from './PaintState';
export type { PaintState, UiTransform, UiImage, TextAlign, VerticalAlign, ObjectFit } from './PaintState';
export type { LayoutReader, RenderContext } from './RenderContext';
export { layoutTextLines, drawText, buildFontString } from './TextRenderer';
export type { TextLinePlacement } from './TextRenderer';
export type { UiRenderer } from './UiRenderer';
