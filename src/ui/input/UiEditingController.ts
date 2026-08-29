import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { LayoutRecord } from '../layout/LayoutRecord';
import type { TextMeasurer } from '../layout/TextMeasurer';
import { createPaintState, resolvePaintState } from '../rendering/PaintState';
import { EditableLayout } from '../editing/EditableLayout';
import type { EditableTextModel, EditUnit } from '../editing/EditableTextModel';
import { commandForKey, detectEditingPlatform, type EditCommand, type EditingPlatform } from '../editing/EditingKeymap';
import { wordRangeAt, lineStartAt, lineEndAt } from '../editing/TextBoundaries';
import { editorFor, isEditableNode, isMultiline, isReadOnly, nextCaretToggle } from '../editing/UiEditable';
import type { UiInputDispatcher } from './UiInputDispatcher';
import type { UiFocusManager } from './UiFocusManager';
import { UiBeforeInputEvent, UiTextChangeEvent, type UiModifiers } from './UiInputEvent';

/**
 * What the controller needs from the runtime around it: geometry,
 * measurement, and the two things it cannot do itself — mark a node
 * dirty and scroll a rectangle into view.
 */
export interface EditingHost {
  recordFor(node: UiNode): LayoutRecord | undefined;
  /** Where the node is seen, scroll offsets applied; for the shell's caret rectangle. */
  visibleBox(node: UiNode): LayoutBox;
  /** A layout-root point in the node's own coordinates. */
  toLocal(node: UiNode, x: number, y: number): { x: number; y: number };
  readonly measurer: TextMeasurer;
  markDirty(node: UiNode, flags: DirtyFlags): void;
  /** Scrolls ancestors so a node-local box is visible. */
  reveal(node: UiNode, box: LayoutBox): void;
  now(): number;
}

/**
 * What a shell mirrors while an editable has focus: its text and
 * selection (so native copy, cut and IME context are right) and where
 * the caret is on the canvas (so the IME candidate window opens there).
 */
export interface EditingState {
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  /** Caret box in canvas (layout root) pixels. */
  readonly caret: LayoutBox;
  readonly multiline: boolean;
  readonly composing: boolean;
}

export interface EditingControllerOptions {
  /** Keyboard conventions; detected from the user agent by default. */
  platform?: EditingPlatform;
}

/** How long two presses may be apart and still count as a double click. */
const MULTI_CLICK_MS = 500;
const MULTI_CLICK_SLOP = 4;
/** Room kept around the caret when scrolling it into view. */
const CARET_REVEAL_PADDING = 4;

/**
 * Editing behaviour for EditableText nodes.
 *
 * The keyboard and pointer controllers call in here as their default
 * behaviour for an editable target — after the app's listeners have
 * run and only when none of them called preventDefault() — and the
 * host feeds it the shell's text input: `beforeinput` edits,
 * composition, paste. The model on the node is the single source of
 * truth; this class turns intents into model changes, marks the node
 * dirty so layout and paint follow, reports the change through an
 * `input` event, and keeps the caret in view.
 *
 * Text arrives one of two ways. A shell with an editing proxy sends
 * `beforeinput`, where the browser has already resolved the IME, dead
 * keys and the keyboard layout; then printable key presses are not
 * text and `textFromKeys` is off. Without a proxy — tests, a bare
 * runtime — printable keys become insertions.
 */
export class UiEditingController {
  /** Insert printable key presses as text; off when a shell delivers text through beforeinput. */
  textFromKeys = true;

  private readonly platform: EditingPlatform;
  private readonly paint = createPaintState();
  private focusedEditable: UiNode | null = null;
  private visible = true;
  /** x the current run of vertical moves keeps returning to. */
  private verticalGoalX: number | undefined = undefined;
  private dragging: UiNode | null = null;
  private lastPress: { node: UiNode; x: number; y: number; at: number; count: number } | null = null;
  private compositionOpen = false;

  constructor(
    private readonly host: EditingHost,
    private readonly dispatcher: UiInputDispatcher,
    private readonly focus: UiFocusManager,
    options: EditingControllerOptions = {}
  ) {
    this.platform = options.platform ?? detectEditingPlatform();
    this.focus.onFocusChange(node => this.handleFocusChange(node));
  }

