export { CanvasEditor, type CanvasEditorProps } from './CanvasEditor';
export {
  canvasEditing,
  boxPoints,
  type CanvasEditing,
  type CanvasEditingOptions,
  type CanvasEdit,
  type CanvasEditPhase,
  type CanvasEditKind,
  type CanvasShape,
  type CanvasHandle,
  type CanvasSnapOptions,
  type CanvasSnapContext
} from './canvasEditing';
export {
  BOX_HANDLES,
  boxHandlePoint,
  boxHandleCursor,
  resizeRect,
  unionRect,
  rectFrom,
  rectsTouch,
  rectContains,
  pointInRect,
  snapPoint,
  snapMove,
  holdAngle,
  readoutNumber,
  readoutText,
  type BoxHandle,
  type CanvasPoint,
  type CanvasRect,
  type SnapGuide,
  type SnapHit,
  type SnapTarget
} from './geometry';
export {
  paintCanvasOverlay,
  paintReadout,
  EMPTY_OVERLAY,
  HANDLE_SIZE,
  type CanvasOverlayState,
  type CanvasOverlayColors
} from './overlay';
