import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { LayoutRecord } from '../layout/LayoutRecord';
import type { TextMeasurer } from '../layout/TextMeasurer';
import { createPaintState, resolvePaintState } from '../rendering/PaintState';
import { EditableLayout } from '../editing/EditableLayout';
import type { EditableTextModel, EditUnit } from '../editing/EditableTextModel';
import { commandForKey, detectEditingPlatform, type EditCommand, type EditingPlatform } from '../editing/EditingKeymap';
import { lineStartAt, lineEndAt } from '../editing/TextBoundaries';
import { visibleWordRange } from '../editing/HiddenText';
import { editorFor, isEditableNode, isMultiline, isReadOnly, nextCaretToggle } from '../editing/UiEditable';
import {
  adjacentField,
  comparePositions,
  edgeField,
  editingGroupOf,
  type UiEditingGroup,
  type UiTextPosition
} from '../editing/UiEditingGroup';
import { clearSelectionRange, setSelectionRange } from '../selection/UiSelectable';
import type { CaretRect } from '../editing/TextGeometry';
import type { UiInputDispatcher } from './UiInputDispatcher';
import type { UiFocusManager } from './UiFocusManager';
import { isNodeFocusable } from './UiInteraction';
import {
  UiBeforeInputEvent,
  UiPasteEvent,
  UiSelectionChangeEvent,
  UiTextChangeEvent,
  type UiKeyModifiers
} from './UiInputEvent';

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
  /**
   * The selection as HTML, which a copy puts on the clipboard beside
   * the text, when the field's editing group gives some (see
   * `UiEditingGroup.copyHtml`). Absent otherwise.
   */
  readonly html?: string;
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
  /**
   * The text as it was when the composition began. A commit is reported
   * against this, not against the text with the composition in it,
   * which already holds what is committed whenever the person picks
   * the candidate on screen: compared with that, a commit changed
   * nothing and the application never heard about the text.
   */
  private compositionBase: string | null = null;
  /**
   * A selection across the fields of an editing group, while it spans
   * more than one; null while the selection is one field's own. `lit`
   * is every field drawing part of it. See `UiEditingGroup`.
   */
  private span: {
    readonly root: UiNode;
    readonly group: UiEditingGroup;
    readonly anchor: UiTextPosition;
    readonly focus: UiTextPosition;
    readonly lit: readonly UiNode[];
  } | null = null;
  /**
   * What the group last made of a selection for the clipboard, kept
   * while the selection and the texts it covers stay the same: the
   * state is asked for every frame, and serializing a long selection
   * every frame would cost more than the frame.
   */
  private copied: {
    readonly key: readonly unknown[];
    readonly text: string;
    readonly html: string | undefined;
  } | null = null;
  /** Set while the span moves focus to the field its focus end is in, so that move does not end it. */
  private spanFocusing = false;
  /**
   * The field focus left for the one just pressed. A press focuses its
   * field before this controller hears of it, so a Shift and press in a
   * new field needs to know where the selection was anchored.
   */
  private pressedFrom: UiNode | null = null;

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
  /** `textFromKeys` overrides the controller's own setting for this one key; see `UiKeyboardController.keyDown`. */
  handleKey(node: UiNode, key: string, modifiers: UiKeyModifiers, textFromKeys = this.textFromKeys): boolean {
    if (!isEditableNode(node)) {
      return false;
    }
    const command = commandForKey(key, modifiers, this.platform, textFromKeys);
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
        if (this.span !== null && !command.extend) {
          // A plain arrow over a selection lands on the side it points to.
          this.collapseSpan(command.direction);
          return true;
        }
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
      case 'selectAll': {
        // Inside a group, everything in it, as select all in a document.
        const owner = editingGroupOf(node);
        const first = owner === null ? null : edgeField(owner.root, 1);
        const last = owner === null ? null : edgeField(owner.root, -1);
        if (owner !== null && first !== null && last !== null && first !== last) {
          this.setSpan(owner, { node: first, offset: 0 }, { node: last, offset: editorFor(last).text.length });
          return true;
        }
        model.selectAll();
        this.afterSelectionChange(node, model);
        return true;
      }
      case 'undo':
        this.clearSpan();
        if (readOnly) {
          return true;
        }
        this.history(node, model, 'historyUndo', () => model.undo());
        return true;
      case 'redo':
        this.clearSpan();
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
    const owner = editingGroupOf(node);
    if (owner !== null && this.leavesField(node, model, unit, direction, extend)) {
      const next = adjacentField(owner.root, node, direction);
      if (next !== null) {
        // Off the edge of one field and into the next, as in a document:
        // up and down keep the column, left and right take the near end.
        const goal = this.verticalGoalX ?? this.layoutOf(node).caretRect(model.focus).x;
        const from = this.host.visibleBox(node).x;
        const to = this.host.visibleBox(next).x;
        const target = { node: next, offset: this.entryOffset(next, direction, unit, goal + from - to) };
        const keepGoal = unit === 'vertical' ? goal + from - to : undefined;
        if (extend) {
          this.setSpan(owner, this.span?.anchor ?? { node, offset: model.anchor }, target, keepGoal);
        } else {
          this.clearSpan();
          const entered = editorFor(next);
          entered.select(target.offset);
          this.focusField(next);
          this.verticalGoalX = keepGoal;
          this.afterSelectionChange(next, entered, keepGoal !== undefined);
        }
        return;
      }
    }
    this.moveInField(node, model, unit, direction, extend);
    if (extend && owner !== null && this.span !== null) {
      this.setSpan(owner, this.span.anchor, { node, offset: model.focus });
    }
  }

  /** Whether a move would go past the edge of a field, rather than somewhere in it. */
  private leavesField(
    node: UiNode,
    model: EditableTextModel,
    unit: EditUnit | 'vertical',
    direction: -1 | 1,
    extend: boolean
  ): boolean {
    if (!extend && !model.collapsed) {
      // A plain arrow over a selection collapses it first.
      return false;
    }
    if (unit === 'vertical') {
      return this.layoutOf(node).verticalMove(model.focus, direction, this.verticalGoalX) === null;
    }
    if (unit === 'grapheme' || unit === 'word') {
      // Hidden text at the field's edge is not somewhere to stop on the
      // way to the next one: past the last visible character is the edge.
      return model.atVisibleEdge(direction);
    }
    return false;
  }

  /** Where a selection extended into a field from the one before or after it lands. */
  private entryOffset(node: UiNode, direction: -1 | 1, unit: EditUnit | 'vertical', x: number): number {
    const text = editorFor(node).text;
    if (unit !== 'vertical') {
      return direction > 0 ? 0 : text.length;
    }
    // Up or down keeps the column, on the first or last line.
    const layout = this.layoutOf(node);
    const line = layout.lines[direction > 0 ? 0 : layout.lines.length - 1];
    return line === undefined ? (direction > 0 ? 0 : text.length) : layout.offsetAt(x, line.y + line.height / 2);
  }

  private moveInField(
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
      // A line may wrap inside hidden text; the caret stops at its end.
      model.moveTo(model.caretOffsetNear(direction < 0 ? Math.max(hard, visual) : Math.min(hard, visual)), extend);
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
        this.clearSpan();
        return readOnly || this.history(node, model, inputType, () => model.undo());
      case 'historyRedo':
        this.clearSpan();
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

  /**
   * Replaces the focused editable's whole text, as an assistive
   * technology's "set value" does.
   *
   * `insertReplacementText` is the DOM's own input type for this, so an
   * `onBeforeInput` that vets edits sees the same vocabulary it sees
   * for typing, and an app that rejects the edit rejects this one too.
   * Selecting everything first is what makes it one undo step and one
   * `onInput` rather than a delete and an insert.
   */
  replaceText(text: string): boolean {
    const node = this.focusedEditable;
    if (node === null || isReadOnly(node)) {
      return false;
    }
    const model = editorFor(node);
    model.selectAll();
    return this.insert(node, model, 'insertReplacementText', text);
  }

  /**
   * Pastes text: newlines are kept in a multiline field and become
   * spaces in a single-line one.
   *
   * With nothing editable focused the text is offered to whatever is,
   * as a `Paste` event, instead of being dropped. That is the case a
   * grid needs: it owns a rectangle of cells, a block of tab-separated
   * text means something to it that it means to nothing else, and
   * before this there was no way for it to hear about one at all.
   */
  paste(text: string, html: string | null = null): boolean {
    const node = this.focusedEditable;
    if (node === null || isReadOnly(node)) {
      return this.offerPaste(text, html);
    }
    return this.insert(node, editorFor(node), 'insertFromPaste', text, html);
  }

  private offerPaste(text: string, html: string | null): boolean {
    const target = this.focus.focusedNode;
    if (target === null) {
      return false;
    }
    const event = new UiPasteEvent(text, html);
    this.dispatcher.dispatch(event, target);
    return event.defaultPrevented;
  }

  private insert(
    node: UiNode,
    model: EditableTextModel,
    inputType: string,
    text: string,
    html: string | null = null
  ): boolean {
    const data = isMultiline(node) ? text : text.replace(/\r\n|\r|\n/g, ' ');
    return this.applyEdit(node, model, inputType, data, () => model.insertText(data), html);
  }

  // ---------------------------------------------------------------------------
  // Composition
  // ---------------------------------------------------------------------------

  compositionStart(): void {
    if (this.span !== null) {
      // Composing over a selection replaces it, as typing does.
      this.spanEdit('deleteContent', null);
    }
    const node = this.focusedEditable;
    if (node === null || isReadOnly(node)) {
      return;
    }
    const model = editorFor(node);
    this.compositionBase = model.text;
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
    const before = this.compositionBase ?? model.text;
    this.compositionBase = null;
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
  /**
   * The field a press belongs to that landed inside an editing group
   * but on none of its fields: in the padding round the fields, the gap
   * between two of them, or the plain structure a field sits in (a list
   * item's bullet). The nearest field, by height, as a document puts the
   * caret on the nearest line. Null for a press outside any group, and
   * for one on something that answers presses itself, such as a task's
   * checkbox: `handlesPress` says which nodes do.
   */
  fieldNear(target: UiNode, y: number, handlesPress: (node: UiNode) => boolean): UiNode | null {
    let root: UiNode | null = null;
    for (let node: UiNode | null = target; node !== null; node = node.parent) {
      if (isEditableNode(node) || isNodeFocusable(node) || handlesPress(node)) {
        return null;
      }
      const group = node.properties.get('editingGroup') as UiEditingGroup | null | undefined;
      if (group !== undefined && group !== null) {
        root = node;
        break;
      }
    }
    if (root === null) {
      return null;
    }
    // Walked from a field near the press, so a press costs the fields
    // between, not the whole group: the focused field when it's in this
    // group, else the next one after the press in document order.
    const focused = this.focusedEditable;
    let current =
      focused !== null && editingGroupOf(focused)?.root === root
        ? focused
        : (adjacentField(root, target, 1) ?? edgeField(root, -1));
    if (current === null) {
      return null;
    }
    const distance = (node: UiNode): number => {
      const box = this.host.visibleBox(node);
      return y < box.y ? box.y - y : y > box.y + box.height ? y - box.y - box.height : 0;
    };
    for (;;) {
      const here = distance(current);
      if (here === 0) {
        return current;
      }
      const box = this.host.visibleBox(current);
      const next = adjacentField(root, current, y < box.y ? -1 : 1);
      // A tie stays put, so two fields the same distance away can't
      // hand the press back and forth.
      if (next === null || distance(next) >= here) {
        return current;
      }
      current = next;
    }
  }

  /**
   * The offset under a point in a field, by its layout as it stands. The
   * pointer controller asks this before a press moves focus, and hands
   * the answer to `pointerDown`; see there.
   */
  offsetAt(node: UiNode, x: number, y: number): number {
    const local = this.host.toLocal(node, x, y);
    return this.layoutOf(node).offsetAt(local.x, local.y);
  }

  /**
   * `pressedAt` is the offset the press landed on, found before focus
   * moved. A field may change how it is drawn when it takes focus (its
   * runs show text they hid), and from then on its geometry is not the
   * one the person pressed on. Without it, the offset is found here.
   */
  pointerDown(node: UiNode, x: number, y: number, modifiers: UiKeyModifiers, pressedAt?: number): void {
    if (!isEditableNode(node)) {
      return;
    }
    const model = editorFor(node);
    const offset = Math.min(pressedAt ?? this.offsetAt(node, x, y), model.text.length);
    const pressedFrom = this.pressedFrom;
    this.pressedFrom = null;
    if (modifiers.shift) {
      // Shift and a press in another field of the same group extends
      // the selection there from wherever it was anchored.
      const owner = editingGroupOf(node);
      const from =
        this.span?.anchor ?? this.anchorIn(owner, this.focusedEditable === node ? pressedFrom : this.focusedEditable);
      if (owner !== null && from !== null && (this.span !== null || from.node !== node)) {
        this.dragging = node;
        this.setSpan(owner, from, { node, offset });
        return;
      }
    }
    this.clearSpan();
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
      const word = visibleWordRange(model.text, model.hidden, offset);
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
    const owner = editingGroupOf(node);
    if (owner !== null) {
      // A drag can leave the field it started in for another in the group.
      const from = this.span?.focus.node ?? node;
      const target = this.fieldAt(owner.root, from, y);
      if (target !== node || this.span !== null) {
        const local = this.host.toLocal(target, x, y);
        const offset = this.layoutOf(target).offsetAt(local.x, local.y);
        const anchor = this.span?.anchor ?? { node, offset: editorFor(node).anchor };
        this.setSpan(owner, anchor, { node: target, offset });
        return;
      }
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
    if (this.span !== null) {
      // The shell is handed the whole selection, selected, so that its
      // native copy and cut take all of it; what is typed over it comes
      // back as an edit for the group.
      const { text, html } = this.spanCopy();
      return {
        text,
        selectionStart: 0,
        selectionEnd: text.length,
        caret: { x: visible.x + caret.x, y: visible.y + caret.y, width: 1, height: caret.height },
        multiline: true,
        composing: false,
        ...(html === undefined ? {} : { html })
      };
    }
    const html = model.collapsed || model.composing ? undefined : this.fieldHtml(node, model.start, model.end);
    return {
      text: model.text,
      selectionStart: model.start,
      selectionEnd: model.end,
      caret: { x: visible.x + caret.x, y: visible.y + caret.y, width: 1, height: caret.height },
      multiline: isMultiline(node),
      composing: model.composing,
      ...(html === undefined ? {} : { html })
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
    if (this.span !== null && !this.spanFocusing && node !== this.span.focus.node) {
      this.clearSpan();
    }
    const previous = this.focusedEditable;
    const next = node !== null && isEditableNode(node) ? node : null;
    if (previous === next) {
      return;
    }
    this.pressedFrom = previous;
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
    this.compositionBase = null;
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
    run: () => void,
    html: string | null = null
  ): boolean {
    if (this.span !== null && this.span.focus.node === node) {
      return this.spanEdit(inputType, data, html);
    }
    const before = new UiBeforeInputEvent(inputType, data, html);
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
    // After the text change, so a listener reading the value sees the
    // new one rather than the value it is about to be told about.
    this.notifySelection(node, model);
    this.revealCaret(node);
  }

  /**
   * Reports the selection, if it has actually moved since last time.
   *
   * The guard is what keeps this quiet: holding a right arrow against
   * the end of the text moves nothing and must say nothing, and a
   * listener that recomputed decoration on every key would otherwise
   * do it forever for no reason.
   *
   * `hasListeners` already makes an unheard dispatch free, so the
   * cost when nobody is listening is the two comparisons here.
   */
  private notifySelection(node: UiNode, model: EditableTextModel): void {
    if (model.anchor === model.notifiedAnchor && model.focus === model.notifiedFocus) {
      return;
    }
    model.notifiedAnchor = model.anchor;
    model.notifiedFocus = model.focus;
    this.dispatcher.dispatch(
      new UiSelectionChangeEvent(model.text, model.start, model.end, model.anchor, model.focus),
      node
    );
  }

  private afterSelectionChange(node: UiNode, model: EditableTextModel, keepGoal = false): void {
    if (!keepGoal) {
      this.verticalGoalX = undefined;
    }
    model.blinkOrigin = this.host.now();
    this.host.markDirty(node, DirtyFlags.Paint);
    this.notifySelection(node, model);
    this.revealCaret(node);
  }

  // ---------------------------------------------------------------------------
  // Selections across fields
  // ---------------------------------------------------------------------------

  /**
   * Selects from `anchor` to `focus`, in one field or across the fields
   * of an editing group, and focuses the field the focus end is in: what
   * an application does after a command over a selection, to leave it
   * selected. False when the two ends are not editables of one group.
   */
  select(anchor: UiTextPosition, focus: UiTextPosition): boolean {
    if (!isEditableNode(anchor.node) || !isEditableNode(focus.node)) {
      return false;
    }
    if (anchor.node === focus.node) {
      this.clearSpan();
      const model = editorFor(focus.node);
      model.select(anchor.offset, focus.offset);
      this.focusField(focus.node);
      this.afterSelectionChange(focus.node, model);
      return true;
    }
    const owner = editingGroupOf(anchor.node);
    if (owner === null || editingGroupOf(focus.node)?.root !== owner.root) {
      return false;
    }
    const clamp = (position: UiTextPosition): UiTextPosition => ({
      node: position.node,
      offset: Math.max(0, Math.min(position.offset, editorFor(position.node).text.length))
    });
    this.setSpan(owner, clamp(anchor), clamp(focus));
    return true;
  }

  /** Whether a selection is spanning the fields of a group. */
  get spanning(): boolean {
    return this.span !== null;
  }

  /**
   * Selects from `anchor` to `focus` across a group's fields: lights
   * every field between them with its part, gives the focus field its
   * own part in its model (anchored on the side the selection comes
   * from, so its keys and its IME stay sensible), and moves focus there.
   * Two ends in one field are that field's selection, as ever.
   */
  private setSpan(
    owner: { readonly root: UiNode; readonly group: UiEditingGroup },
    anchor: UiTextPosition,
    focus: UiTextPosition,
    goalX?: number
  ): void {
    if (anchor.node === focus.node) {
      this.clearSpan();
      const model = editorFor(focus.node);
      model.select(anchor.offset, focus.offset);
      this.focusField(focus.node);
      this.afterSelectionChange(focus.node, model);
      return;
    }
    const forward = comparePositions(anchor, focus) <= 0;
    const start = forward ? anchor : focus;
    const end = forward ? focus : anchor;
    const lit: UiNode[] = [];
    for (let node: UiNode | null = start.node; node !== null; node = adjacentField(owner.root, node, 1)) {
      const length = editorFor(node).text.length;
      const from = node === start.node ? start.offset : 0;
      const to = node === end.node ? end.offset : length;
      if (setSelectionRange(node, from, to)) {
        this.host.markDirty(node, DirtyFlags.Paint);
      }
      lit.push(node);
      if (node === end.node) {
        break;
      }
    }
    const keep = new Set(lit);
    for (const node of this.span?.lit ?? []) {
      if (!keep.has(node) && clearSelectionRange(node)) {
        this.host.markDirty(node, DirtyFlags.Paint);
      }
    }
    const model = editorFor(focus.node);
    model.select(forward ? 0 : model.text.length, focus.offset);
    this.span = { root: owner.root, group: owner.group, anchor, focus, lit };
    owner.group.onSelectionChange?.({ start, end });
    this.focusField(focus.node);
    // A run of Shift and up or down keeps returning to one column.
    this.verticalGoalX = goalX;
    this.afterSelectionChange(focus.node, model, goalX !== undefined);
  }

  /** Ends a selection across fields, if there is one, unlighting them. */
  private clearSpan(): void {
    const span = this.span;
    if (span === null) {
      return;
    }
    this.span = null;
    for (const node of span.lit) {
      if (clearSelectionRange(node)) {
        this.host.markDirty(node, DirtyFlags.Paint);
      }
    }
    span.group.onSelectionChange?.(null);
  }

  /** Collapses a selection across fields to its start (-1) or its end (1). */
  private collapseSpan(direction: -1 | 1): void {
    const span = this.span!;
    const forward = comparePositions(span.anchor, span.focus) <= 0;
    const target = direction < 0 === forward ? span.anchor : span.focus;
    this.clearSpan();
    const model = editorFor(target.node);
    model.select(target.offset);
    this.focusField(target.node);
    this.afterSelectionChange(target.node, model);
  }

  /**
   * Hands an edit over a selection across fields to the group, and ends
   * the selection. No field is changed: the application changes its
   * document, which changes the fields, and places the caret.
   */
  private spanEdit(inputType: string, data: string | null, html: string | null = null): boolean {
    const span = this.span!;
    const forward = comparePositions(span.anchor, span.focus) <= 0;
    const start = forward ? span.anchor : span.focus;
    const end = forward ? span.focus : span.anchor;
    this.clearSpan();
    editorFor(span.focus.node).select(span.focus.offset);
    span.group.onEdit({ inputType, data, html, start, end });
    return true;
  }

  /** The text and HTML a selection across fields copies as. */
  private spanCopy(): { readonly text: string; readonly html: string | undefined } {
    const span = this.span!;
    const forward = comparePositions(span.anchor, span.focus) <= 0;
    const start = forward ? span.anchor : span.focus;
    const end = forward ? span.focus : span.anchor;
    const key: unknown[] = [span];
    for (const node of span.lit) {
      key.push(editorFor(node).text);
    }
    return this.cachedCopy(key, () => {
      const text =
        span.group.copyText !== undefined
          ? span.group.copyText(start, end)
          : span.lit
              .map(node => {
                const text = editorFor(node).text;
                return text.slice(node === start.node ? start.offset : 0, node === end.node ? end.offset : text.length);
              })
              .join('\n');
      return { text, html: span.group.copyHtml?.(start, end) ?? undefined };
    });
  }

  /** The HTML a selection inside one field of a group copies as, if the group gives any. */
  private fieldHtml(node: UiNode, start: number, end: number): string | undefined {
    const group = editingGroupOf(node)?.group;
    if (group?.copyHtml === undefined) {
      return undefined;
    }
    const text = editorFor(node).text;
    return this.cachedCopy([node, text, start, end], () => ({
      text: text.slice(start, end),
      html: group.copyHtml!({ node, offset: start }, { node, offset: end }) ?? undefined
    })).html;
  }

  private cachedCopy(
    key: readonly unknown[],
    make: () => { readonly text: string; readonly html: string | undefined }
  ): { readonly text: string; readonly html: string | undefined } {
    const last = this.copied;
    if (last !== null && last.key.length === key.length && last.key.every((part, i) => part === key[i])) {
      return last;
    }
    this.copied = { key, ...make() };
    return this.copied;
  }

  /** Where a Shift and press extends from: the focused field's anchor, if it is in the same group. */
  private anchorIn(owner: { readonly root: UiNode } | null, node: UiNode | null): UiTextPosition | null {
    if (owner === null || node === null || editingGroupOf(node)?.root !== owner.root) {
      return null;
    }
    return { node, offset: editorFor(node).anchor };
  }

  /**
   * The field of a group a drag at height `y` is over: stepping up or
   * down from `from` until one reaches it, so a drag costs the fields it
   * crosses. A point in the gap between two fields belongs to the next
   * one in the direction of travel.
   */
  private fieldAt(root: UiNode, from: UiNode, y: number): UiNode {
    let current = from;
    for (;;) {
      const box = this.host.visibleBox(current);
      const step = y < box.y ? -1 : y > box.y + box.height ? 1 : 0;
      if (step === 0) {
        return current;
      }
      const next = adjacentField(root, current, step);
      if (next === null) {
        return current;
      }
      const nextBox = this.host.visibleBox(next);
      if (step > 0 ? y < nextBox.y : y > nextBox.y + nextBox.height) {
        // In the gap: the next field, the way the drag is going.
        return next;
      }
      current = next;
    }
  }

  /** Focuses a field for the span without ending it. */
  private focusField(node: UiNode): void {
    if (this.focusedEditable === node) {
      return;
    }
    this.spanFocusing = true;
    try {
      this.focus.focus(node);
    } finally {
      this.spanFocusing = false;
    }
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
  /**
   * Where the caret is inside a field, in the field's own coordinates.
   *
   * Relative to the node's border-box origin, with the field's own
   * scroll already applied — so a popup placed under the caret adds
   * the node's position on screen and nothing else.
   *
   * Public because an application cannot work this out. The geometry
   * needs the paragraph as it was *laid out*, which means the
   * measurer, the resolved paint and the layout record, and an
   * application that re-measured the text to find the caret would be
   * a second measurer that must never disagree with this one. Asking
   * is the only version that stays right.
   *
   * Null when the node is not an editable, or has not been laid out.
   */
  caretRectOf(node: UiNode): CaretRect | null {
    if (!isEditableNode(node) || this.host.recordFor(node) === undefined) {
      return null;
    }
    return this.layoutOf(node).caretRect();
  }

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
