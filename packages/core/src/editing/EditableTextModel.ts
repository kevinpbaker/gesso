import {
  lineEndAt,
  lineStartAt,
  nextGraphemeEnd,
  nextWordEnd,
  previousGraphemeStart,
  previousWordStart
} from './TextBoundaries';

/** How far a caret move or a delete reaches. */
export type EditUnit = 'grapheme' | 'word' | 'line' | 'document';

/** A composition in progress: the IME owns `[start, end)` until it commits. */
export interface CompositionRange {
  readonly start: number;
  readonly end: number;
}

interface Snapshot {
  text: string;
  anchor: number;
  focus: number;
}

type EditKind = 'insert' | 'delete' | 'other';

const MAX_UNDO = 500;

/**
 * The text behind an editable node: the buffer, the selection, the
 * composition the IME is building, and an undo stack.
 *
 * Deliberately free of layout: everything that needs a line or an x
 * position (up/down, click to place, drag to select) is computed by
 * `TextGeometry` from the paragraph layout and fed in as an offset.
 * That keeps this class a plain value that specs can drive without a
 * measurer.
 *
 * Selection is `anchor` → `focus` (the caret). `start`/`end` are the
 * same two in order. Offsets are UTF-16 code units; every move and
 * delete steps by grapheme so a caret never splits an emoji.
 *
 * Undo coalesces a run of typing into one entry and a run of
 * backspaces into another, as editors do, and breaks the group on
 * anything else. A composition is one entry however many updates it
 * took. `replaceText` — the host resetting the value from outside —
 * drops the history: the text it replaces never existed as far as the
 * next undo is concerned.
 */
export class EditableTextModel {
  private textValue = '';
  private anchorValue = 0;
  private focusValue = 0;
  private compositionValue: CompositionRange | null = null;
  private compositionBase: Snapshot | null = null;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private lastEdit: EditKind = 'other';
  private lastEditEnd = -1;

  /** Whether the node holds focus; the caret only shows (and blinks) then. */
  focused = false;
  /**
   * Bumped by every change to the text or the selection, so anything
   * derived from them can tell cheaply whether it is stale.
   */
  version = 0;
  /**
   * The time the caret last moved or the text changed. The caret is
   * visible from here and blinks from here, so typing keeps it lit.
   */
  blinkOrigin = 0;
  /** The last `value` the host synchronised in; see `UiEditable`. */
  syncedValue: string | undefined = undefined;

  /**
   * The selection the last `selectionchange` reported.
   *
   * Kept on the model rather than worked out at each call site,
   * because the caret is moved from a dozen places — arrows, clicks,
   * select-all, an edit that replaces a range — and every one of them
   * would otherwise have to remember to compare. Storing what was
   * last said makes the comparison the notifier's job and the answer
   * the same wherever the move came from.
   *
   * `NaN` to begin with, so the first report always fires: a fresh
   * model at offset zero has genuinely not told anyone yet.
   */
  notifiedAnchor = Number.NaN;
  notifiedFocus = Number.NaN;

  constructor(text = '') {
    this.textValue = text;
  }

  get text(): string {
    return this.textValue;
  }

  get anchor(): number {
    return this.anchorValue;
  }

  /** The caret: the moving end of the selection. */
  get focus(): number {
    return this.focusValue;
  }

  get start(): number {
    return Math.min(this.anchorValue, this.focusValue);
  }

  get end(): number {
    return Math.max(this.anchorValue, this.focusValue);
  }

  get collapsed(): boolean {
    return this.anchorValue === this.focusValue;
  }

  get selectedText(): string {
    return this.textValue.slice(this.start, this.end);
  }

  get composition(): CompositionRange | null {
    return this.compositionValue;
  }

