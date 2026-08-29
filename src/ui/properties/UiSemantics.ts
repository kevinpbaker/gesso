/**
 * What a node means, as opposed to what it looks like.
 *
 * A canvas has no DOM, so nothing about a Nodal tree is visible to a
 * screen reader unless the tree says what it is. These properties are
 * that statement: they are read by the semantics phase, diffed per
 * frame, and (roadmap F6b) mirrored into an off-screen DOM the
 * platform's assistive technology can see.
 *
 * The vocabulary is ARIA's, because ARIA is what the mirror will emit
 * and what every accessibility API on the three target webviews
 * understands. Borrowing the names means the translation is a rename,
 * not a mapping table.
 */

/**
 * What a node is. Closed, so a typo is a build error the way an
 * unknown prop already is: the mirror can only emit roles it knows.
 */
export type UiRole =
  // Controls
  | 'button'
  | 'checkbox'
  | 'switch'
  | 'radio'
  | 'radiogroup'
  | 'slider'
  | 'spinbutton'
  | 'textbox'
  | 'searchbox'
  | 'combobox'
  | 'listbox'
  | 'option'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'menuitemcheckbox'
  | 'menuitemradio'
  | 'tab'
  | 'tablist'
  | 'tabpanel'
  | 'link'
  | 'progressbar'
  // Structure
  | 'list'
  | 'listitem'
  | 'tree'
  | 'treeitem'
  | 'grid'
  | 'row'
  | 'columnheader'
  | 'rowheader'
  | 'cell'
  | 'group'
  | 'separator'
  | 'toolbar'
  | 'heading'
  | 'image'
  | 'paragraph'
  // Windows and live regions
  | 'dialog'
  | 'alertdialog'
  | 'tooltip'
  | 'alert'
  | 'status'
  // Landmarks
  | 'banner'
  | 'navigation'
  | 'main'
  | 'region'
  | 'form'
  | 'search'
  | 'contentinfo';

export const UI_ROLES: readonly UiRole[] = [
  'button',
  'checkbox',
  'switch',
  'radio',
  'radiogroup',
  'slider',
  'spinbutton',
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'option',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'tablist',
  'tabpanel',
  'link',
  'progressbar',
  'list',
  'listitem',
  'tree',
  'treeitem',
  'grid',
  'row',
  'columnheader',
  'rowheader',
  'cell',
  'group',
  'separator',
  'toolbar',
  'heading',
  'image',
  'paragraph',
  'dialog',
  'alertdialog',
  'tooltip',
  'alert',
  'status',
  'banner',
  'navigation',
  'main',
  'region',
  'form',
  'search',
  'contentinfo'
];

const roleSet: ReadonlySet<string> = new Set<string>(UI_ROLES);

export function isUiRole(value: unknown): value is UiRole {
  return typeof value === 'string' && roleSet.has(value);
}

/**
 * A control's condition, beyond its role and value.
 *
 * `disabled` is deliberately absent: `disabled` is already a property,
 * it is inherited by a whole subtree through `isNodeInert`, and having
 * two ways to say it would let them disagree. The semantics record
 * derives it.
 */
export type UiSemanticState =
  | 'checked'
  | 'mixed'
  | 'expanded'
  | 'collapsed'
  | 'selected'
  | 'pressed'
  | 'busy'
  | 'invalid'
  | 'required'
  | 'readonly'
  | 'modal';

export const UI_SEMANTIC_STATES: readonly UiSemanticState[] = [
  'checked',
  'mixed',
  'expanded',
  'collapsed',
  'selected',
  'pressed',
  'busy',
  'invalid',
  'required',
  'readonly',
  'modal'
];

const stateSet: ReadonlySet<string> = new Set<string>(UI_SEMANTIC_STATES);

export function isUiSemanticState(value: unknown): value is UiSemanticState {
  return typeof value === 'string' && stateSet.has(value);
}

/**
 * The states a node declares, as an array so authoring is
 * `states: ['checked']` rather than a Set literal. Order does not
 * matter; the semantics record normalises it.
 */
export type UiSemanticStates = readonly UiSemanticState[];

/** Sorted and de-duplicated, so two orders of the same states diff equal. */
export function normalizeStates(states: UiSemanticStates): UiSemanticState[] {
  return [...new Set(states)].sort();
}

export function statesEqual(a: UiSemanticStates | undefined, b: UiSemanticStates | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  if (a.length !== b.length) {
    return false;
  }
  const left = normalizeStates(a);
  const right = normalizeStates(b);
  return left.every((state, index) => state === right[index]);
}

/**
 * Validates a `role` prop, returning the message for the error the
 * builder throws, or undefined when the value is fine.
 */
export function validateRole(value: unknown): string | undefined {
  if (value === undefined || isUiRole(value)) {
    return undefined;
  }
  const suggestion = closest(String(value), UI_ROLES);
  return (
    `Unknown role '${String(value)}'.` +
    (suggestion !== undefined ? ` Did you mean '${suggestion}'?` : '') +
    ` Roles are the ARIA names listed in UI_ROLES.`
  );
}

/** Validates a `states` prop the same way. */
export function validateStates(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return `States must be an array of state names, got ${typeof value}.`;
  }
  for (const state of value) {
    if (!isUiSemanticState(state)) {
      const suggestion = closest(String(state), UI_SEMANTIC_STATES);
      return (
        `Unknown state '${String(state)}'.` +
        (suggestion !== undefined ? ` Did you mean '${suggestion}'?` : '') +
        ` States are the names listed in UI_SEMANTIC_STATES.`
      );
    }
  }
  return undefined;
}

/**
 * The nearest candidate within a third of the name's length, the same
 * rule `closestPropertyName` uses for a misspelled prop.
 */
function closest(value: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  const target = value.toLowerCase();
  for (const candidate of candidates) {
    const distance = editDistance(target, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best !== undefined && bestDistance <= Math.max(1, Math.floor(value.length / 3)) ? best : undefined;
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = previous[j];
      previous[j] = next;
    }
  }
  return previous[b.length];
}
