import type { UiSemanticsAction, UiSemanticsRecord, UiSemanticsUpdate } from 'gesso-core';

/**
 * Where the mirror sends what it hears.
 *
 * `WorkerApp` posts each call to the render worker; `GessoApp` calls
 * the runtime directly. The same split as `EditingProxySink`, and for
 * the same reason: nothing here knows whether the runtime is a
 * function call or a thread away.
 */
export interface SemanticsMirrorSink {
  /** An assistive technology pressed, focused or set the value of a node. */
  action(action: UiSemanticsAction): void;
  /**
   * Key events reach a mirrored element, not the canvas, whenever the
   * app has focus — because the element holding DOM focus *is* the
   * mirror's. A shell that listens on the canvas forwards them from
   * here; one that listens on `window` sees them anyway and leaves
   * these out.
   */
  keyDown?(event: KeyboardEvent): void;
  keyUp?(event: KeyboardEvent): void;
  /**
   * Text pasted while a mirrored element holds focus.
   *
   * The same reasoning as the keys, and the same surprise: a paste
   * onto a grid lands on the mirror's element, not on the canvas and
   * not on the editing proxy — so a shell listening on either hears
   * nothing at all and the text is dropped before the application
   * sees it.
   */
  paste?(text: string): void;
}

/**
 * The editing proxy, as the mirror needs it.
 *
 * A focused editable is the one node the mirror must not take DOM
 * focus for: the hidden textarea has it, because that is the only way
 * an IME can compose (F2). So the mirror hands that element the
 * record instead, and the assistive technology reads the field it is
 * really typing into.
 */
export interface EditingMirrorTarget {
  /** True while the proxy holds DOM focus for a focused editable. */
  readonly active: boolean;
  /** Describes the focused editable on the proxy's element, or clears it. */
  describe(record: UiSemanticsRecord | null): void;
  /** Takes DOM focus back for the focused editable. */
  focus(): void;
}

/** Which ARIA attribute each semantic state becomes, and with what value. */
const STATE_ATTRIBUTES: Record<string, [attribute: string, value: string]> = {
  checked: ['aria-checked', 'true'],
  mixed: ['aria-checked', 'mixed'],
  expanded: ['aria-expanded', 'true'],
  collapsed: ['aria-expanded', 'false'],
  selected: ['aria-selected', 'true'],
  pressed: ['aria-pressed', 'true'],
  busy: ['aria-busy', 'true'],
  invalid: ['aria-invalid', 'true'],
  required: ['aria-required', 'true'],
  readonly: ['aria-readonly', 'true'],
  modal: ['aria-modal', 'true']
};

/**
 * Roles whose checked state is required rather than optional.
 *
 * A component publishes `checked` when it is on and nothing when it is
 * off, which is the right shape for a state list. ARIA does not agree:
 * on these roles `aria-checked` is a required attribute, and one that
 * is absent means "this is not a checkbox after all" rather than "this
 * checkbox is off". A screen reader then has nothing to announce.
 *
 * Filled in here rather than in each component for the reason
 * The reason: what an assistive technology needs is
 * the mirror's business, and a rule in one file cannot be forgotten by
 * the next control somebody writes. Found on a `RadioGroup` in a native
 * window, where the unselected radio carried no `aria-checked` at all.
 */
const CHECKABLE_ROLES: ReadonlySet<string> = new Set([
  'checkbox',
  'radio',
  'switch',
  'menuitemcheckbox',
  'menuitemradio'
]);

/** Every attribute a record can write, so clearing one is a fixed list. */
const RECORD_ATTRIBUTES: readonly string[] = [
  'role',
  'aria-label',
  'aria-description',
  'aria-live',
  'aria-disabled',
  'aria-valuenow',
  'aria-valuemin',
  'aria-valuemax',
  'aria-valuetext',
  'aria-posinset',
  'aria-setsize',
  'aria-level',
  'aria-checked',
  'aria-expanded',
  'aria-selected',
  'aria-pressed',
  'aria-busy',
  'aria-invalid',
  'aria-required',
  'aria-readonly',
  'aria-modal'
];

