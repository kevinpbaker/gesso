import type { UiNode } from '../graph/UiNode';
import { UiProperties } from './UiProperty';
import { resolveProperty } from './UiPropertyResolver';
import type { UiFontWeight } from './UiPropertyValues';

/**
 * `line-height: normal`: the factor of the font size a line takes when
 * no line height is set. Shared by ParagraphLayout and PaintState.
 */
export const DEFAULT_LINE_HEIGHT_FACTOR = 1.2;

/** The font a text node is measured and painted with. */
export interface UiResolvedFont {
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly fontWeight: UiFontWeight;
  readonly lineHeight: number;
  readonly letterSpacing: number;
}

/**
 * Resolves a node's font the one way layout and paint both use.
 *
 * Font size, family, weight and letter spacing inherit through the
 * environment's text style. Line height is the subtle one: a text
 * style carries a line height that belongs with its font size, so a
 * node that inherits the style takes it whole. A node that sets its
 * own `fontSize` without a `lineHeight` gets a normal line height for
 * that size, `fontSize × 1.2`, rather than the inherited pixel value
 * sized for a different font — the inherited 16.8px of the default
 * style is right for 14px text and wrong for 22px. An explicit
 * `lineHeight` always wins.
 *
 * Before this, layout read the raw props (unset line height → ×1.2)
 * and paint read the inherited ones (→ 16.8px), so any text whose size
 * differed from the style's was measured in one line box and drawn in
 * another, and sat high or low inside it.
 */
export function resolveFont(node: UiNode): UiResolvedFont {
  const fontSize = positive(resolveProperty(node, UiProperties.fontSize)) ?? UiProperties.fontSize.defaultValue;
  const ownFontSize = node.properties.get('fontSize');
  const ownLineHeight = positive(node.properties.get('lineHeight'));
  let lineHeight: number;
  if (ownLineHeight !== undefined) {
    lineHeight = ownLineHeight;
  } else if (ownFontSize !== undefined) {
    lineHeight = fontSize * DEFAULT_LINE_HEIGHT_FACTOR;
  } else {
    lineHeight = positive(resolveProperty(node, UiProperties.lineHeight)) ?? fontSize * DEFAULT_LINE_HEIGHT_FACTOR;
  }
  return {
    fontSize,
    fontFamily: nonEmpty(resolveProperty(node, UiProperties.fontFamily)) ?? UiProperties.fontFamily.defaultValue,
    fontWeight: weight(resolveProperty(node, UiProperties.fontWeight)) ?? UiProperties.fontWeight.defaultValue,
    lineHeight,
    letterSpacing: finite(resolveProperty(node, UiProperties.letterSpacing)) ?? 0
  };
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function weight(value: unknown): UiFontWeight | undefined {
  return typeof value === 'number' ? finite(value) : (nonEmpty(value) as UiFontWeight | undefined);
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
