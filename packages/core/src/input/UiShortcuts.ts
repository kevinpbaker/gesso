import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { commandForKey, detectEditingPlatform, type EditingPlatform } from '../editing/EditingKeymap';
import { isNodeInert, isPressable } from './UiInteraction';
import type { UiKeyModifiers } from './UiInputEvent';

/**
 * One press in a shortcut, after parsing.
 *
 * `mod` is deliberately not `ctrl` or `meta`. The framework runs in a
 * worker and has no reliable answer to which platform it is on, and the
 * answer would be wrong for a person on a Mac keyboard plugged into a
 * Linux machine anyway. So `Mod` matches **either** Control or Command,
 * and an application that wants the distinction spells out the one it
 * means. This is the same choice the DOM's own `metaKey`/`ctrlKey` pair
 * forces on every web application, made once here instead of in every
 * handler.
 */
export interface UiShortcutStep {
  readonly key: string;
  readonly mod: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

/** What an application registers. */
export interface UiShortcut {
  /**
   * The keys, as `'Mod+K'`, `'?'`, or `'g d'` for a chord: a
   * sequence of presses, separated by spaces, that must arrive in
   * order and within the chord timeout.
   */
  readonly keys: string;
  /** What a palette lists it as. */
  readonly label: string;
  readonly run: () => void;
  /**
   * The subtree this shortcut belongs to, or null for the whole
   * application.
   *
   * A scoped shortcut is live only while focus is inside the node,
   * which is what makes "Delete removes the selected row" safe to
   * register: the table registers it, and it stops existing the moment
   * the person tabs into the search field.
   */
  readonly scope?: UiNode | null;
  /**
   * Higher wins when two live shortcuts want the same keys. Default 0.
   *
   * A scope is not a priority. Two shortcuts scoped to nested nodes are
   * separated by depth without either naming a number; this is for the
   * case where a route wants to take a key the application had.
   */
  readonly priority?: number;
  /** A last check before it runs, for a command that is not always available. */
  readonly when?: () => boolean;
  /** A heading a palette groups it under. */
  readonly group?: string;
}

/** A registered shortcut, with what the registry worked out about it. */
export interface UiShortcutBinding extends UiShortcut {
  /** The parsed presses, so a palette can render them without reparsing. */
  readonly steps: readonly UiShortcutStep[];
  /** `keys` written the way it should be shown. */
  readonly display: string;
}

export interface ShortcutRegistryOptions {
  /**
   * How long the rest of a chord has to arrive, in milliseconds.
   *
   * Long enough to type a second key deliberately, short enough that a
   * `g` pressed into a page and then forgotten does not swallow a key
   * a minute later.
   */
  chordTimeout?: number;
  /** The clock, for specs that drive a chord without waiting. */
  now?: () => number;
}

/** The keys that never resolve a shortcut on their own. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

/**
 * Every shortcut the application has, and which of them are live.
 *
 * Segue and Sluice each put one `onKeyDown` on the root and switch on
 * the current route, which has the three problems that shape this. A
 * screen cannot add a key without editing a file it does not own; two
 * screens that want the same key have no way to say which wins; and
 * nothing can list what is available, so neither application has a
 * palette or a help sheet and neither could grow one.
 *
 * A registry answers all three. A component registers what it can do
 * and gets a function back that unregisters it, so the shortcut's
 * lifetime is the component's. A shortcut names the subtree it belongs
 * to, so it is live exactly while focus is inside it. And `active`
 * returns what would run right now, which is what a palette lists and
 * what a help sheet prints.
 *
 * ## What it is not
 *
 * It does not listen to anything. The registry is fed by the
 * `shortcuts` modifier, which puts one root listener on the node it is
 * attached to and hands each key here; a runtime that wants shortcuts
 * without modifiers can call `handleKey` from its own listener. Keeping
 * the listening out means the registry is a plain object a spec can
 * drive directly, and means it does not need the dispatcher, the focus
 * manager, or anything else a `gesso-framework` service would have had
 * to inject.
 *
 * ## Typing is not a shortcut
 *
 * A shortcut with no modifier is skipped while a text field has focus.
 * Without that rule an application with a `n` for "new note" becomes an
 * application you cannot type the letter n into, which is the failure
 * every home-grown key handler eventually ships.
 *
 * ## Pressing is not a shortcut
 *
 * A bare Enter or Space is skipped while a button or link has focus,
 * unless the shortcut is that control's own: the control is focused, so
 * it has the key first, as it would in a browser.
 */
export class UiShortcutRegistry {
  private readonly bindings: UiShortcutBinding[] = [];
  private readonly chordTimeout: number;
  private readonly now: () => number;

