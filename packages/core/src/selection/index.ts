export {
  TEXT_SELECTION_PROP,
  selectionRangeOf,
  setSelectionRange,
  clearSelectionRange,
  selectableTextOf,
  selectableTextNodes,
  type TextRange
} from './UiSelectable';
export {
  paragraphGeometry,
  paragraphGeometryFrom,
  hasDrawnText,
  offsetAtPointIn,
  selectionRectsIn,
  wordRangeIn,
  type ParagraphGeometry
} from './TextSelectionGeometry';
export { UiSelectionController, type SelectionHost, type SelectionControllerOptions } from './UiSelectionController';
export { linkHoverOf, setLinkHover, clearLinkHover, hasTextLinks, linkOf, linkRunAtPointIn } from './UiTextLinks';
