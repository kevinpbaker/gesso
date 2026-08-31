import type { EditingState, UiSemanticsRecord } from '@gesso/core';

/**
 * Where the proxy sends what it hears. `WorkerApp` posts each call to
 * the render worker; `GessoApp` calls the runtime's editing controller
 * directly.
 */
export interface EditingProxySink {
  beforeInput(inputType: string, data: string | null): void;
  compositionStart(): void;
  compositionUpdate(text: string, caret: number): void;
  compositionEnd(text: string): void;
  paste(text: string): void;
  /** The proxy lost focus to something outside the app. */
  blur(): void;
  /**
   * Key events reach the proxy's element, not the canvas, while it has
   * focus. A shell that listens on the canvas forwards them from here;
   * one that listens on `window` sees them anyway and leaves these out.
   */
  keyDown?(event: KeyboardEvent): void;
  keyUp?(event: KeyboardEvent): void;
}

/** Composition-owned input types: the composition events carry these. */
const COMPOSITION_INPUT_TYPES = new Set(['insertCompositionText', 'insertFromComposition', 'deleteCompositionText']);
/**
 * Input types the keys already carry. Backspace, Delete and Enter reach
 * the runtime as key presses and are applied there; the textarea fires
 * these too, but only when its mirror happens to have something to
 * delete at the caret, so they cannot be the path — and forwarding them
 * as well would apply each edit twice. Undo and redo likewise: the
 * browser has no history of ours to replay.
 */
const KEY_INPUT_TYPES = new Set([
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
  'deleteSoftLineBackward',
  'deleteSoftLineForward',
  'deleteHardLineBackward',
  'deleteHardLineForward',
  'insertLineBreak',
  'insertParagraph',
  'historyUndo',
  'historyRedo'
]);

/**
 * The main thread's half of text editing: a hidden `<textarea>`.
 *
 * A canvas cannot receive text. Keyboard events carry keys, not
 * characters: dead keys, the OS keyboard layout and above all an IME
 * resolve to text only inside an editable DOM element, through
 * `beforeinput` and the `composition*` events. So while the runtime
 * reports a focused editable, this element takes DOM focus and:
 *
 *   - forwards every `beforeinput` as an edit intent and cancels it, so
 *     the element's own content never diverges from the runtime's;
 *   - empties itself when a composition starts, so the composition
 *     text is the whole value and the IME candidate window opens at the
 *     element's top-left — which is positioned at the runtime's caret;
 *   - reports the composition through `input` events while it is open
 *     and its result at `compositionend`;
 *   - handles copy, cut and paste with the runtime's text, since the
 *     clipboard is only reachable from a user gesture on this thread;
 *   - mirrors the runtime's text and selection between edits, so native
 *     copy, IME context and, later, assistive technology see the real
 *     text.
 *
 * Nothing here reads the textarea's content as truth except the
 * composition string, which is the one thing only the browser knows.
 */
