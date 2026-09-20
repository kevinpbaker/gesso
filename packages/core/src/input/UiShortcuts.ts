import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { isNodeInert } from './UiInteraction';
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
   * The keys, as `'Mod+K'`, `'Shift+?'`, or `'g d'` for a chord: a
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
    const binding: UiShortcutBinding = { ...shortcut, steps, display: formatShortcut(steps) };
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

  /** Forgets a half-typed chord, for a route change or a lost focus. */
  reset(): void {
    this.pending = [];
  }

  /**
   * Whether a binding would fire for a key going to `focused`.
   *
   * Three things take a shortcut out: its scope does not contain the
   * focused node, its own `when` says no, and, for a shortcut with no
   * modifier at all, the focused node is somewhere text is being
   * typed. The last is the rule that keeps a single-letter shortcut
   * from making a text field unusable.
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
 */
function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Whether the presses so far could still complete this shortcut. */
function matchesPrefix(steps: readonly UiShortcutStep[], sequence: readonly UiShortcutStep[]): boolean {
  if (sequence.length > steps.length) {
    return false;
  }
  return sequence.every((step, index) => sameStep(steps[index], step));
}

function sameStep(want: UiShortcutStep, got: UiShortcutStep): boolean {
  if (want.key !== got.key || want.shift !== got.shift || want.alt !== got.alt) {
    return false;
  }
  if (want.mod) {
    return got.ctrl || got.meta;
  }
  return want.ctrl === got.ctrl && want.meta === got.meta;
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
 * The shortcut as a palette should print it.
 *
 * `Mod` is printed as `Ctrl`, not as a platform glyph: the render
 * worker cannot see the platform, and a wrong symbol is worse than a
 * plain word. An application that knows what it is running on can
 * format the `steps` itself.
 */
export function formatShortcut(steps: readonly UiShortcutStep[]): string {
  return steps.map(formatStep).join(' ');
}

function formatStep(step: UiShortcutStep): string {
  const parts: string[] = [];
  if (step.mod || step.ctrl) {
    parts.push('Ctrl');
  }
  if (step.meta) {
    parts.push('Meta');
  }
  if (step.alt) {
    parts.push('Alt');
  }
  if (step.shift) {
    parts.push('Shift');
  }
  parts.push(step.key.length === 1 ? step.key.toUpperCase() : step.key);
  return parts.join('+');
}

function defaultClock(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
