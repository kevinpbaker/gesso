import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import type { UiNode } from '../graph/UiNode';
import { type UiColor, normalizeColor } from './UiColor';
import type { ResolvedGradient, ResolvedGradientStop, UiGradient } from './UiGradient';
import { validateGradient } from './UiGradient';
import type { UiPropertyDefinition } from './UiPropertyDefinition';
import { resolveProperty } from './UiPropertyResolver';
import type { UiColorValue, UiThemeColorName } from './UiPropertyValues';

/**
 * Whether a color value names an entry of the theme palette rather
 * than a literal color. Decided against the palette the node actually
 * inherits, so a custom theme with extra names works too.
 */
function themeColorFor(node: UiNode, value: string): UiColor | undefined {
  const theme =
    node.environment !== null ? node.environment.get(UiEnvironmentKeys.theme) : UiEnvironmentKeys.theme.defaultValue;
  const colors = theme.colors as unknown as Readonly<Record<string, UiColor | undefined>>;
  return Object.prototype.hasOwnProperty.call(colors, value) ? colors[value as UiThemeColorName] : undefined;
}

/**
 * Resolves a color property to a `UiColor`.
 *
 * A palette name (`'primary'`) is looked up in the theme the node
 * inherits, so the same tree repaints in the right colors when the
 * theme provider above it changes. Anything else goes through
 * `normalizeColor`: `UiColor` objects, hex and named CSS colors.
 */
export function resolveColor<T extends UiColorValue | undefined>(
  node: UiNode,
  definition: UiPropertyDefinition<T>
): UiColor | undefined {
  return resolveColorValue(node, resolveProperty(node, definition));
}

/**
 * The same resolution for a colour that did not come from a property.
 *
 * A decoration shape carries its colour inline rather than through the
 * registry, and must still honour a palette name — otherwise a focus
 * ring would be the one thing in the library that names a literal
 * colour.
 */
export function resolveColorValue(node: UiNode, value: UiColorValue | undefined): UiColor | undefined {
  if (typeof value === 'string') {
    const themed = themeColorFor(node, value);
    if (themed !== undefined) {
      return themed;
    }
  }
  return normalizeColor(value);
}

/**
 * Resolves a gradient property value against the node's theme.
 *
 * Every stop goes through `resolveColorValue`, so `{ color: 'primary' }`
 * in a gradient means what `backgroundColor: 'primary'` means and a
 * themed gradient repaints with the theme above it. Lives here rather
 * than in `UiGradient.ts` because the registry imports that file, and
 * the theme lookup reads properties: see the note there.
 *
 * Throws on a malformed gradient, naming what is wrong. A value that
 * arrived through a binding skipped the builder's check, and a
 * background that silently does not paint is worse than a frame that
 * says why. Returns undefined when there is no gradient, or when a stop
 * names a colour nothing can resolve.
 */
export function resolveGradient(node: UiNode, value: UiGradient | undefined): ResolvedGradient | undefined {
  if (value === undefined) {
    return undefined;
  }
  const message = validateGradient(value);
  if (message !== undefined) {
    throw new Error(message);
  }
  const stops: ResolvedGradientStop[] = [];
  for (const stop of value.stops) {
    const color = resolveColorValue(node, stop.color);
    if (color === undefined) {
      return undefined;
    }
    stops.push({ offset: stop.offset, color });
  }
  if (value.kind === 'linear') {
    return { kind: 'linear', angle: value.angle, stops };
  }
  return { kind: 'radial', centerX: value.centerX, centerY: value.centerY, radius: value.radius, stops };
}

/** A palette entry of the theme the node inherits, for defaults that follow the theme. */
export function themeColor(node: UiNode, name: UiThemeColorName): UiColor | undefined {
  return themeColorFor(node, name);
}

export { colorValuesEqual } from './UiColor';