export class EditingProxy {
  private readonly textarea: HTMLTextAreaElement;
  private readonly doc: Document;
  private readonly view: Window | null;
  private state: EditingState | null = null;
  private composing = false;
  private disposed = false;
  /** Set while `raiseKeyboard` drops focus on purpose; see there. */
  private refocusing = false;
  private readonly detach: () => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sink: EditingProxySink
  ) {
    this.doc = canvas.ownerDocument;
    this.view = this.doc.defaultView;
    const textarea = this.doc.createElement('textarea');
    this.textarea = textarea;
    textarea.setAttribute('aria-hidden', 'true');
    textarea.setAttribute('autocomplete', 'off');
    textarea.setAttribute('autocorrect', 'off');
    textarea.setAttribute('autocapitalize', 'off');
    textarea.setAttribute('spellcheck', 'false');
    textarea.setAttribute('wrap', 'off');
    textarea.tabIndex = -1;
    Object.assign(textarea.style, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: '1px',
      height: '1em',
      margin: '0',
      padding: '0',
      border: '0',
      outline: 'none',
      opacity: '0',
      overflow: 'hidden',
      resize: 'none',
      whiteSpace: 'pre',
      pointerEvents: 'none',
      zIndex: '2147483647'
    } as Partial<CSSStyleDeclaration>);
    this.doc.body.appendChild(textarea);
    this.detach = this.listen();
  }

  /** True while an editable in the runtime has focus. */
  get active(): boolean {
    return this.state !== null;
  }

  /** The hidden element, for tests. */
  get element(): HTMLTextAreaElement {
    return this.textarea;
  }

  /**
   * The runtime's editing state changed. Null means no editable has
   * focus: the element gives focus back to the canvas so keys keep
   * reaching the app.
   */
  update(state: EditingState | null): void {
    if (this.disposed) {
      return;
    }
    const wasActive = this.state !== null;
    this.state = state;
    if (state === null) {
      if (wasActive) {
        if (this.doc.activeElement === this.textarea) {
          this.textarea.blur();
          this.canvas.focus({ preventScroll: true });
        }
      }
      return;
    }
    this.position(state);
    this.mirror(state);
    // What the phone's Return key should say. A single-line field has
    // nothing to insert a newline into, and a keyboard offering one is
    // offering a key that does nothing.
    this.textarea.setAttribute('enterkeyhint', state.multiline ? 'enter' : 'done');
    if (!wasActive || this.doc.activeElement !== this.textarea) {
      const active = this.doc.activeElement;
      // Take focus only from the canvas or from nothing: an editable
      // gaining focus in the app must not steal it from page chrome.
      if (active === null || active === this.doc.body || active === this.canvas || active === this.textarea) {
        this.textarea.focus({ preventScroll: true });
      }
    }
  }

  /**
   * Takes DOM focus for the focused editable, unconditionally.
   *
   * `update()` is careful about where it takes focus from — page
   * chrome outside the app must keep it — but the accessibility
   * mirror calls this only when the runtime has just said an editable
   * holds focus, and the element it is taking focus from is the
   * mirror's own. Without it, moving focus from a button to a field
   * would leave DOM focus on the button's mirrored element and the
   * IME with nothing to compose into.
   */
  focus(): void {
    if (this.disposed || this.state === null || this.doc.activeElement === this.textarea) {
      return;
    }
    this.textarea.focus({ preventScroll: true });
  }

  /**
   * Re-takes DOM focus from inside a user gesture, so a phone opens its
   * keyboard.
   *
   * A phone raises the keyboard for a focus that a person's gesture
   * caused, and for no other. In the worker configuration the runtime's
   * answer to a press — *this* node is editable, it has focus now —
   * arrives as a message a frame later, and `update()` focuses the
   * element from inside that message handler. The task the gesture
   * belonged to is over by then, so iOS moves focus and leaves the
   * keyboard down: a field the person is demonstrably typing into, with
   * nothing to type on.
   *
   * The shell calls this from the `pointerup` of the press that opened
   * the editable, which is a gesture task, and only for a press that
   * turned editing on — re-asserting focus while the keyboard is
   * already up is what makes it flicker.
   *
   * Focus has to be dropped and retaken rather than simply retaken:
   * focusing an element that is already focused does nothing at all,
   * and it already is focused — that is the whole problem. The blur is
   * ours, so the listener that would report it to the runtime as the
   * person leaving the field is suppressed for its duration.
   *
   * Nothing calls it in the single-threaded configuration and nothing
   * should: there, `update()` runs inside the pointerdown's own call
   * stack and the browser sees the focus as the gesture's.
   */
  raiseKeyboard(): void {
    if (this.disposed || this.state === null) {
      return;
    }
    const textarea = this.textarea;
    if (this.doc.activeElement !== textarea) {
      textarea.focus({ preventScroll: true });
      return;
    }
    this.refocusing = true;
    try {
      textarea.blur();
      textarea.focus({ preventScroll: true });
    } finally {
      this.refocusing = false;
    }
  }

  /**
   * Describes the focused editable on this element, for the
   * accessibility mirror (`SemanticsMirror`).
   *
   * The textarea is `aria-hidden` by default because an unlabelled
   * text box floating over an application is noise; when the mirror
   * hands it a record it stops being unlabelled, and becomes the one
   * element that is both what the assistive technology reads and what
   * the person is really typing into. That the two cannot disagree is
   * the reason the field's semantics live here rather than on a second
   * element beside it.
   */
  describe(record: UiSemanticsRecord | null): void {
    if (this.disposed) {
      return;
    }
    const textarea = this.textarea;
    if (record === null) {
      textarea.setAttribute('aria-hidden', 'true');
      for (const attribute of [
        'role',
        'aria-label',
        'aria-description',
        'aria-required',
        'aria-invalid',
        'aria-readonly',
        'aria-disabled'
      ]) {
        textarea.removeAttribute(attribute);
      }
      return;
    }
    textarea.removeAttribute('aria-hidden');
    setOrClear(textarea, 'role', record.role);
    setOrClear(textarea, 'aria-label', record.label);
    setOrClear(textarea, 'aria-description', record.description);
    const states = new Set(record.states ?? []);
    setOrClear(textarea, 'aria-required', states.has('required') ? 'true' : undefined);
    setOrClear(textarea, 'aria-invalid', states.has('invalid') ? 'true' : undefined);
    setOrClear(textarea, 'aria-readonly', states.has('readonly') ? 'true' : undefined);
    setOrClear(textarea, 'aria-disabled', record.disabled === true ? 'true' : undefined);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.detach();
    this.state = null;
    this.textarea.remove();
  }

  /** Puts the element where the caret is, so the IME window opens there. */
  private position(state: EditingState): void {
    const rect = this.canvas.getBoundingClientRect();
    const height = Math.max(1, state.caret.height);
    const left = rect.left + Math.min(Math.max(0, state.caret.x), Math.max(0, rect.width - 1));
    const top = rect.top + Math.min(Math.max(0, state.caret.y), Math.max(0, rect.height - height));
    const style = this.textarea.style;
    style.left = `${left}px`;
    style.top = `${top}px`;
    style.height = `${height}px`;
    style.fontSize = `${Math.max(1, Math.round(height * 0.75))}px`;
    style.lineHeight = `${height}px`;
  }

  /** Mirrors the runtime's text and selection, except while the IME owns the element. */
  private mirror(state: EditingState): void {
    if (this.composing) {
      return;
    }
    const textarea = this.textarea;
    if (textarea.value !== state.text) {
      textarea.value = state.text;
    }
    if (textarea.selectionStart !== state.selectionStart || textarea.selectionEnd !== state.selectionEnd) {
      try {
        textarea.setSelectionRange(state.selectionStart, state.selectionEnd);
      } catch {
        // Some engines throw for an offset past the value; the next
        // state will be consistent.
      }
    }
  }

  private listen(): () => void {
    const textarea = this.textarea;

    const onBeforeInput = (event: Event): void => {
      const input = event as InputEvent;
      const type = input.inputType;
      if (COMPOSITION_INPUT_TYPES.has(type) || this.composing) {
        // Not cancelable, and carried by the composition events.
        return;
      }
      event.preventDefault();
      if (KEY_INPUT_TYPES.has(type) || type === 'insertFromPaste') {
        // Deletes, newlines and undo come from the keys; paste from the
        // paste event.
        return;
      }
      this.sink.beforeInput(type, input.data ?? null);
    };

    const onCompositionStart = (): void => {
      this.composing = true;
      // Empty, so the composition text is the whole value and the
      // element's caret — where the IME opens — is at its top-left.
      textarea.value = '';
      this.sink.compositionStart();
    };

    const onInput = (): void => {
      if (!this.composing) {
        return;
      }
      const text = textarea.value;
      const caret = textarea.selectionStart ?? text.length;
      this.sink.compositionUpdate(text, Math.max(0, Math.min(caret, text.length)));
    };

    const onCompositionEnd = (event: Event): void => {
      if (!this.composing) {
        return;
      }
      this.composing = false;
      const text = (event as CompositionEvent).data ?? textarea.value;
      this.sink.compositionEnd(text);
      if (this.state !== null) {
        this.mirror(this.state);
      }
    };

    const onPaste = (event: Event): void => {
      const clipboard = (event as ClipboardEvent).clipboardData;
      event.preventDefault();
      const text = clipboard?.getData('text/plain') ?? '';
      if (text.length > 0) {
        this.sink.paste(text);
      }
    };

    const onCopy = (event: Event): void => {
      const clipboard = (event as ClipboardEvent).clipboardData;
      const state = this.state;
      if (clipboard === null || state === null) {
        return;
      }
      event.preventDefault();
      clipboard.setData('text/plain', state.text.slice(state.selectionStart, state.selectionEnd));
    };

    const onCut = (event: Event): void => {
      const state = this.state;
      onCopy(event);
      if (state !== null && state.selectionEnd > state.selectionStart) {
        this.sink.beforeInput('deleteByCut', null);
      }
    };

    const onKeyDown = (event: Event): void => {
      this.sink.keyDown?.(event as KeyboardEvent);
    };
    const onKeyUp = (event: Event): void => {
      this.sink.keyUp?.(event as KeyboardEvent);
    };

    const onBlur = (event: Event): void => {
      if (this.refocusing) {
        // Our own blur, half of retaking focus inside a gesture. The
        // person has not left anything.
        return;
      }
      // Focus moved within the page (not the window losing focus, which
      // also blurs) to something other than the canvas: the app's
      // editable should stop showing a caret.
      const related = (event as FocusEvent).relatedTarget;
      if (this.state !== null && this.doc.hasFocus() && related !== this.canvas) {
        this.sink.blur();
      }
    };

    const onReposition = (): void => {
      if (this.state !== null) {
        this.position(this.state);
      }
    };

    textarea.addEventListener('beforeinput', onBeforeInput);
    textarea.addEventListener('compositionstart', onCompositionStart);
    textarea.addEventListener('input', onInput);
    textarea.addEventListener('compositionend', onCompositionEnd);
    textarea.addEventListener('paste', onPaste);
    textarea.addEventListener('copy', onCopy);
    textarea.addEventListener('cut', onCut);
    textarea.addEventListener('keydown', onKeyDown);
    textarea.addEventListener('keyup', onKeyUp);
    textarea.addEventListener('blur', onBlur);
    this.view?.addEventListener('scroll', onReposition, { capture: true, passive: true });
    this.view?.addEventListener('resize', onReposition);

    return () => {
      textarea.removeEventListener('beforeinput', onBeforeInput);
      textarea.removeEventListener('compositionstart', onCompositionStart);
      textarea.removeEventListener('input', onInput);
      textarea.removeEventListener('compositionend', onCompositionEnd);
      textarea.removeEventListener('paste', onPaste);
      textarea.removeEventListener('copy', onCopy);
      textarea.removeEventListener('cut', onCut);
      textarea.removeEventListener('keydown', onKeyDown);
      textarea.removeEventListener('keyup', onKeyUp);
      textarea.removeEventListener('blur', onBlur);
      this.view?.removeEventListener('scroll', onReposition, { capture: true });
      this.view?.removeEventListener('resize', onReposition);
    };
  }
}

/**
 * Writes text to the system clipboard from the main thread. The async
 * API needs a secure context and, in some browsers, a recent user
 * gesture; the `execCommand` fallback covers the rest.
 */
export function writeClipboard(text: string, doc: Document = document): void {
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
    clipboard.writeText(text).catch(() => copyWithExecCommand(text, doc));
    return;
  }
  copyWithExecCommand(text, doc);
}

function copyWithExecCommand(text: string, doc: Document): void {
  const previous = doc.activeElement as HTMLElement | null;
  const scratch = doc.createElement('textarea');
  scratch.value = text;
  scratch.style.position = 'fixed';
  scratch.style.opacity = '0';
  doc.body.appendChild(scratch);
  scratch.select();
  try {
    doc.execCommand('copy');
  } finally {
    scratch.remove();
    previous?.focus?.({ preventScroll: true });
  }
}

function setOrClear(element: HTMLElement, attribute: string, value: string | undefined): void {
  if (value === undefined) {
    element.removeAttribute(attribute);
  } else {
    element.setAttribute(attribute, value);
  }
}
