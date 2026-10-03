import type { UiTextRange } from '../properties/UiTextStyle';
import { wordRangeAt } from './TextBoundaries';

/**
 * A text as it is drawn: the source with its hidden runs taken out,
 * and the way between offsets in the one and offsets in the other.
 *
 * Every caret rule for hidden text comes down to this. A move or a
 * delete is worked out in the visible text, where a grapheme is
 * something the person can see, and the answer is taken back to the
 * source. Going back is the one choice there is to make: a visible
 * offset where hidden text sits is two source offsets, one before the
 * hidden text and one after it, and `side` says which.
 */
export class VisibleText {
  /** The characters that are drawn. */
  readonly text: string;

  constructor(
    readonly source: string,
    readonly hidden: readonly UiTextRange[]
  ) {
    let text = '';
    let at = 0;
    for (const range of hidden) {
      text += source.slice(at, range.start);
      at = range.end;
    }
    this.text = text + source.slice(at);
  }

  /** The visible offset of a source offset; one inside hidden text is where that text sits. */
  toVisible(offset: number): number {
    let removed = 0;
    for (const range of this.hidden) {
      if (offset <= range.start) {
        break;
      }
      removed += Math.min(offset, range.end) - range.start;
    }
    return offset - removed;
  }

  /**
   * The source offset of a visible one: before the hidden text sitting
   * there when `side` is -1, after it when 1. Where nothing is hidden
   * the two are the same.
   */
  toSource(offset: number, side: -1 | 1): number {
    let removed = 0;
    for (const range of this.hidden) {
      const at = range.start - removed;
      if (at > offset || (at === offset && side < 0)) {
        break;
      }
      removed += range.end - range.start;
    }
    return offset + removed;
  }
}

/** The hidden range an offset is strictly inside, if any: its ends are caret positions, its middle is not. */
export function hiddenRangeAround(hidden: readonly UiTextRange[], offset: number): UiTextRange | undefined {
  for (const range of hidden) {
    if (offset <= range.start) {
      return undefined;
    }
    if (offset < range.end) {
      return range;
    }
  }
  return undefined;
}

/** An offset moved out of hidden text to the nearer of its ends; the end on a tie. */
export function caretOffsetNear(hidden: readonly UiTextRange[], offset: number): number {
  const range = hiddenRangeAround(hidden, offset);
  if (range === undefined) {
    return offset;
  }
  return offset - range.start < range.end - offset ? range.start : range.end;
}

/**
 * The word under an offset, for a double click, in the text as drawn:
 * `**bold**` selects `bold`, the hidden markers on either side staying
 * out of the selection.
 */
export function visibleWordRange(
  text: string,
  hidden: readonly UiTextRange[],
  offset: number
): { start: number; end: number } {
  if (hidden.length === 0) {
    return wordRangeAt(text, offset);
  }
  const visible = new VisibleText(text, hidden);
  const word = wordRangeAt(visible.text, visible.toVisible(offset));
  const start = visible.toSource(word.start, 1);
  return { start, end: Math.max(start, visible.toSource(word.end, -1)) };
}
