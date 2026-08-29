import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import type { UiNode } from '../graph/UiNode';
import { type UiColor, normalizeColor } from './UiColor';
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
  const value = resolveProperty(node, definition);
  if (typeof value === 'string') {
    const themed = themeColorFor(node, value);
    if (themed !== undefined) {
      return themed;
    }
  }
  return normalizeColor(value);
}

/** A palette entry of the theme the node inherits, for defaults that follow the theme. */
export function themeColor(node: UiNode, name: UiThemeColorName): UiColor | undefined {
  return themeColorFor(node, name);
}

export { colorValuesEqual } from './UiColor';