  /** The editable that holds focus, or null. */
  get focused(): UiNode | null {
    return this.focusedEditable;
  }

  /** Whether the pointer controller should hand presses on the node to this controller. */
  isEditable(node: UiNode): boolean {
    return isEditableNode(node);
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  /**
   * Default keyboard behaviour for the focused editable. Returns true
   * when the key was an editing command, so the caller can mark the
   * event handled.
   */
  handleKey(node: UiNode, key: string, modifiers: UiModifiers): boolean {
    if (!isEditableNode(node)) {
      return false;
    }
    const command = commandForKey(key, modifiers, this.platform, this.textFromKeys);
    if (command === null) {
      return false;
    }
    return this.execute(node, command);
  }

  private execute(node: UiNode, command: EditCommand): boolean {
    const model = editorFor(node);
    const readOnly = isReadOnly(node);
    switch (command.kind) {
      case 'move':
        this.move(node, model, command.unit, command.direction, command.extend);
        return true;
      case 'delete':
        if (readOnly) {
          return true;
        }
        return this.applyEdit(node, model, deleteInputType(command.unit, command.direction), null, () => {
          if (command.direction < 0) {
            model.deleteBackward(command.unit);
          } else {
            model.deleteForward(command.unit);
          }
        });
      case 'newline':
        if (!isMultiline(node)) {
          // Enter in a single-line field is the app's (submit), not ours.
          return false;
        }
        if (readOnly) {
          return true;
        }
        return this.applyEdit(node, model, 'insertLineBreak', '\n', () => model.insertText('\n'));
      case 'insert':
        if (readOnly) {
          return true;
        }
        return this.applyEdit(node, model, 'insertText', command.text, () => model.insertText(command.text));
      case 'selectAll':
        model.selectAll();
        this.afterSelectionChange(node, model);
        return true;
      case 'undo':
        if (readOnly) {
          return true;
        }
        this.history(node, model, 'historyUndo', () => model.undo());
        return true;
      case 'redo':
        if (readOnly) {
          return true;
        }
        this.history(node, model, 'historyRedo', () => model.redo());
        return true;
    }
  }

  private move(
    node: UiNode,
    model: EditableTextModel,
    unit: EditUnit | 'vertical',
    direction: -1 | 1,
    extend: boolean
  ): void {
    if (unit === 'vertical') {
      const layout = this.layoutOf(node);
      const target = layout.verticalMove(model.focus, direction, this.verticalGoalX);
      if (target === null) {
        // Off the first or last line: the caret goes to the text's edge.
        model.moveTo(direction < 0 ? 0 : model.text.length, extend);
        this.verticalGoalX = undefined;
      } else {
        model.moveTo(target.offset, extend);
        this.verticalGoalX = target.x;
      }
      this.afterSelectionChange(node, model, true);
      return;
    }
    if (unit === 'line') {
      // Home/End are the visual line, which needs the layout; the
      // model's 'line' is the hard line.
      const layout = this.layoutOf(node);
      const caret = layout.caretRect(model.focus);
      const line = layout.lines[caret.line];
      const hard = direction < 0 ? lineStartAt(model.text, model.focus) : lineEndAt(model.text, model.focus);
      const visual = direction < 0 ? line.start : line.end;
      model.moveTo(direction < 0 ? Math.max(hard, visual) : Math.min(hard, visual), extend);
      this.afterSelectionChange(node, model);
      return;
    }
    model.move(unit, direction, extend);
    this.afterSelectionChange(node, model);
  }

  // ---------------------------------------------------------------------------
  // Text input from the shell
  // ---------------------------------------------------------------------------

  /**
   * A `beforeinput` from the shell's editing proxy, in the DOM's
   * vocabulary. Returns true when it was applied to the focused
   * editable. Composition types are not handled here: the composition
   * methods carry them, and an engine that fires both must not insert
   * twice.
   */
  beforeInput(inputType: string, data: string | null): boolean {
    const node = this.focusedEditable;
    if (node === null) {
      return false;
    }
    const model = editorFor(node);
    const readOnly = isReadOnly(node);
    switch (inputType) {
      case 'insertText':
      case 'insertReplacementText':
      case 'insertFromDrop':
      case 'insertFromYank':
        if (data === null || data.length === 0) {
          return false;
        }
        return readOnly || this.insert(node, model, inputType, data);
      case 'insertFromPaste':
        return readOnly || (data !== null && this.insert(node, model, inputType, data));
      case 'insertLineBreak':
      case 'insertParagraph':
        if (!isMultiline(node)) {
          return false;
        }
        return readOnly || this.applyEdit(node, model, inputType, '\n', () => model.insertText('\n'));
      case 'deleteContentBackward':
      case 'deleteWordBackward':
      case 'deleteSoftLineBackward':
      case 'deleteHardLineBackward':
      case 'deleteContentForward':
      case 'deleteWordForward':
      case 'deleteSoftLineForward':
      case 'deleteHardLineForward':
      case 'deleteContent':
      case 'deleteByCut':
      case 'deleteByDrag': {
        if (readOnly) {
          return true;
        }
        const unit: EditUnit = /Word/.test(inputType) ? 'word' : /Line/.test(inputType) ? 'line' : 'grapheme';
        const forward = /Forward/.test(inputType);
        return this.applyEdit(node, model, inputType, null, () => {
          if (inputType === 'deleteContent' || inputType === 'deleteByCut' || inputType === 'deleteByDrag') {
            model.replaceRange(model.start, model.end, '');
          } else if (forward) {
            model.deleteForward(unit);
          } else {
            model.deleteBackward(unit);
          }
        });
      }
      case 'historyUndo':
        return readOnly || this.history(node, model, inputType, () => model.undo());
      case 'historyRedo':
        return readOnly || this.history(node, model, inputType, () => model.redo());
      default:
        return false;
    }
  }

  /** Inserts text at the selection of the focused editable, as typing would. */
  insertText(text: string): boolean {
    const node = this.focusedEditable;
    if (node === null || isReadOnly(node)) {
      return false;
    }
    return this.insert(node, editorFor(node), 'insertText', text);
  }

  /** Pastes text: newlines are kept in a multiline field and become spaces in a single-line one. */
  paste(text: string): boolean {
    const node = this.focusedEditable;
    if (node === null || isReadOnly(node)) {
      return false;
    }
    return this.insert(node, editorFor(node), 'insertFromPaste', text);
  }

  private insert(node: UiNode, model: EditableTextModel, inputType: string, text: string): boolean {
    const data = isMultiline(node) ? text : text.replace(/\r\n|\r|\n/g, ' ');
    return this.applyEdit(node, model, inputType, data, () => model.insertText(data));
  }

  // ---------------------------------------------------------------------------
  // Composition
  // ---------------------------------------------------------------------------

  compositionStart(): void {
    const node = this.focusedEditable;
    if (node === null || isReadOnly(node)) {
      return;
    }
    const model = editorFor(node);
    model.beginComposition();
    this.compositionOpen = true;
    this.afterTextChange(node, model, false);
  }

  /** The composition text so far and the caret within it. */
  compositionUpdate(text: string, caret: number = text.length): void {
    const node = this.focusedEditable;
    if (node === null || isReadOnly(node)) {
      return;
    }
    const model = editorFor(node);
    model.updateComposition(text, caret);
    this.compositionOpen = true;
    this.afterTextChange(node, model, false);
  }

  /** The IME committed `text` (possibly empty: the composition was cancelled). */
  compositionEnd(text: string): void {
    const node = this.focusedEditable;
    this.compositionOpen = false;
    if (node === null || isReadOnly(node)) {
      return;
    }
    const model = editorFor(node);
    const data = isMultiline(node) ? text : text.replace(/\r\n|\r|\n/g, ' ');
    const before = model.text;
    model.commitComposition(data);
    this.afterTextChange(node, model, before !== model.text);
  }

  // ---------------------------------------------------------------------------
  // Pointer
  // ---------------------------------------------------------------------------

  /**
   * A press on an editable places the caret (Shift extends the
   * selection to it); a second press within the double-click window
   * selects the word, a third the line. Dragging afterwards extends the
   * selection from the anchor.
   */
  pointerDown(node: UiNode, x: number, y: number, modifiers: UiModifiers): void {
    if (!isEditableNode(node)) {
      return;
    }
    const model = editorFor(node);
    const layout = this.layoutOf(node);
    const local = this.host.toLocal(node, x, y);
    const offset = layout.offsetAt(local.x, local.y);
    const now = this.host.now();
    const last = this.lastPress;
    // Shift+press extends the selection whatever came before it, and
    // does not count toward a double click.
    const count =
      !modifiers.shift &&
      last !== null &&
      last.node === node &&
      now - last.at <= MULTI_CLICK_MS &&
      Math.abs(last.x - x) <= MULTI_CLICK_SLOP &&
      Math.abs(last.y - y) <= MULTI_CLICK_SLOP
        ? last.count + 1
        : 1;
    this.lastPress = { node, x, y, at: now, count };
    this.dragging = node;

    if (modifiers.shift) {
      model.moveTo(offset, true);
    } else if (count === 2) {
      const word = wordRangeAt(model.text, offset);
      model.select(word.start, word.end);
    } else if (count >= 3) {
      model.select(lineStartAt(model.text, offset), lineEndAt(model.text, offset));
    } else {
      model.select(offset);
    }
    model.breakUndoGroup();
    this.afterSelectionChange(node, model);
  }

  pointerMove(node: UiNode, x: number, y: number): void {
    if (this.dragging !== node) {
      return;
    }
    const model = editorFor(node);
    const layout = this.layoutOf(node);
    const local = this.host.toLocal(node, x, y);
    const offset = layout.offsetAt(local.x, local.y);
    if (offset !== model.focus) {
      model.moveTo(offset, true);
      this.afterSelectionChange(node, model);
    }
  }

  pointerUp(): void {
    this.dragging = null;
  }

  // ---------------------------------------------------------------------------
  // State for the shell, caret blink
  // ---------------------------------------------------------------------------

  /** The focused editable's state for the shell to mirror, or null. */
  state(): EditingState | null {
    const node = this.focusedEditable;
    if (node === null || this.host.recordFor(node) === undefined) {
      return null;
    }
    const model = editorFor(node);
    const caret = this.layoutOf(node).caretRect();
    const visible = this.host.visibleBox(node);
    return {
      text: model.text,
      selectionStart: model.start,
      selectionEnd: model.end,
      caret: { x: visible.x + caret.x, y: visible.y + caret.y, width: 1, height: caret.height },
      multiline: isMultiline(node),
      composing: model.composing
    };
  }

  /**
   * When the focused caret next toggles, or undefined when nothing
   * blinks: no focused editable, a composition in progress (the caret
   * holds), or a hidden page.
   */
  nextCaretChange(now: number): number | undefined {
    const node = this.focusedEditable;
    if (node === null || !this.visible) {
      return undefined;
    }
    const model = editorFor(node);
    if (model.composing || !model.collapsed) {
      return undefined;
    }
    return nextCaretToggle(model, now);
  }

  /**
   * The page was hidden or shown. A hidden page stops the blink so a
   * background tab schedules no frames; showing it restarts the caret.
   */
  setVisible(visible: boolean): void {
    if (this.visible === visible) {
      return;
    }
    this.visible = visible;
    const node = this.focusedEditable;
    if (node !== null) {
      editorFor(node).blinkOrigin = this.host.now();
      this.host.markDirty(node, DirtyFlags.Paint);
    }
  }

  /** Whether the caret may be drawn at all (the page is visible). */
  get caretEnabled(): boolean {
    return this.visible;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private handleFocusChange(node: UiNode | null): void {
    const previous = this.focusedEditable;
    const next = node !== null && isEditableNode(node) ? node : null;
    if (previous === next) {
      return;
    }
    if (previous !== null) {
      const model = editorFor(previous);
      if (model.composing) {
        model.commitComposition(model.text.slice(model.composition!.start, model.composition!.end));
      }
      model.focused = false;
      this.host.markDirty(previous, DirtyFlags.Paint);
    }
    this.focusedEditable = next;
    this.compositionOpen = false;
    this.verticalGoalX = undefined;
    if (next !== null) {
      const model = editorFor(next);
      model.focused = true;
      model.blinkOrigin = this.host.now();
      this.host.markDirty(next, DirtyFlags.Paint);
    }
  }

  /**
   * Runs an edit unless a `beforeinput` listener cancels it, then
   * reports it. Returns true when the input was consumed either way.
   */
  private applyEdit(
    node: UiNode,
    model: EditableTextModel,
    inputType: string,
    data: string | null,
    run: () => void
  ): boolean {
    const before = new UiBeforeInputEvent(inputType, data);
    this.dispatcher.dispatch(before, node);
    if (before.defaultPrevented) {
      return true;
    }
    const text = model.text;
    run();
    this.afterTextChange(node, model, text !== model.text);
    return true;
  }

  private history(node: UiNode, model: EditableTextModel, inputType: string, run: () => boolean): boolean {
    const before = new UiBeforeInputEvent(inputType, null);
    this.dispatcher.dispatch(before, node);
    if (before.defaultPrevented) {
      return true;
    }
    const text = model.text;
    run();
    this.afterTextChange(node, model, text !== model.text);
    return true;
  }

  private afterTextChange(node: UiNode, model: EditableTextModel, changed: boolean): void {
    this.verticalGoalX = undefined;
    model.blinkOrigin = this.host.now();
    // The text is what layout measures, so a change is content and
    // layout; an unchanged text with a moved caret is paint only.
    this.host.markDirty(
      node,
      changed || this.compositionOpen ? DirtyFlags.Content | DirtyFlags.Layout : DirtyFlags.Paint
    );
    if (changed) {
      this.dispatcher.dispatch(new UiTextChangeEvent(model.text, model.start, model.end), node);
    }
    this.revealCaret(node);
  }

  private afterSelectionChange(node: UiNode, model: EditableTextModel, keepGoal = false): void {
    if (!keepGoal) {
      this.verticalGoalX = undefined;
    }
    model.blinkOrigin = this.host.now();
    this.host.markDirty(node, DirtyFlags.Paint);
    this.revealCaret(node);
  }

  /**
   * Asks the host to scroll the caret into view, when the node has been
   * laid out: the field's own text first, then any scroll container
   * around it.
   *
   * `layoutOf` places the text where it is seen, so the caret comes
   * back with the field's own scroll already taken off; the reveal is
   * asked for in the node's unscrolled coordinates, which is where the
   * offset it wants is measured from.
   */
  private revealCaret(node: UiNode): void {
    const rec = this.host.recordFor(node);
    if (rec === undefined) {
      return;
    }
    const caret = this.layoutOf(node).caretRect();
    this.host.reveal(node, {
      x: caret.x + rec.scrollX - CARET_REVEAL_PADDING,
      y: caret.y + rec.scrollY - CARET_REVEAL_PADDING,
      width: 1 + 2 * CARET_REVEAL_PADDING,
      height: caret.height + 2 * CARET_REVEAL_PADDING
    });
  }

  /**
   * The node's text laid out in node-local coordinates: the content box
   * starts at the padding and is shifted by the field's own scroll, as
   * it is for the renderers in the parent's space. Points from the
   * pointer and the caret box the shell is given are both in that same
   * seen space, so neither has to know the offset. Before the first
   * layout the record is empty and the lines fall at the origin, which
   * is still a valid place for a caret.
   */
  private layoutOf(node: UiNode): EditableLayout {
    const rec = this.host.recordFor(node);
    const state = resolvePaintState(node, this.paint);
    const box: LayoutBox =
      rec === undefined
        ? { x: 0, y: 0, width: 0, height: 0 }
        : {
            x: rec.paddingLeft - rec.scrollX,
            y: rec.paddingTop - rec.scrollY,
            width: Math.max(0, rec.width - rec.paddingLeft - rec.paddingRight),
            height: Math.max(0, rec.height - rec.paddingTop - rec.paddingBottom)
          };
    return new EditableLayout(state.editor!, box, state, this.host.measurer);
  }
}

function deleteInputType(unit: EditUnit, direction: -1 | 1): string {
  const side = direction < 0 ? 'Backward' : 'Forward';
  switch (unit) {
    case 'word':
      return `deleteWord${side}`;
    case 'line':
    case 'document':
      return `deleteSoftLine${side}`;
    default:
      return `deleteContent${side}`;
  }
}
