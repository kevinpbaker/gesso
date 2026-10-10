import type { LayoutBox } from '../layout/LayoutTypes';
import type { UiNode } from '../graph/UiNode';

/**
 * A surface that takes text but keeps and draws its text itself: a code
 * editor, a terminal, a whiteboard with a caret on it.
 *
 * `EditableText` owns its text, and the editing controller edits it.
 * Some surfaces cannot hand their text to anybody. A code editor holds
 * a window of a file that lives in shared memory, has many carets, and
 * draws every line itself; what it needs from the platform is only what
 * a canvas cannot get on its own: the text the browser resolved from
 * the keyboard layout, dead keys and an IME, the clipboard, and an IME
 * candidate window that opens beside its caret.
 *
 * A node with `textInput` gets those. While it has focus the shell's
 * editing proxy takes DOM focus for it, as it does for a field, and:
 *
 *   - typed text, a dictation or an autocorrection arrives as
 *     `onBeforeInput` (`insertText`, `insertReplacementText`, ...), and
 *     a cut as `onBeforeInput` with `deleteByCut`;
 *   - an IME's composition arrives as `onCompositionStart`,
 *     `onCompositionUpdate` and `onCompositionEnd`;
 *   - a paste arrives as `onPaste`;
 *   - a copy or a cut takes what `clipboard` says, or else the
 *     selected part of `text`.
 *
 * Keys still arrive as `onKeyDown` first. A printable key's text
 * follows it as `onBeforeInput` when `event.textFollows` is true;
 * calling `preventDefault()` on the key drops that text, as it does in
 * a browser. When `textFollows` is false (a test, or a key typed in
 * the moment before the proxy took focus) nothing follows, and the
 * surface inserts the key itself.
 */
export type UiTextInput = () => UiTextInputState;

/** What the shell mirrors for a focused `textInput` surface, asked for every frame it has focus. */
export interface UiTextInputState {
  /**
   * Text around the caret, which an IME reads for context and a screen
   * reader reads as the field's value. A line, or the selection.
   */
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  /** The caret, in the node's own coordinates: where the IME's candidate window opens. */
  readonly caret: LayoutBox;
  /** True (the default) when Enter inserts a line rather than submitting. */
  readonly multiline?: boolean;
  /**
   * What a copy or a cut puts on the clipboard, when it is not the
   * selected part of `text`: several selections joined, or a code
   * editor's whole line when nothing is selected. A cut is offered as
   * `deleteByCut` whenever this is non-empty, selection or not.
   */
  readonly clipboard?: string;
}

/** The node's text input surface, if it is one. */
export function textInputOf(node: UiNode): UiTextInput | undefined {
  const value = node.properties.get('textInput');
  return typeof value === 'function' ? (value as UiTextInput) : undefined;
}
