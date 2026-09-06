import { isUiModifier, type UiModifier } from './UiModifier';

/**
 * A set of modifiers named once and attached as one.
 *
 * The analogue of a SwiftUI `ViewModifier` or a Compose `Modifier`
 * chain, and the answer to the seventy-two `modifiers={[INTERACTION,
 * ...RING]}` sites across the two applications. Behaviour, not paint:
 * a bundle carries modifiers, and the properties an element is drawn
 * with stay on the element.
 *
 *   const ROW = bundle(ROW_INTERACTION, RING);
 *   <row modifiers={ROW}>…</row>
 *
 * There are two reasons to name it rather than to write the array out.
 * The first is the ordinary one: the set has a meaning, and the
 * meaning is worth a name. The second is that the array literal is not
 * free. A `modifiers` list is read on every render of the element's
 * component, and `[INTERACTION, ...RING]` allocates a fresh array and
 * copies the ring into it each time; a bundle is built once at module
 * level and is the same frozen array on every render, which is what
 * `sameArgs` and the reconciler are comparing against.
 *
 * Nesting is flattened, so a bundle composes with another bundle the
 * way a `Modifier` chain composes: `bundle(BASE, focusRing())` and
 * `bundle(BASE, OTHER_BUNDLE)` both give one flat list. Order is kept,
 * because the override cascade resolves a conflict in favour of
 * whichever modifier is later.
 */
export type UiModifierBundle = readonly UiModifier[];

/**
 * Names a set of modifiers. Call it at module level, once.
 *
 * The result is frozen: a bundle is a value, and a list that some
 * caller pushed onto would change what every element carrying it does,
 * on the next render and not on this one, which is the kind of bug
 * that takes an afternoon.
 */
export function bundle(...parts: readonly (UiModifier | UiModifierBundle)[]): UiModifierBundle {
  const flat: UiModifier[] = [];
  for (const part of parts) {
    if (isUiModifier(part)) {
      flat.push(part);
      continue;
    }
    for (const nested of part) {
      flat.push(nested);
    }
  }
  return Object.freeze(flat);
}

/** An empty bundle, for a branch that adds nothing. One shared value. */
export const noModifiers: UiModifierBundle = Object.freeze([]) as UiModifierBundle;
