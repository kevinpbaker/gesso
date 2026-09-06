export { Canvas2DRenderer, traceRoundedRect } from './canvas2d/Canvas2DRenderer';
export type { Canvas2DRendererOptions } from './canvas2d/Canvas2DRenderer';
export type { Canvas2DContext } from './canvas2d/Canvas2DContext';
export { CanvasSurface, createCanvasSurface } from './canvas2d/CanvasSurface';
export type { CanvasHost } from './canvas2d/CanvasSurface';
export { CanvasTextMeasurer } from './canvas2d/CanvasTextMeasurer';
export { LayoutInspector, INSPECTOR_HEAT_MS } from './LayoutInspector';
export type { InspectorOverlay, LayoutInspectorOptions } from './LayoutInspector';
export { drawOverlayShapes, labelOrigin, LABEL_PADDING_X } from './OverlayShapes';
export type { OverlayShape } from './OverlayShapes';
export { decorationColor, decorationRect, hasDecorationPhase, paintsAfterChildren } from './Decorations';
export type { DecorationShape, DecorationFill, DecorationStroke, DecorationRect } from './Decorations';
export { DefaultImageResolver } from './ImageResolver';
export type { ImageResolver, DefaultImageResolverOptions } from './ImageResolver';
export { IconRasterizer, iconKey } from './IconRasterizer';
export type { IconSpec, IconRasterizerOptions, IconCanvas, IconContext } from './IconRasterizer';
export {
  createPaintState,
  resolvePaintState,
  isPaintVisible,
  normalizeTextAlign,
  normalizeVerticalAlign,
  computeObjectFitRect,
  colorToCss,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_WEIGHT,
  DEFAULT_TEXT_COLOR,
  DEFAULT_LINE_HEIGHT_FACTOR
} from './PaintState';
export type { PaintState, UiImage, TextAlign, VerticalAlign, ObjectFit } from './PaintState';
export { paintValuesEqual, pathValuesEqual, inputsEqual } from './PaintSurface';
export type {
  PaintSurface,
  PaintBox,
  PaintFillRule,
  PaintLineCap,
  PaintLineJoin,
  PaintTextAlign,
  PaintTextStyle,
  UiPaint,
  UiPath
} from './PaintSurface';
export { PaintRecorder, replayPaint, EMPTY_RECORDING } from './PaintRecording';
export type { PaintOp, PaintRecording } from './PaintRecording';
export { tracePathData } from './PaintPathData';
export { PaintTarget } from './PaintTarget';
export type { PaintContext2D, PaintGradient, PaintResolver } from './PaintTarget';
export { PaintPictureCache, paintPictures } from './PaintPicture';
export type { PaintCanvas, PaintCanvasFactory, PaintStats } from './PaintPicture';
export { parseTransform } from '../properties/UiTransform';
export type { UiTransform } from '../properties/UiTransform';
export type { LayoutReader, RenderContext } from './RenderContext';
export {
  layoutTextLines,
  drawText,
  buildFontString,
  runFontString,
  applyCanvasTextStyle,
  createCanvasTextStyle,
  runCanvasStyleInto,
  fillTextRects,
  textRunBackgrounds,
  textRunDecorations
} from './TextRenderer';
export { registerFontStack, fontStackFor, bumpFontStack, clearFontStacks } from './FontStacks';
export type { TextLinePlacement, PlacedTextRun, TextRunRect, CanvasTextStyle, SpanPaint } from './TextRenderer';
export type { PaintTextSpan } from './PaintState';
export type { UiRenderer, RendererBackend } from './UiRenderer';
export { WebGPURenderer } from './webgpu/WebGPURenderer';
export type { WebGPURendererOptions, RenderHooks, DrawStats, CapturedFrame } from './webgpu/WebGPURenderer';
export { createWebGPUSurface, WebGPUSurface } from './webgpu/WebGPUSurface';
export type { WebGPUCanvasHost } from './webgpu/WebGPUSurface';
export { WebGPUError } from './webgpu/WebGPUError';
export { initializeWebGPU, isWebGPUAvailable } from './webgpu/WebGPUDevice';
export {
  buildRenderList,
  createTextCache,
  textRuns,
  glyphCount,
  INSTANCE_STRIDE_FLOATS,
  INSTANCE_STRIDE_BYTES,
  TEXTURED_STRIDE_FLOATS,
  TEXTURED_STRIDE_BYTES,
  CLIP_STRIDE_FLOATS,
  CLIP_STRIDE_BYTES,
  NO_CLIP_INDEX,
  CommandKind,
  PrimitiveKind
} from './webgpu/WebGPURenderData';
export type {
  RenderList,
  RenderCommand,
  PrimitiveCommand,
  GlyphCommand,
  ImageCommand,
  TextRunDraw,
  RenderTextCache,
  ScissorRect,
  Affine
} from './webgpu/WebGPURenderData';
export { WebGPUTextureCache } from './webgpu/WebGPUTextureCache';
export { WebGPUGlyphAtlas, GLYPH_SUBPIXEL_PHASES } from './webgpu/WebGPUGlyphAtlas';
export type { GlyphSlot, GlyphUpload } from './webgpu/WebGPUGlyphAtlas';
export { GlyphShaper } from './webgpu/WebGPUGlyphShaper';
export { WebGPUGlyphPages } from './webgpu/WebGPUGlyphPages';