  /** The presses of a chord matched so far, and when the last arrived. */
  private pending: UiShortcutStep[] = [];
  private pendingAt = 0;

  constructor(options: ShortcutRegistryOptions = {}) {
    this.chordTimeout = options.chordTimeout ?? 1200;
    this.now = options.now ?? defaultClock;
  }

  /** Adds a shortcut. The returned function removes it again. */
  register(shortcut: UiShortcut): () => void {
    const steps = parseShortcut(shortcut.keys);
    this.platform ??= detectEditingPlatform();
    const binding: UiShortcutBinding = { ...shortcut, steps, display: formatShortcut(steps, this.platform) };
    this.bindings.push(binding);
    return () => {
      const index = this.bindings.indexOf(binding);
      if (index !== -1) {
        this.bindings.splice(index, 1);
      }
    };
  }

  /** Every registered shortcut, live or not, in registration order. */
  get all(): readonly UiShortcutBinding[] {
    return this.bindings;
  }

  /**
   * What would run right now, in the order the registry would try them.
   *
   * This is the palette's list, and it is the same computation the key
   * handler makes, so a palette cannot show a command that would not
   * fire and cannot hide one that would.
   *
   * `focused` is the node keyboard input is currently going to, which
   * for a dispatched KeyDown is the event's target: the keyboard
   * controller routes a key to the focused node and to the root when
   * nothing is focused, so the target is the answer without the
   * registry having to hold a focus manager.
   */
  active(focused: UiNode | null): readonly UiShortcutBinding[] {
    const live = this.bindings.filter(binding => this.isLive(binding, focused));
    // A stable sort, so registration order breaks a tie between two
    // shortcuts of equal priority and depth.
    return live
      .map((binding, index) => ({ binding, index }))
      .sort((a, b) => rank(b.binding, focused) - rank(a.binding, focused) || a.index - b.index)
      .map(entry => entry.binding);
  }

  /**
   * Offers a key press to the live shortcuts.
   *
   * True when one of them took it, which the caller turns into a
   * `preventDefault()` so the keyboard controller's own defaults (Tab
   * navigation, Enter on a button, an editable's typing) do not also
   * act on a key that has already been spent.
   */
  handleKey(key: string, modifiers: UiKeyModifiers, focused: UiNode | null): boolean {
    if (MODIFIER_KEYS.has(key)) {
      return false;
    }
    if (focused !== null && isTypingInto(focused) && this.isEditingKey(key, modifiers)) {
      // The field's: undo, redo, select all, moving and deleting by
      // word or line. In a browser a text field owns these whatever the
      // page binds, and an application-wide Mod+Z that undid the app's
      // last change instead of the typing was the bug that showed it.
      this.pending = [];
      return false;
    }
    const step = stepFor(key, modifiers);
    const at = this.now();
    if (this.pending.length > 0 && at - this.pendingAt > this.chordTimeout) {
      this.pending = [];
    }
    const sequence = [...this.pending, step];

    let prefixed = false;
    for (const binding of this.active(focused)) {
      if (!matchesPrefix(binding.steps, sequence)) {
        continue;
      }
      if (binding.steps.length === sequence.length) {
        this.pending = [];
        binding.run();
        return true;
      }
      prefixed = true;
    }
    if (prefixed) {
      // The first key of a chord: held so the next press can complete
      // it, and reported as taken so nothing else acts on a `g` that
      // was the beginning of a command.
      this.pending = sequence;
      this.pendingAt = at;
      return true;
    }
    this.pending = [];
    return false;
  }

  private platform: EditingPlatform | null = null;

  /** Whether a field would take this key as an edit of its own, rather than as text or as Enter. */
  private isEditingKey(key: string, modifiers: UiKeyModifiers): boolean {
    this.platform ??= detectEditingPlatform();
    const command = commandForKey(key, modifiers, this.platform, false);
    return command !== null && command.kind !== 'newline' && command.kind !== 'insert';
  }

