import type { UiNode } from '../graph/UiNode';
import { createEnvironmentKey } from './UiEnvironmentKey';

/**
 * How much larger than written the text in a subtree is drawn: the
 * browser's default text size over 16, which the runtime writes on the
 * root, so a person who has asked their browser for larger text gets
 * it. 1 everywhere a subtree provides `textScale={1}`, which is how
 * text that has to fit a fixed shape keeps its size.
 *
 * A module of its own, re-exported as `UiEnvironmentKeys.textScale`,
 * because font resolution reads it and `UiEnvironmentKeys` cannot be
 * imported from there without a cycle through the property registry.
 */
export const textScaleKey = createEnvironmentKey<number>({
  name: 'textScale',
  defaultValue: 1
});

/**
 * How much larger than written a node's text is drawn. Font size, line
 * height and letter spacing all take it, in layout and in paint alike,
 * because both resolve a node's font and its runs through the two
 * functions that call this.
 */
export function textScaleOf(node: UiNode): number {
  return node.environment?.get(textScaleKey) ?? 1;
}
