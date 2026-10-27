import { colorToHex, type UiBoxShadow, type UiColor, type UiTheme } from 'gesso-core';

/**
 * A theme, as the design tokens an agent designs with.
 *
 * An agent writing a screen should say `backgroundColor="surface"` and
 * `borderRadius="medium"`, not `#f9fafb` and `8`: the names follow the
 * theme into dark mode, high contrast and a rebrand, and the numbers do
 * not. It can only say the names if it is told what they are, and a
 * theme's palette and scales are values in the running application,
 * which no reading of the source can give. So the page tells it.
 *
 * Colours are hex, because that is what a designer reads and what an
 * agent writes when it has to. The text names the props each group
 * feeds, so the agent learns the spelling along with the values.
 */

/** The theme as plain data: what `tokens_view` returns as structured content. */
export interface ThemeTokens {
  readonly colors: Readonly<Record<string, string>>;
  readonly typography: Readonly<Record<string, TextStyleToken>>;
  readonly spacing: Readonly<Record<string, number>>;
  readonly shapes: Readonly<Record<string, unknown>>;
  readonly shadows: Readonly<Record<string, string>>;
  readonly density: string;
  readonly contrast: string;
  /** Token groups the application or a library added, by the name each was declared with. */
  readonly extensions: Readonly<Record<string, unknown>>;
}

export interface TextStyleToken {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: string | number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
}

export function themeTokens(theme: UiTheme): ThemeTokens {
  const typography: Record<string, TextStyleToken> = {};
  for (const [role, style] of Object.entries(theme.typography)) {
    typography[role] = {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing
    };
  }
  const shadows: Record<string, string> = {};
  for (const [name, layers] of Object.entries(theme.shadows)) {
    shadows[name] = (layers as readonly UiBoxShadow[]).map(formatShadow).join(', ') || 'none';
  }
  const extensions: Record<string, unknown> = {};
  for (const [key, group] of theme.extensions ?? []) {
    extensions[key.description ?? 'extension'] = plain(group);
  }
  return {
    colors: Object.fromEntries(Object.entries(theme.colors).map(([name, color]) => [name, hex(color)])),
    typography,
    spacing: { ...theme.spacing },
    shapes: plain(theme.shapes) as Record<string, unknown>,
    shadows,
    density: theme.density,
    contrast: theme.contrast,
    extensions
  };
}

/** The tokens as text, a few lines per group, for an agent to read. */
export function formatThemeTokens(tokens: ThemeTokens, where: string): string {
  const lines = [
    `The theme in force at ${where}. Write these names rather than their values, so a screen follows the theme ` +
      'into dark mode, high contrast and a rebrand.',
    '',
    'colors: any color prop takes the name (backgroundColor="surface", color="primary").'
  ];
  for (const [name, value] of Object.entries(tokens.colors)) {
    lines.push(`  ${name} ${value}`);
  }
  lines.push('', 'typography: the textStyle prop takes the role (textStyle="title"). family size/line-height weight');
  for (const [role, style] of Object.entries(tokens.typography)) {
    lines.push(`  ${role} ${style.fontFamily} ${style.fontSize}/${style.lineHeight} ${style.fontWeight}`);
  }
  lines.push(
    '',
    'shapes: borderRadius takes the name (borderRadius="medium").',
    `  ${inline(tokens.shapes)}`,
    '',
    'spacing: the scale, in pixels, for gap, padding and margin.',
    `  ${inline(tokens.spacing)}`,
    '',
    'shadows:'
  );
  for (const [name, value] of Object.entries(tokens.shadows)) {
    lines.push(`  ${name} ${value}`);
  }
  lines.push('', `density ${tokens.density}, contrast ${tokens.contrast}`);
  const extensions = Object.entries(tokens.extensions);
  if (extensions.length > 0) {
    lines.push('', 'extensions: token groups the application added.');
    for (const [name, group] of extensions) {
      lines.push(`  ${name} ${JSON.stringify(group)}`);
    }
  }
  return lines.join('\n');
}

function inline(record: Readonly<Record<string, unknown>>): string {
  return Object.entries(record)
    .map(([name, value]) => `${name} ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(', ');
}

function formatShadow(shadow: UiBoxShadow): string {
  const color = typeof shadow.color === 'string' ? shadow.color : hex(shadow.color);
  const parts = [shadow.offsetX, shadow.offsetY, shadow.blurRadius, shadow.spreadRadius].join(' ');
  return `${shadow.inset === true ? 'inset ' : ''}${parts} ${color}`;
}

function isColor(value: unknown): value is UiColor {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const color = value as Partial<UiColor>;
  return (
    Object.keys(value).length === 4 &&
    typeof color.r === 'number' &&
    typeof color.g === 'number' &&
    typeof color.b === 'number' &&
    typeof color.a === 'number'
  );
}

function hex(color: UiColor): string {
  return colorToHex(color);
}

/** A token group as JSON can hold it: colours as hex, and nothing that is not data. */
function plain(value: unknown): unknown {
  if (isColor(value)) {
    return hex(value);
  }
  if (Array.isArray(value)) {
    return value.map(plain);
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry !== 'function') {
        out[key] = plain(entry);
      }
    }
    return out;
  }
  return value;
}