/**
 * Roles whose accessible name comes from what the element contains
 * rather than from an `aria-label`, plus prose, which has no role at
 * all. Everything else is a control, and a control is named.
 */
const NAMED_BY_CONTENT: ReadonlySet<string> = new Set(['heading', 'paragraph']);

/**
 * Live regions. Their name comes from an `aria-label` like any control's,
 * because the platform does not name a status from its content; but a
 * live region announces its *content* when it changes, and an
 * `aria-label` changing is silent, so the name is written as the text
 * as well. Chrome reports both, and reads the text out on change.
 */
const LIVE_ROLES: ReadonlySet<string> = new Set(['status', 'alert']);

/**
 * Roles whose value the platform reads out of the element's content
 * rather than off an attribute — a text field, in other words, whose
 * `value` in the accessibility tree is the text inside it.
 */
const VALUE_IN_CONTENT: ReadonlySet<string> = new Set(['textbox', 'searchbox']);

interface MirrorEntry {
  readonly element: HTMLElement;
  record: UiSemanticsRecord;
  /** The node's box in canvas coordinates, once one has been sent. */
  box?: MirrorBox;
  /**
   * What `position` last wrote into this element's style, so a frame
   * that recomputes the same four numbers can leave the style alone.
   * Absent until the first write, which is also why the zeroes
   * `createElement` sets do not count as written: they belong to an
   * element that has no box yet, and the first real box must land.
   */
  written?: WrittenOffset;
}

/**
 * The rounded offset an element's style already carries.
 *
 * Deliberately the *written* value rather than the box it came from:
 * that is what makes the comparison safe across a reparent. `position`
 * recomputes the offset from whatever parent the record names now, so
 * the cache is only ever asked whether the style string it is about to
 * write is the one already there — a question whose answer cannot go
 * stale while `position` is the only writer of these four properties.
 */
interface WrittenOffset {
  left: number;
  top: number;
  width: number;
  height: number;
}

type MirrorBox = UiSemanticsUpdate['boxes'][number]['box'];

/**
 * The off-screen DOM an assistive technology reads.
 *
 * A canvas has no accessibility tree of its own: a screen reader, an
 * OS accessibility API and an automated testing tool all see one empty
 * element where the whole application is. So the shell keeps a DOM
 * tree over the canvas — one transparent element per semantics record,
 * carrying that record's ARIA — and the platform reads *that*. This is
 * the approach Flutter web takes, for the same reason: it is the only
 * one that works with assistive technology that already exists, on
 * every one of the three webviews Gesso targets.
 *
 * Three rules keep it honest:
 *
 *   - **It is a mirror, not a source.** Nothing here decides anything.
 *     Records arrive from the runtime's semantics tree, boxes from its
 *     layout engine, focus from its focus manager, and an action taken
 *     on an element becomes ordinary input on the way back.
 *   - **It never takes the pointer.** The container is
 *     `pointer-events: none`, so a mouse press goes to the canvas
 *     underneath as it always did. The clicks that arrive here are the
 *     ones an assistive technology synthesises, which is exactly the
 *     set that has nowhere else to go.
 *   - **Elements are generic.** A `<div role="button">` is announced
 *     as a button but has no behaviour of its own, so Enter on it
 *     reaches the app's keymap once instead of also synthesising a
 *     click the way a real `<button>` would. Every activation path
 *     ends in one `click` action.
 */
