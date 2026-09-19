import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import type { UiShapes } from '../environment/UiShapes';
import type { UiNode } from '../graph/UiNode';
import { type UiBorderRadius, borderRadius, normalizeBorderRadius } from './UiBorderRadius';
import type { UiBorderRadiusValue } from './UiPropertyValues';

/**
 * The radius a name stands for in the scale the node inherits.
 *
 * Decided against the scale the node actually has, not a written-out
 * list, so a step a custom theme added resolves too — the same rule
 * `themeColorFor` follows for a palette name, and the reason
 * `UiShapeExtensions` is worth declaring.
 */
function themeRadiusFor(node: UiNode, value: string): number | undefined {
  const theme =
    node.environment !== null ? node.environment.get(UiEnvironmentKeys.theme) : UiEnvironmentKeys.theme.defaultValue;
  const shapes = theme.shapes as unknown as Readonly<Record<string, number | undefined>>;
  return Object.prototype.hasOwnProperty.call(shapes, value) ? shapes[value as keyof UiShapes] : undefined;
}

/**
 * Resolves a border radius value to a `UiBorderRadius`.
 *
 * A scale name (`'medium'`) is looked up in the theme the node
 * inherits, so the same tree repaints at the right radii when the
 * theme provider above it changes; anything else goes through
 * `normalizeBorderRadius`, which is where numbers and per-corner
 * objects already went.
 *
 * This is the colour rule applied to the one other property that can
 * afford it. `borderRadius` affects paint and nothing else, so the
 * lookup happens exactly where `backgroundColor`'s does and costs what
 * that costs: a node that names a number never reaches the string
 * branch at all. `decisions/0079` ruled out by-name lengths because a
 * length is read in the layout pass — a radius is not, which is why
 * this one is free and `padding` is a separate question.
 *
 * A name the scale does not carry resolves to no radius, and the
 * element draws square. That is the quiet failure `resolveColorValue`
 * already chose for a colour name nothing matches: a misspelling is a
 * compile error when the name was declared, and a theme that simply
 * lacks the step should not take the frame down.
 */
export function resolveBorderRadiusValue(node: UiNode, value: UiBorderRadiusValue | undefined): UiBorderRadius {
  if (typeof value === 'string') {
    const named = themeRadiusFor(node, value);
    return named === undefined ? normalizeBorderRadius(undefined) : borderRadius(Math.max(0, named));
  }
  return normalizeBorderRadius(value);
}

/** A step of the shape scale the node inherits, for defaults that follow the theme. */
export function themeRadius(node: UiNode, name: string): number | undefined {
  return themeRadiusFor(node, name);
}