  get composing(): boolean {
    return this.compositionValue !== null;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  /** Sets the selection; `focus` defaults to `anchor` (a caret). */
  select(anchor: number, focus: number = anchor): void {
    const nextAnchor = this.clampOffset(anchor);
    const nextFocus = this.clampOffset(focus);
    if (nextAnchor === this.anchorValue && nextFocus === this.focusValue) {
      return;
    }
    this.anchorValue = nextAnchor;
    this.focusValue = nextFocus;
    this.lastEdit = 'other';
    this.touch();
  }

  /** Moves the caret to `offset`, extending the selection from the anchor when asked. */
  moveTo(offset: number, extend: boolean): void {
    this.select(extend ? this.anchorValue : offset, offset);
  }

  selectAll(): void {
    this.select(0, this.textValue.length);
  }

  /**
   * Moves the caret by one unit. A collapsed selection moves from the
   * caret; a range collapses to the side it moves toward first, as
   * every editor does. 'line' is the hard line (up to a newline);
   * vertical movement is the caller's, since it needs geometry.
   */
  move(unit: EditUnit, direction: -1 | 1, extend: boolean): void {
    if (!extend && !this.collapsed && unit === 'grapheme') {
      this.select(direction < 0 ? this.start : this.end);
      return;
    }
    this.moveTo(this.offsetBy(this.focusValue, unit, direction), extend);
  }

  /** The offset one `unit` away from `from` in `direction`. */
  offsetBy(from: number, unit: EditUnit, direction: -1 | 1): number {
    const text = this.textValue;
    switch (unit) {
      case 'grapheme':
        return direction < 0 ? previousGraphemeStart(text, from) : nextGraphemeEnd(text, from);
      case 'word':
        return direction < 0 ? previousWordStart(text, from) : nextWordEnd(text, from);
      case 'line':
        return direction < 0 ? lineStartAt(text, from) : lineEndAt(text, from);
      case 'document':
        return direction < 0 ? 0 : text.length;
    }
  }

  // ---------------------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------------------

  /**
   * Replaces the selection with `text` and puts the caret after it.
   * Single-grapheme insertions at the caret coalesce into one undo
   * entry with the previous one.
   */
  insertText(text: string): void {
    const start = this.start;
    const end = this.end;
    const typing = this.collapsed && text.length > 0 && text === text.slice(0, nextGraphemeEnd(text, 0));
    const coalesce = typing && this.lastEdit === 'insert' && this.lastEditEnd === start;
    this.edit(start, end, text, coalesce, 'insert');
  }

  /**
   * Deletes the selection, or one unit before the caret when nothing
   * is selected. Repeated single-grapheme deletes coalesce.
   */
  deleteBackward(unit: EditUnit = 'grapheme'): void {
    if (!this.collapsed) {
      this.edit(this.start, this.end, '', false, 'other');
      return;
    }
    const caret = this.focusValue;
    if (caret === 0) {
      return;
    }
    let start = this.offsetBy(caret, unit, -1);
    if (start === caret) {
      // Already at the line start: Cmd+Backspace on an empty line joins it.
      start = previousGraphemeStart(this.textValue, caret);
    }
    const coalesce = unit === 'grapheme' && this.lastEdit === 'delete' && this.lastEditEnd === caret;
    this.edit(start, caret, '', coalesce, 'delete');
  }

  /** Deletes the selection, or one unit after the caret. */
  deleteForward(unit: EditUnit = 'grapheme'): void {
    if (!this.collapsed) {
      this.edit(this.start, this.end, '', false, 'other');
      return;
    }
    const caret = this.focusValue;
    if (caret >= this.textValue.length) {
      return;
    }
    let end = this.offsetBy(caret, unit, 1);
    if (end === caret) {
      end = nextGraphemeEnd(this.textValue, caret);
    }
    this.edit(caret, end, '', false, 'other');
  }

  /** Replaces `[start, end)` with `text`; one undo entry. */
  replaceRange(start: number, end: number, text: string): void {
    const from = this.clampOffset(Math.min(start, end));
    const to = this.clampOffset(Math.max(start, end));
    this.edit(from, to, text, false, 'other');
  }

  /**
   * Resets the text from outside (the host's `value`). The selection
   * is kept where it still fits; the history is dropped. Equal text is
   * a no-op, which is what makes a controlled value echo harmless.
   */
  replaceText(text: string): void {
    if (text === this.textValue) {
      return;
    }
    this.textValue = text;
    this.anchorValue = this.clampOffset(this.anchorValue);
    this.focusValue = this.clampOffset(this.focusValue);
    this.compositionValue = null;
    this.compositionBase = null;
    this.undoStack = [];
    this.redoStack = [];
    this.lastEdit = 'other';
    this.touch();
  }

  // ---------------------------------------------------------------------------
  // Composition
  // ---------------------------------------------------------------------------

  /**
   * An IME started composing: the selection is what it replaces. Until
   * the commit, `updateComposition` rewrites the composing range in
   * place and the undo stack sees nothing.
   */
  beginComposition(): void {
    if (this.compositionValue !== null) {
      return;
    }
    this.compositionBase = this.snapshot();
    const start = this.start;
    const end = this.end;
    if (start !== end) {
      this.textValue = this.textValue.slice(0, start) + this.textValue.slice(end);
    }
    this.anchorValue = start;
    this.focusValue = start;
    this.compositionValue = { start, end: start };
    this.touch();
  }

  /**
   * The composition text changed; `caret` is the caret within it.
   * Without a preceding `beginComposition` one is started here.
   */
  updateComposition(text: string, caret: number = text.length): void {
    if (this.compositionValue === null) {
      this.beginComposition();
    }
    const range = this.compositionValue!;
    this.textValue = this.textValue.slice(0, range.start) + text + this.textValue.slice(range.end);
    const end = range.start + text.length;
    this.compositionValue = { start: range.start, end };
    const position = range.start + Math.max(0, Math.min(caret, text.length));
    this.anchorValue = position;
    this.focusValue = position;
    this.touch();
  }

  /**
   * The IME finished: `text` (the committed string) replaces the
   * composing range, the caret follows it and the whole composition
   * becomes one undo entry. With no composition open this is a plain
   * insertion, which is how an engine that reports the end before the
   * updates still lands the text once.
   */
  commitComposition(text: string): void {
    if (this.compositionValue === null) {
      this.insertText(text);
      this.lastEdit = 'other';
      return;
    }
    const range = this.compositionValue;
    const base = this.compositionBase;
    this.textValue = this.textValue.slice(0, range.start) + text + this.textValue.slice(range.end);
    const caret = range.start + text.length;
    this.anchorValue = caret;
    this.focusValue = caret;
    this.compositionValue = null;
    this.compositionBase = null;
    if (base !== null && base.text !== this.textValue) {
      this.pushUndo(base);
    }
    this.lastEdit = 'other';
    this.touch();
  }

  /** The IME abandoned the composition: the text is as it was before it. */
  cancelComposition(): void {
    if (this.compositionValue === null) {
      return;
    }
    const base = this.compositionBase!;
    this.textValue = base.text;
    this.anchorValue = base.anchor;
    this.focusValue = base.focus;
    this.compositionValue = null;
    this.compositionBase = null;
    this.touch();
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (entry === undefined) {
      return false;
    }
    this.redoStack.push(this.snapshot());
    this.restore(entry);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (entry === undefined) {
      return false;
    }
    this.undoStack.push(this.snapshot());
    this.restore(entry);
    return true;
  }

  /** Ends the current typing run: the next insertion starts a new undo entry. */
  breakUndoGroup(): void {
    this.lastEdit = 'other';
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private edit(start: number, end: number, text: string, coalesce: boolean, kind: EditKind): void {
    if (this.compositionValue !== null) {
      // An edit under an open composition ends it as committed.
      this.commitComposition(this.textValue.slice(this.compositionValue.start, this.compositionValue.end));
    }
    if (start === end && text.length === 0) {
      return;
    }
    if (!coalesce) {
      this.pushUndo(this.snapshot());
    }
    this.redoStack = [];
    this.textValue = this.textValue.slice(0, start) + text + this.textValue.slice(end);
    const caret = start + text.length;
    this.anchorValue = caret;
    this.focusValue = caret;
    this.lastEdit = kind;
    this.lastEditEnd = caret;
    this.touch();
  }

  private pushUndo(entry: Snapshot): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_UNDO) {
      this.undoStack.shift();
    }
  }

  private restore(entry: Snapshot): void {
    this.textValue = entry.text;
    this.anchorValue = this.clampOffset(entry.anchor);
    this.focusValue = this.clampOffset(entry.focus);
    this.compositionValue = null;
    this.compositionBase = null;
    this.lastEdit = 'other';
    this.touch();
  }

  private snapshot(): Snapshot {
    return { text: this.textValue, anchor: this.anchorValue, focus: this.focusValue };
  }

  private clampOffset(offset: number): number {
    return Math.max(0, Math.min(this.textValue.length, Math.floor(offset)));
  }

  private touch(): void {
    this.version++;
  }
}
