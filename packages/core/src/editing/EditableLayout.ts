import type { LayoutBox } from '../layout/LayoutTypes';
import type { TextMeasurer } from '../layout/TextMeasurer';
import type { PaintState } from '../rendering/PaintState';
import { placeLines, textMeasureRequest, type TextLinePlacement } from '../rendering/TextRenderer';
import type { EditableTextModel } from './EditableTextModel';
import {
  caretRectFor,
  offsetAtPoint,
  offsetForVerticalMove,
  selectionRects,
  type CaretRect,
  type RunMeasure
} from './TextGeometry';

/**
 * An editable's text laid out in its content box, with the geometry
 * questions input and painting ask of it.
 *
 * Built by the controller (to place the caret from a click, move it
 * vertically, and report its rectangle to the shell) and by both
 * renderers (to draw the selection, the composition underline and the
 * caret), from the same paint state and measurer the layout engine
 * sized the node with — so all of them see the same lines.
 *
 * Coordinates are those of `box`: callers pass the content box in
 * whatever space they work in (node-local for input, the parent's
 * content space for paint).
 */
export class EditableLayout {
  /** The text's lines; always at least one, so an empty field has a caret line. */
  readonly lines: readonly TextLinePlacement[];
  /** The placeholder's lines while the text is empty and one is set. */
  readonly placeholderLines: readonly TextLinePlacement[];
  readonly measure: RunMeasure;
  readonly rtl: boolean;

  constructor(
    readonly model: EditableTextModel,
    readonly box: LayoutBox,
    state: PaintState,
    measurer: TextMeasurer
  ) {
    const request = textMeasureRequest(model.text, state, box);
    // An editable never ellipsises or clamps: every character the user
    // typed has a caret position.
    request.maxLines = undefined;
    request.overflow = 'clip';
    this.lines = placeLines(box, state, measurer.layout(request));
    this.measure = text => (text.length === 0 ? 0 : measurer.measureRunWidth(text, request));
    this.rtl = state.rtl;
    this.placeholderLines =
      model.text.length === 0 && state.placeholder !== undefined && state.placeholder.length > 0
        ? placeLines(box, state, measurer.layout({ ...request, text: state.placeholder }))
        : [];
  }

  caretRect(offset: number = this.model.focus): CaretRect {
    return caretRectFor(this.lines, this.model.text, offset, this.measure, this.rtl);
  }

  offsetAt(x: number, y: number): number {
    return offsetAtPoint(this.lines, this.model.text, x, y, this.measure, this.rtl);
  }

  verticalMove(offset: number, direction: -1 | 1, goalX?: number): { offset: number; x: number } | null {
    return offsetForVerticalMove(this.lines, this.model.text, offset, direction, this.measure, this.rtl, goalX);
  }

  /** Boxes behind the selected text. */
  selectionBoxes(): LayoutBox[] {
    return selectionRects(this.lines, this.model.text, this.model.start, this.model.end, this.measure, this.rtl);
  }

  /** Boxes under the text the IME is composing, for its underline. */
  compositionBoxes(): LayoutBox[] {
    const range = this.model.composition;
    if (range === null) {
      return [];
    }
    return selectionRects(this.lines, this.model.text, range.start, range.end, this.measure, this.rtl);
  }
}