  /** Forgets a half-typed chord, for a route change or a lost focus. */
  reset(): void {
    this.pending = [];
  }

  /**
   * Whether a binding would fire for a key going to `focused`.
   *
   * Four things take a shortcut out: its scope does not contain the
   * focused node, its own `when` says no, for a shortcut with no
   * modifier at all the focused node is somewhere text is being typed,
   * and for a bare Enter or Space the focused node is a button that
   * isn't the shortcut's own. The third keeps a single-letter shortcut
   * from making a text field unusable; the fourth keeps a list's Enter
   * from opening a row when the button focused inside it was pressed.
   */
  private isLive(binding: UiShortcutBinding, focused: UiNode | null): boolean {
    const scope = binding.scope ?? null;
    if (scope !== null && (focused === null || !containsNode(scope, focused))) {
      return false;
    }
    if (binding.when !== undefined && !binding.when()) {
      return false;
    }
    if (focused !== null && isTypingInto(focused) && binding.steps.every(step => isBare(step))) {
      return false;
    }
    if (focused !== null && scope !== focused && isPressing(binding.steps) && isPressable(focused)) {
      return false;
    }
    return true;
  }
}

/**
 * Where a binding sits in the order, most specific first.
 *
 * Priority dominates, and depth of scope separates the rest: a
 * shortcut scoped to a row beats one scoped to the table it is in,
 * which beats one scoped to nothing, without either of them naming a
 * number.
 */
function rank(binding: UiShortcutBinding, focused: UiNode | null): number {
  const priority = (binding.priority ?? 0) * 1000;
  const scope = binding.scope ?? null;
  if (scope === null || focused === null) {
    return priority;
  }
  let depth = 0;
  for (let node: UiNode | null = scope; node !== null; node = node.parent) {
    depth += 1;
  }
  return priority + depth;
}

/** Whether `ancestor` is `node` or one of its ancestors. */
function containsNode(ancestor: UiNode, node: UiNode): boolean {
  for (let current: UiNode | null = node; current !== null; current = current.parent) {
    if (current === ancestor) {
      return true;
    }
  }
  return false;
}

/**
 * Whether keys reaching this node are being typed into something.
 *
 * An editable node, or anything inside one: the caret may be on a text
 * node inside a field rather than on the field itself.
 */
function isTypingInto(node: UiNode): boolean {
  for (let current: UiNode | null = node; current !== null; current = current.parent) {
    if (current.type === UiNodeType.EditableText && !isNodeInert(current)) {
      return true;
    }
  }
  return false;
}

/** A bare Enter or Space on its own: what presses a focused button. */
function isPressing(steps: readonly UiShortcutStep[]): boolean {
  const [step] = steps;
  return (
    steps.length === 1 &&
    step !== undefined &&
    isBare(step) &&
    !step.shift &&
    (step.key === 'Enter' || step.key === ' ')
  );
}

/** A press with no modifier at all: an ordinary character. */
function isBare(step: UiShortcutStep): boolean {
  return !step.mod && !step.ctrl && !step.meta && !step.alt;
}

/**
 * Reads `'Mod+Shift+K'` or `'g d'` into presses.
 *
 * Space separates the presses of a chord and `+` separates the
 * modifiers of one press, so `'Mod++'` is Mod and the plus key: the
 * last segment is always the key, however it is spelled.
 */
export function parseShortcut(keys: string): readonly UiShortcutStep[] {
  return keys
    .trim()
    .split(/\s+/)
    .filter(part => part.length > 0)
    .map(parseStep);
}

function parseStep(text: string): UiShortcutStep {
  const parts = text.split('+');
  // A trailing '+' means the plus key itself, which split leaves as an
  // empty last segment with the real key one before it.
  if (parts.length > 1 && parts[parts.length - 1] === '') {
    parts.splice(parts.length - 2, 2, '+');
  }
  const key = parts.pop() ?? '';
  let mod = false;
  let ctrl = false;
  let meta = false;
  let shift = false;
  let alt = false;
  for (const part of parts) {
    switch (part.toLowerCase()) {
      case 'mod':
      case 'cmdorctrl':
        mod = true;
        break;
      case 'ctrl':
      case 'control':
        ctrl = true;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
        meta = true;
        break;
      case 'shift':
        shift = true;
        break;
      case 'alt':
      case 'option':
        alt = true;
        break;
      default:
        // An unknown word is a typo in a shortcut, and a shortcut that
        // silently never fires is worse than one that complains.
        console.warn(`Unknown shortcut modifier '${part}' in '${text}'.`);
    }
  }
  return { key: normalizeKey(key), mod, ctrl, meta, shift, alt };
}

/**
 * A key as the platform adapter reports it, case-folded for letters.
 *
 * `'Mod+K'` and `'Mod+k'` are the same shortcut, and the browser
 * reports whichever the shift state produced. Anything longer than one
 * character is a named key (`'Enter'`, `'ArrowUp'`) and keeps its case.
 *
 * The space bar is the exception that has to be spelled out. The
 * platform reports it as `' '`, which a shortcut string cannot contain
 * because space separates the steps of a chord, so the name `Space`
 * stands for it. Before this, `'Space'` was kept as the literal name and
 * never matched a press: the board's keyboard drag in the issue tracker
 * was the first thing to need it.
 */
function normalizeKey(key: string): string {
  const named = NAMED_KEYS[key.toLowerCase()];
  if (named !== undefined) {
    return named;
  }
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Key names a shortcut string uses for keys it cannot spell. */
const NAMED_KEYS: Readonly<Record<string, string>> = {
  space: ' ',
  spacebar: ' '
};

/** Whether the presses so far could still complete this shortcut. */
function matchesPrefix(steps: readonly UiShortcutStep[], sequence: readonly UiShortcutStep[]): boolean {
  if (sequence.length > steps.length) {
    return false;
  }
  return sequence.every((step, index) => sameStep(steps[index], step));
}

function sameStep(want: UiShortcutStep, got: UiShortcutStep): boolean {
  if (want.key !== got.key) {
    return false;
  }
  if (isSymbol(want.key)) {
    // A character, not a key: `?` is Shift+/ on a US keyboard, Shift+ß
    // on a German one and Shift+, on a French one, and AltGr on others.
    // The character the press produced is the whole answer, so Shift is
    // not asked about, and a bare symbol also takes AltGr (Control and
    // Alt together, or Option on a Mac) as the way this layout types it.
    if (isBare(want) && got.alt && !got.meta) {
      return true;
    }
  } else if (want.shift !== got.shift) {
    return false;
  }
  if (want.alt !== got.alt) {
    return false;
  }
  if (want.mod) {
    return got.ctrl || got.meta;
  }
  return want.ctrl === got.ctrl && want.meta === got.meta;
}

/**
 * Whether a key is a character that isn't a letter: punctuation, a digit
 * or a symbol, which different layouts put under different keys and
 * reach with or without Shift. A letter keeps its Shift, which is what
 * tells `Shift+L` from `l`.
 */
function isSymbol(key: string): boolean {
  return key.length === 1 && key !== ' ' && key.toLowerCase() === key.toUpperCase();
}

/** The press the person actually made. */
function stepFor(key: string, modifiers: UiKeyModifiers): UiShortcutStep {
  return {
    key: normalizeKey(key),
    mod: false,
    ctrl: modifiers.ctrl,
    meta: modifiers.meta,
    shift: modifiers.shift,
    alt: modifiers.alt
  };
}

/**
 * The shortcut as a palette should print it, the way the platform
 * writes its own: `⇧⌘K` on a Mac, where `Mod` is Command, and
 * `Ctrl+Shift+K` elsewhere, where it is Control. The platform is the
 * one the editing keys follow (`detectEditingPlatform`, from the user
 * agent, which a worker can read too).
 */
export function formatShortcut(
  steps: readonly UiShortcutStep[],
  platform: EditingPlatform = detectEditingPlatform()
): string {
  return shortcutKeyCaps(steps, platform)
    .map(caps => caps.join(platform === 'mac' ? '' : '+'))
    .join(' ');
}

/**
 * The keys of each press, one string per key, for a help sheet that
 * draws them as key caps: `[['⇧', '⌘', 'K']]` on a Mac and
 * `[['Ctrl', 'Shift', 'K']]` elsewhere, and a chord is one array per
 * press. They are the pieces `formatShortcut` joins, so a sheet and a
 * palette print the same keys.
 */
export function shortcutKeyCaps(
  steps: readonly UiShortcutStep[],
  platform: EditingPlatform = detectEditingPlatform()
): readonly (readonly string[])[] {
  return steps.map(step => [...modifierNames(step, platform, MAC_CAPS, OTHER_CAPS), keyName(step.key)]);
}

/**
 * The shortcut as a screen reader should say it: `Command Shift K` on a
 * Mac and `Control Shift K` elsewhere, `Down arrow`, `Question mark`,
 * and `g then d` for a chord.
 *
 * A key cap's `⌘` or `↓` is read out inconsistently or not at all, and
 * punctuation is skipped at a screen reader's default verbosity, so a
 * row that shows caps takes this as its name.
 */
export function describeShortcut(
  steps: readonly UiShortcutStep[],
  platform: EditingPlatform = detectEditingPlatform()
): string {
  return steps
    .map(step => {
      const modifiers = modifierNames(step, platform, MAC_WORDS, OTHER_WORDS);
      return [...modifiers, spokenKey(step.key, modifiers.length > 0)].join(' ');
    })
    .join(' then ');
}

type ModifierNames = Readonly<Record<'ctrl' | 'alt' | 'shift' | 'meta', string>>;

/** In the order the Mac's menus print them: Control, Option, Shift, Command. */
const MAC_CAPS: ModifierNames = { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' };
const MAC_WORDS: ModifierNames = { ctrl: 'Control', alt: 'Option', shift: 'Shift', meta: 'Command' };
const OTHER_CAPS: ModifierNames = { ctrl: 'Ctrl', meta: 'Meta', alt: 'Alt', shift: 'Shift' };
const OTHER_WORDS: ModifierNames = { ctrl: 'Control', meta: 'Meta', alt: 'Alt', shift: 'Shift' };

/**
 * A press's modifiers, in the platform's order: Control, Option, Shift,
 * Command on a Mac, where `Mod` is Command; Control, Meta, Alt, Shift
 * elsewhere, where it is Control.
 */
function modifierNames(
  step: UiShortcutStep,
  platform: EditingPlatform,
  mac: ModifierNames,
  other: ModifierNames
): string[] {
  const names: string[] = [];
  if (platform === 'mac') {
    if (step.ctrl) names.push(mac.ctrl);
    if (step.alt) names.push(mac.alt);
    if (step.shift) names.push(mac.shift);
    if (step.mod || step.meta) names.push(mac.meta);
  } else {
    if (step.mod || step.ctrl) names.push(other.ctrl);
    if (step.meta) names.push(other.meta);
    if (step.alt) names.push(other.alt);
    if (step.shift) names.push(other.shift);
  }
  return names;
}

/** The arrows as arrows, which every keyboard prints them as. */
const KEY_NAMES: Readonly<Record<string, string>> = {
  ' ': 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→'
};

function keyName(key: string): string {
  return KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

/** What a screen reader should say for a key it would read as a symbol, or skip. */
const SPOKEN_KEYS: Readonly<Record<string, string>> = {
  ' ': 'Space',
  ArrowUp: 'Up arrow',
  ArrowDown: 'Down arrow',
  ArrowLeft: 'Left arrow',
  ArrowRight: 'Right arrow',
  PageUp: 'Page up',
  PageDown: 'Page down',
  '?': 'Question mark',
  '/': 'Slash',
  '\\': 'Backslash',
  '.': 'Period',
  ',': 'Comma',
  ';': 'Semicolon',
  ':': 'Colon',
  "'": 'Apostrophe',
  '`': 'Backtick',
  '[': 'Left bracket',
  ']': 'Right bracket',
  '-': 'Minus',
  '=': 'Equals',
  '+': 'Plus'
};

/** A letter as typed when it's pressed alone (`j`), and as its cap after a modifier (`Command K`). */
function spokenKey(key: string, modified: boolean): string {
  return SPOKEN_KEYS[key] ?? (key.length === 1 && !modified ? key : keyName(key));
}

function defaultClock(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
