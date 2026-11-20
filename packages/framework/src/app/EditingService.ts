import {
  editorFor,
  isEditableNode,
  isReadOnly,
  type CaretRect,
  type UiEditingController,
  type UiNode,
  type UiSelectionController,
  type UiTextPosition
} from 'gesso-core';

/** The clipboard, as the shell offers it; see `ShellService.copyText` and `readText`. */
export interface EditingClipboard {
  copyText(text: string): Promise<boolean>;
  readText(): Promise<string | null>;
}

/**
 * The part of a text field an application has to ask about.
 *
 * Almost everything about an editable is reachable already: its text
 * is a property, its model is on the node, and its changes arrive as
 * events. Its *geometry* is not, and cannot be — where the caret sits
 * depends on the paragraph as it was laid out, which needs the
 * measurer, the resolved paint and the layout record. An application
 * that re-measured the text to work it out would be a second measurer
 * that must never disagree with the engine's, which is the kind of
 * pair that agrees until the day it does not.
 *
 * So it asks. This is the asking, and it is a service rather than a
 * free function because the controller lives in the input stack and
 * is out of a component's reach without something in front of it —
 * the same reason `FocusService` exists.
 *
 * What it is for: putting something *at* the caret. An autocomplete
 * list under the word being typed, a hint about the argument being
 * filled in, an error shown against the character it is about.
 */
export class EditingService {
  private controller: UiEditingController | null = null;
  private selection: UiSelectionController | null = null;
  private clipboard: EditingClipboard | null = null;

  /** Installed by the runtime; without one there is nothing to ask. */
  setController(controller: UiEditingController | null): void {
    this.controller = controller;
  }

  /** Installed by the runtime, with the canvas's text selection and the shell's clipboard. */
  setSelection(selection: UiSelectionController | null, clipboard: EditingClipboard | null): void {
    this.selection = selection;
    this.clipboard = clipboard;
  }

  /** The editable that holds focus, or null; what `cut`, `paste` and `selectAll` act on. */
  get focusedField(): UiNode | null {
    return this.controller?.focused ?? null;
  }

  /**
   * What a copy would take: the focused field's selection, or the text
   * selected on the canvas when no field has focus. Empty for a secret
   * field, whose text never leaves the runtime.
   */
  selectedText(): string {
    const field = this.focusedField;
    if (field !== null && isEditableNode(field)) {
      if (field.properties.get('secret') === true) {
        return '';
      }
      const state = this.controller?.state();
      if (state?.clipboard !== undefined) {
        return state.clipboard;
      }
      const model = editorFor(field);
      return model.text.slice(Math.min(model.start, model.end), Math.max(model.start, model.end));
    }
    return this.selection?.selectedText() ?? '';
  }

  /** Puts `text` on the clipboard, for a copy of something that is not a selection: a link's address. */
  copyText(text: string): Promise<boolean> {
    return this.clipboard === null || text.length === 0 ? Promise.resolve(false) : this.clipboard.copyText(text);
  }

  /** Puts the selection on the clipboard. Resolves to whether anything was copied. */
  async copy(): Promise<boolean> {
    const text = this.selectedText();
    if (text.length === 0 || this.clipboard === null) {
      return false;
    }
    return this.clipboard.copyText(text);
  }

  /**
   * Copies the focused field's selection and deletes it, as Ctrl/Cmd+X
   * does. Deletes nothing if the copy failed, so the text is never on
   * no clipboard at all.
   */
  async cut(): Promise<boolean> {
    const field = this.focusedField;
    if (field === null || isReadOnly(field) || !(await this.copy())) {
      return false;
    }
    return this.controller?.beforeInput('deleteByCut', null) ?? false;
  }

  /** Inserts the clipboard's text at the focused field's caret, as Ctrl/Cmd+V does. */
  async paste(): Promise<boolean> {
    const field = this.focusedField;
    if (field === null || isReadOnly(field) || this.clipboard === null) {
      return false;
    }
    const text = await this.clipboard.readText();
    if (text === null || text.length === 0 || this.controller === null || this.controller.focused !== field) {
      return false;
    }
    return this.controller.beforeInput('insertFromPaste', text);
  }

  /** Selects all of the focused field's text. */
  selectAll(): boolean {
    const field = this.focusedField;
    if (field === null || !isEditableNode(field)) {
      return false;
    }
    const length = editorFor(field).text.length;
    return this.select({ node: field, offset: 0 }, { node: field, offset: length });
  }

  /**
   * Where the caret is inside a field, in the field's own coordinates.
   *
   * Relative to the node's border-box origin, with the field's own
   * scroll already applied: a popup placed under the caret adds the
   * node's position on screen and nothing else.
   *
   * `offset` asks about a caret at another character than the one the
   * caret is at: the start of the word being completed, so its list
   * stays put as the word grows. With an overlay's `anchorRect` and the
   * field as its anchor, the list follows the field from then on.
   *
   * Null when the node is not an editable, when it has not been laid
   * out yet, or before the runtime has wired the controller — all
   * three of which are "ask again next frame" rather than errors, and
   * all three of which happen during the frame a field first appears.
   */
  caretRectOf(node: UiNode | null, offset?: number): CaretRect | null {
    if (node === null || this.controller === null) {
      return null;
    }
    return this.controller.caretRectOf(node, offset);
  }

  /**
   * The caret position nearest a point in a field, the point given as a
   * pointer event gives it: where a press there would put the caret.
   *
   * What a field opened over text the person pointed at uses to start
   * the caret where they pointed: ask once the field is laid out, then
   * `select` that offset. Null when the node is not an editable, when it
   * has not been laid out yet, or before the runtime has wired the
   * controller: "ask again next frame", as for `caretRectOf`.
   */
  offsetNear(node: UiNode | null, x: number, y: number): number | null {
    if (node === null || this.controller === null) {
      return null;
    }
    return this.controller.offsetNear(node, x, y);
  }

  /**
   * Selects from `anchor` to `focus` and focuses the field the focus is
   * in: within one field, or across the fields of an editing group (see
   * `UiEditingGroup`). What an editor does after a command over a
   * selection (making it bold, say) to leave it selected, since its
   * fields can only select their own text.
   *
   * False when the two ends aren't editables of one group, or before
   * the runtime has wired the controller.
   */
  select(anchor: UiTextPosition, focus: UiTextPosition): boolean {
    return this.controller?.select(anchor, focus) ?? false;
  }
}