export class SemanticsMirror {
  private readonly container: HTMLElement;
  private readonly doc: Document;
  private readonly entries = new Map<string, MirrorEntry>();
  /** Element back to record id, for the events an assistive technology sends. */
  private readonly ids = new WeakMap<HTMLElement, string>();
  private readonly detach: () => void;
  private resizeObserver: ResizeObserver | null = null;
  private stopTracking: (() => void) | null = null;
  /** True while this class is the one moving DOM focus. */
  private applying = false;
  private focusedId: string | null = null;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sink: SemanticsMirrorSink,
    private readonly editing: EditingMirrorTarget | null = null
  ) {
    this.doc = canvas.ownerDocument;
    const container = this.doc.createElement('div');
    this.container = container;
    container.setAttribute('data-gesso-semantics', '');
    Object.assign(container.style, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: '0px',
      height: '0px',
      // The canvas keeps every pointer event it ever had; only
      // synthesised activations land in here.
      pointerEvents: 'none',
      // Not `display: none`, `visibility: hidden` or zero opacity:
      // each of those takes the subtree out of the accessibility tree
      // as well as out of the picture, which is the whole content of
      // this element. Transparent and un-drawable is the combination
      // that stays readable.
      overflow: 'hidden',
      margin: '0',
      padding: '0',
      border: '0',
      color: 'transparent',
      background: 'transparent',
      font: '1px sans-serif',
      zIndex: '2147483646'
    } as Partial<CSSStyleDeclaration>);
    this.doc.body.appendChild(container);
    this.detach = this.listen();
    this.trackCanvas();
  }

  /** The container, for tests and for a shell that wants to inspect it. */
  get element(): HTMLElement {
    return this.container;
  }

  /** The element standing for a node, if the mirror has one. */
  elementFor(id: string): HTMLElement | undefined {
    return this.entries.get(id)?.element;
  }

  /**
   * Applies one frame's worth of change: what the tree means, where it
   * sits, and what has focus — in that order, because focus can name a
   * node the same update introduced.
   */
  apply(update: UiSemanticsUpdate): void {
    if (this.disposed) {
      return;
    }
    for (const patch of update.patches) {
      if (patch.op === 'remove') {
        this.remove(patch.id);
      } else {
        this.upsert(patch.node);
      }
    }
    // Every box lands before any style is written, in two passes over
    // the update. The second pass then sees final boxes whichever order
    // the worker sent them in, where a single pass positioned a child
    // against its parent's *new* box and its own *old* one whenever the
    // parent came first — a wrong offset that the child's own turn
    // happened to correct a moment later.
    const moved = new Set<MirrorEntry>();
    for (const { id, box } of update.boxes) {
      const entry = this.entries.get(id);
      if (entry === undefined) {
        continue;
      }
      entry.box = box;
      moved.add(entry);
    }
    for (const entry of moved) {
      this.position(entry);
      // The children sit inside this element, so their offsets are
      // measured from it: a parent that moved carries them with it in
      // the DOM, and their own left and top have to give that back. Only
      // the children this update left alone need that, though — a child
      // with a box of its own in here is positioned by its own turn in
      // this same loop, and repositioning it here as well is the work a
      // scroll does twice over, since a scroll moves a parent and all of
      // its children together.
      //
      // Indexed over the live `children` collection rather than a copy:
      // `position` writes four style properties and nothing else, so no
      // node is inserted, removed or reordered while this runs, and the
      // collection cannot shift under the index. (`place` is the one
      // thing that moves elements, and it has already finished above.)
      // The copy `Array.from` made was an allocation per moved parent,
      // which on a scrolling list is one per visible row.
      const children = entry.element.children;
      for (let index = 0; index < children.length; index += 1) {
        const childId = this.ids.get(children[index] as HTMLElement);
        const childEntry = childId === undefined ? undefined : this.entries.get(childId);
        if (childEntry !== undefined && childEntry.box !== undefined && !moved.has(childEntry)) {
          this.position(childEntry);
        }
      }
    }
    if (update.focused !== undefined) {
      this.applyFocus(update.focused);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.detach();
    this.stopTracking?.();
    this.stopTracking = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.entries.clear();
    this.container.remove();
  }

  // ---------------------------------------------------------------------------
  // Records
  // ---------------------------------------------------------------------------

  private upsert(record: UiSemanticsRecord): void {
    const existing = this.entries.get(record.id);
    const element = existing?.element ?? this.createElement();
    if (existing === undefined) {
      this.entries.set(record.id, { element, record });
      this.ids.set(element, record.id);
    } else {
      existing.record = record;
    }
    this.describe(element, record);
    this.place(element, record);
    if (existing?.box !== undefined) {
      // Under a different parent, the same box is a different offset —
      // and `existing.record` is the new record by now, so the offset
      // `position` recomputes is measured from the new parent. That is
      // what keeps the written-offset cache honest here: it is compared
      // against a value that already accounts for the move, so a
      // reparent that changes the offset writes, and one that does not
      // needs no write because `place` has already moved the element.
      this.position(existing);
    }
    if (record.id === this.focusedId) {
      // A record that changed while focused: the proxy's copy of it
      // has to change too, or a screen reader reads the old value.
      this.editing?.describe(this.editing.active ? record : null);
    }
  }

  private createElement(): HTMLElement {
    const element = this.doc.createElement('div');
    // Reachable by a programmatic or assistive focus, never by Tab:
    // the app owns its own focus order and moves DOM focus to follow
    // it, so the browser walking this tree would be a second, silent
    // focus model.
    element.tabIndex = -1;
    Object.assign(element.style, {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: '0px',
      height: '0px',
      margin: '0',
      padding: '0',
      border: '0',
      outline: 'none',
      overflow: 'hidden',
      // The container is `pointer-events: none`, but an element that
      // opted back in would take presses from the canvas.
      pointerEvents: 'none',
      color: 'transparent'
    } as Partial<CSSStyleDeclaration>);
    return element;
  }

  /** Writes a record onto its element as ARIA, clearing what it no longer says. */
  private describe(element: HTMLElement, record: UiSemanticsRecord): void {
    for (const attribute of RECORD_ATTRIBUTES) {
      element.removeAttribute(attribute);
    }
    const label = record.label;
    if (record.role !== undefined) {
      element.setAttribute('role', record.role);
    }
    if (label !== undefined && record.role !== undefined && !NAMED_BY_CONTENT.has(record.role)) {
      element.setAttribute('aria-label', label);
      // A text box's *value* is its content, and a screen reader reads
      // it from there: `aria-valuetext` is for a slider, not a field.
      // Without this a person could hear that a note's body exists and
      // never hear a word of it.
      setText(
        element,
        VALUE_IN_CONTENT.has(record.role) ? (record.valueText ?? '') : LIVE_ROLES.has(record.role) ? label : ''
      );
    } else {
      // Prose, a heading and a paragraph are named by what they
      // contain — and prose is most of what a screen reader reads, so
      // it has to be real text in the document rather than a label on
      // an empty box.
      setText(element, label ?? '');
    }
    if (record.description !== undefined) {
      element.setAttribute('aria-description', record.description);
    }
    if (record.live !== undefined) {
      element.setAttribute('aria-live', record.live);
    }
    if (record.disabled === true) {
      element.setAttribute('aria-disabled', 'true');
    }
    for (const state of record.states ?? []) {
      const attribute = STATE_ATTRIBUTES[state];
      if (attribute !== undefined) {
        element.setAttribute(attribute[0], attribute[1]);
      }
    }
    const saysChecked = (record.states ?? []).some(state => state === 'checked' || state === 'mixed');
    if (record.role !== undefined && CHECKABLE_ROLES.has(record.role) && !saysChecked) {
      element.setAttribute('aria-checked', 'false');
    }
    setNumber(element, 'aria-valuenow', record.valueNow);
    setNumber(element, 'aria-valuemin', record.valueMin);
    setNumber(element, 'aria-valuemax', record.valueMax);
    setNumber(element, 'aria-posinset', record.posInSet);
    setNumber(element, 'aria-setsize', record.setSize);
    setNumber(element, 'aria-level', record.level);
    if (record.valueText !== undefined) {
      element.setAttribute('aria-valuetext', record.valueText);
    }
  }

  /**
   * Puts an element under its parent, at the index the record gives.
   *
   * Document order is the order a screen reader reads in, so it is not
   * cosmetic: a row that moved up a list has to move up here too. Adds
   * arrive in document order, so a missing later sibling only ever
   * means "not yet", and appending is right.
   */
  private place(element: HTMLElement, record: UiSemanticsRecord): void {
    const parent = record.parent === null ? this.container : this.entries.get(record.parent)?.element;
    if (parent === undefined) {
      return;
    }
    const at = parent.children[record.index];
    if (at === element) {
      return;
    }
    parent.insertBefore(element, at ?? null);
  }

  /**
   * Writes an element's box as an offset from its parent's.
   *
   * Every element is absolutely positioned and nested under its parent,
   * so a child's `left` and `top` are read from the parent's padding
   * box, not from the canvas. Writing canvas coordinates into a nested
   * element added the parent's offset twice, and the rectangle an
   * assistive technology measured for a control inside a region stood
   * well below where the control was drawn. A parent whose box has not
   * arrived yet counts as sitting at the origin; the box loop above
   * repositions the children when it does.
   *
   * Rounded, because a subpixel box would make the style string differ
   * on frames where nothing an assistive technology can perceive has
   * changed.
   *
   * And rounding is why the four values are remembered and compared
   * before they are written. A scroll marks the container's transform,
   * which is a laid-out frame, so the worker sends every moved box every
   * scroll frame — and a style write invalidates style for that element
   * whether or not the value changed, on the one thread this whole
   * architecture exists to keep idle. The comparison has to be against
   * the rounded numbers rather than against the box: a subpixel change
   * survives the worker's exact comparison and still rounds to the pixel
   * that is already there. The win it buys is bigger than it looks,
   * because during a scroll a parent and its children move by the same
   * delta, so every child's offset *from its parent* is unchanged and a
   * scrolling list writes nothing at all for its rows.
   *
   * It is a claim about the style, not about the box, so a reparent
   * cannot make it lie: the offset is recomputed from the parent the
   * record names now, and if that offset is the same then the string
   * already on the element is still the right one — the element moving
   * in the DOM is what changes where it lands, not a style write. This
   * holds exactly as long as `position` is the only thing writing
   * `left`, `top`, `width` and `height` on a mirrored element.
   */
  private position(entry: MirrorEntry): void {
    const box = entry.box;
    if (box === undefined) {
      return;
    }
    const parent = entry.record.parent === null ? undefined : this.entries.get(entry.record.parent)?.box;
    const left = Math.round(box.x - (parent?.x ?? 0));
    const top = Math.round(box.y - (parent?.y ?? 0));
    const width = Math.round(box.width);
    const height = Math.round(box.height);
    const written = entry.written;
    if (
      written !== undefined &&
      written.left === left &&
      written.top === top &&
      written.width === width &&
      written.height === height
    ) {
      return;
    }
    if (written === undefined) {
      entry.written = { left, top, width, height };
    } else {
      // Overwritten in place rather than replaced: the elements that do
      // move, move every frame of a drag or a scroll, and this is the
      // one allocation on that path.
      written.left = left;
      written.top = top;
      written.width = width;
      written.height = height;
    }
    const { element } = entry;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
  }

  private remove(id: string): void {
    const entry = this.entries.get(id);
    if (entry === undefined) {
      return;
    }
    this.entries.delete(id);
    entry.element.remove();
    if (this.focusedId === id) {
      this.focusedId = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Focus
  // ---------------------------------------------------------------------------

  /**
   * Moves DOM focus to follow the app's.
   *
   * The app's focus is the truth and this is the echo, which is why
   * every move here is flagged: the `focusin` it causes must not be
   * read back as the assistive technology having moved focus itself.
   */
  private applyFocus(id: string | null): void {
    this.focusedId = id;
    const entry = id === null ? undefined : this.entries.get(id);
    if (this.editing !== null && this.editing.active) {
      // The hidden textarea is where the person is really typing: it is
      // the only element an IME will compose into. Describing it is
      // what makes it the field rather than an anonymous text box, and
      // claiming focus is what moves the caret off whichever mirrored
      // element held it a moment ago.
      this.editing.describe(entry?.record ?? null);
      this.applying = true;
      try {
        this.editing.focus();
      } finally {
        this.applying = false;
      }
      return;
    }
    this.editing?.describe(null);
    this.applying = true;
    try {
      if (entry !== undefined) {
        entry.element.focus({ preventScroll: true });
      } else if (this.container.contains(this.doc.activeElement)) {
        // Focus left the app's tree — or landed on a node with no
        // semantics of its own. Either way the canvas takes it back,
        // so keys keep reaching the app.
        this.canvas.focus({ preventScroll: true });
      }
    } finally {
      this.applying = false;
    }
  }

  private listen(): () => void {
    const onClick = (event: Event): void => {
      const id = this.idOf(event.target);
      if (id !== null) {
        // Nothing on this thread knows whether the node handles a
        // press; the runtime routes it exactly as it routes a mouse's.
        this.sink.action({ id, action: 'click' });
      }
    };
    const onFocusIn = (event: FocusEvent): void => {
      if (this.applying) {
        return;
      }
      const id = this.idOf(event.target);
      if (id !== null && id !== this.focusedId) {
        // The assistive technology moved focus itself. The runtime
        // decides whether the node may have it — an open focus trap
        // refuses — and the answer comes back as the next update.
        this.sink.action({ id, action: 'focus' });
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => this.sink.keyDown?.(event);
    const onKeyUp = (event: KeyboardEvent): void => this.sink.keyUp?.(event);
    const onPaste = (event: ClipboardEvent): void => {
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (text.length === 0) {
        return;
      }
      event.preventDefault();
      this.sink.paste?.(text);
    };
    this.container.addEventListener('click', onClick);
    this.container.addEventListener('focusin', onFocusIn);
    this.container.addEventListener('keydown', onKeyDown);
    this.container.addEventListener('keyup', onKeyUp);
    this.container.addEventListener('paste', onPaste);
    return () => {
      this.container.removeEventListener('click', onClick);
      this.container.removeEventListener('focusin', onFocusIn);
      this.container.removeEventListener('keydown', onKeyDown);
      this.container.removeEventListener('keyup', onKeyUp);
      this.container.removeEventListener('paste', onPaste);
    };
  }

  /**
   * Which record an event landed on.
   *
   * A reverse index rather than an `instanceof HTMLElement` test and a
   * scan: the elements are this class's own, so identity is the whole
   * question, and an event on anything else is not ours.
   */
  private idOf(target: EventTarget | null): string | null {
    return this.ids.get(target as HTMLElement) ?? null;
  }

  // ---------------------------------------------------------------------------
  // Where the canvas is
  // ---------------------------------------------------------------------------

  /**
   * Keeps the container over the canvas.
   *
   * Boxes arrive in canvas pixels, so the container has to sit exactly
   * where the canvas does — and a `position: fixed` box moves relative
   * to the canvas whenever the page scrolls or the window resizes.
   * Reading the rect on those three signals rather than every frame is
   * deliberate: a `getBoundingClientRect()` per frame on the main
   * thread is the kind of forced layout the worker configuration
   * exists to avoid.
   */
  private trackCanvas(): void {
    const sync = (): void => {
      const rect = this.canvas.getBoundingClientRect();
      this.container.style.left = `${rect.left}px`;
      this.container.style.top = `${rect.top}px`;
      this.container.style.width = `${rect.width}px`;
      this.container.style.height = `${rect.height}px`;
    };
    sync();
    const view = this.doc.defaultView;
    if (view === null) {
      return;
    }
    view.addEventListener('resize', sync);
    view.addEventListener('scroll', sync, true);
    this.stopTracking = () => {
      view.removeEventListener('resize', sync);
      view.removeEventListener('scroll', sync, true);
    };
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(sync);
      this.resizeObserver.observe(this.canvas);
    }
  }
}

function setNumber(element: HTMLElement, attribute: string, value: number | undefined): void {
  if (value !== undefined) {
    element.setAttribute(attribute, String(value));
  }
}

/**
 * Writes an element's text without throwing away what is inside it.
 *
 * Assigning `textContent` replaces *every* child node, elements
 * included. That is what is wanted for prose and for a control named by
 * an `aria-label`, both of which are leaves, and it is exactly wrong
 * for a container: a `tablist` full of tabs, a labelled `group`, a
 * `region` holding a page. Describing one of those a second time — a
 * label that changed, a state that came and went — emptied it, and a
 * screen reader was told the container existed and nothing about what
 * was in it.
 *
 * Found on a tabbed page whose tabs were missing from the
 * accessibility tree while drawing correctly on screen, which is the
 * worst way for it to be wrong: no screenshot gate can see it. An
 * element with element children keeps them and takes its name from the
 * `aria-label` that was just written.
 */
function setText(element: HTMLElement, text: string): void {
  if (element.children.length > 0) {
    return;
  }
  if (element.textContent !== text) {
    element.textContent = text;
  }
}
