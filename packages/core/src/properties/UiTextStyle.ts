import type { UiColor } from './UiColor';
import type { UiColorValue, UiFontWeight, UiTextAlign, UiTextDirection } from './UiPropertyValues';
import type { UiNode } from '../graph/UiNode';

/**
 * A coherent typography value.
 *
 * TextStyle is the unit of inheritance: a parent can provide a
 * TextStyle and descendants can override individual fields while
 * keeping the rest.
 *
 * The four fields below `textDirection` are optional because the
 * environment's typography roles were written before they existed and
 * a role that says nothing about them means "normal", which is what
 * their property defaults already say.
 */
export interface UiTextStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: UiFontWeight;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly color: UiColor;
  readonly textAlign: UiTextAlign;
  readonly textDirection: UiTextDirection;
  readonly fontStyle?: UiFontStyle;
  readonly fontStretch?: UiFontStretch;
  readonly fontVariant?: UiFontVariant;
  readonly fontKerning?: UiFontKerning;
  readonly textDecoration?: UiTextDecoration;
}

/** Upright or sloped. `oblique` is a synthesised slant where no italic face exists. */
export type UiFontStyle = 'normal' | 'italic' | 'oblique';

/**
 * The width axis, as CSS names it.
 *
 * A variable font's `wdth` is reached through these keywords and
 * nowhere else: the Canvas2D context takes `fontStretch` as a
 * property, and a font string cannot carry an axis tuple.
 */
export type UiFontStretch =
  | 'ultra-condensed'
  | 'extra-condensed'
  | 'condensed'
  | 'semi-condensed'
  | 'normal'
  | 'semi-expanded'
  | 'expanded'
  | 'extra-expanded'
  | 'ultra-expanded';

/**
 * The one font-variant value the CSS font shorthand carries, and so
 * the one a canvas font string carries. `font-feature-settings` is not
 * part of the shorthand and the context has no property for it, which
 * is why `tnum` and `liga` are not here; `decisions/0085` records the
 * measurement.
 */
export type UiFontVariant = 'normal' | 'small-caps';

/** Whether the shaper applies the font's kerning pairs. */
export type UiFontKerning = 'auto' | 'normal' | 'none';

/** Lines drawn with the text. Both may be asked for at once. */
export type UiTextDecoration = 'none' | 'underline' | 'line-through' | 'underline line-through';

/**
 * The fields of a style that change how wide its text measures.
 *
 * The split matters: only these reach the measure request, so a run
 * that changes colour, background or underline is repainted from the
 * paragraph the cache already holds, and only a run that changes font
 * makes the paragraph new. See `TextMeasurer.ts`.
 */
export interface UiTextMetrics {
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontWeight?: UiFontWeight;
  readonly fontStyle?: UiFontStyle;
  readonly fontStretch?: UiFontStretch;
  readonly fontVariant?: UiFontVariant;
  readonly fontKerning?: UiFontKerning;
  readonly letterSpacing?: number;
}

/**
 * A run that is activated rather than only read.
 *
 * `onClick` runs on a press that neither moved nor selected, and on
 * Enter or Space while the run is focused. `label` names the run in
 * the semantics mirror when the text itself would not ("here" is a
 * link a screen reader cannot use); `href` is carried for the
 * application's own use and the runtime never navigates to it.
 */
export interface UiTextLink {
  readonly onClick?: () => void;
  readonly label?: string;
  readonly href?: string;
}

/**
 * One run of a paragraph, with the style fields it overrides.
 *
 * A `Text` node takes either a `text` string or a `spans` array, and
 * the array is the whole of the paragraph: its texts concatenated in
 * order are the text, so every offset the rest of the runtime
 * works in — a line's `start`, a selection range, a find match, a
 * caret — means the same thing whether the paragraph has runs or not.
 * That is the property the whole feature rests on, and it is why runs
 * are a shape of one paragraph rather than a tree of nodes.
 *
 * Anything a span does not set it inherits from the node, and the
 * node from its environment, exactly as a node inherits today.
 */
export interface UiTextSpan extends UiTextMetrics {
  readonly text: string;
  readonly color?: UiColorValue;
  readonly backgroundColor?: UiColorValue;
  readonly textDecoration?: UiTextDecoration;
  readonly link?: UiTextLink;
}

/** A span placed in the flattened text: the same fields, plus where it is. */
export interface UiResolvedTextSpan extends UiTextMetrics {
  readonly start: number;
  readonly end: number;
  readonly color?: UiColorValue;
  readonly backgroundColor?: UiColorValue;
  readonly textDecoration?: UiTextDecoration;
  readonly link?: UiTextLink;
}

/** A paragraph's text and the runs inside it. */
export interface UiSpannedText {
  readonly text: string;
  readonly spans: readonly UiResolvedTextSpan[];
}

export const defaultTextStyle: UiTextStyle = {
  fontFamily: 'sans-serif',
  fontSize: 14,
  fontWeight: 'normal',
  lineHeight: 16.8,
  letterSpacing: 0,
  color: { r: 0, g: 0, b: 0, a: 1 },
  textAlign: 'start',
  textDirection: 'ltr'
} as const;

const EMPTY_SPANS: readonly UiResolvedTextSpan[] = [];

/**
 * Flattened spans, remembered by the identity of the array they came
 * from.
 *
 * The flattening is a concatenation and an offset per run, which is
 * cheap; doing it on every layout, paint, hit test and semantics pass
 * of every paragraph on screen is not. An application that rebuilds
 * its span array every frame gets the work every frame and is no
 * worse off than it would be without the memo, and one that holds the
 * array still — which is what a bound cell does — pays once.
 */
const flattened = new WeakMap<readonly UiTextSpan[], UiSpannedText>();

/** The text of a span array, with each run's offsets into it. */
export function flattenTextSpans(spans: readonly UiTextSpan[]): UiSpannedText {
  const cached = flattened.get(spans);
  if (cached !== undefined) {
    return cached;
  }
  let text = '';
  const resolved: UiResolvedTextSpan[] = [];
  for (const span of spans) {
    const start = text.length;
    text += span.text;
    if (text.length === start) {
      // An empty run has no offsets to cover and nothing to draw.
      continue;
    }
    resolved.push({
      start,
      end: text.length,
      fontFamily: span.fontFamily,
      fontSize: span.fontSize,
      fontWeight: span.fontWeight,
      fontStyle: span.fontStyle,
      fontStretch: span.fontStretch,
      fontVariant: span.fontVariant,
      fontKerning: span.fontKerning,
      letterSpacing: span.letterSpacing,
      color: span.color,
      backgroundColor: span.backgroundColor,
      textDecoration: span.textDecoration,
      link: span.link
    });
  }
  const result: UiSpannedText = { text, spans: resolved };
  flattened.set(spans, result);
  return result;
}

/**
 * A node's paragraph as text and runs, or undefined when it has no
 * runs.
 *
 * `spans` wins over `text` when both are set, because a node that was
 * given runs meant them; the `text` prop is then ignored rather than
 * appended, so there is exactly one source of offsets.
 */
export function spannedTextOf(node: UiNode): UiSpannedText | undefined {
  const spans = node.properties.get('spans') as readonly UiTextSpan[] | undefined;
  if (spans === undefined || spans.length === 0) {
    return undefined;
  }
  const flat = flattenTextSpans(spans);
  return flat.text.length === 0 ? undefined : flat;
}

/**
 * The text a node draws: its runs' text if it has runs, its `text`
 * property otherwise.
 *
 * Every reader of a node's paragraph goes through this — layout,
 * paint, selection, find and the semantics mirror — so a spanned
 * paragraph is selectable, findable and readable without any of them
 * knowing what a span is.
 */
export function textContentOf(node: UiNode): string {
  const spanned = spannedTextOf(node);
  if (spanned !== undefined) {
    return spanned.text;
  }
  const text = node.properties.get('text');
  return typeof text === 'string' ? text : '';
}

/** The runs of a node's paragraph; empty when it has none. */
export function resolvedSpansOf(node: UiNode): readonly UiResolvedTextSpan[] {
  return spannedTextOf(node)?.spans ?? EMPTY_SPANS;
}

/** The span covering an offset, or undefined where no run does. */
export function spanAtOffset(
  spans: readonly UiResolvedTextSpan[],
  offset: number
): UiResolvedTextSpan | undefined {
  for (const span of spans) {
    if (offset >= span.start && offset < span.end) {
      return span;
    }
  }
  return undefined;
}

/**
 * Compares two span arrays for equality.
 *
 * A link is compared by identity, as every function-valued prop in
 * the registry is: an application that rebuilds its handler each
 * render says the run changed, which costs a paint and no layout,
 * since a handler is not a metric field.
 */
export function textSpansEqual(
  a: readonly UiTextSpan[] | undefined,
  b: readonly UiTextSpan[] | undefined
): boolean {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined || a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (!spansEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

function spansEqual(a: UiTextSpan, b: UiTextSpan): boolean {
  return (
    a.text === b.text &&
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.fontWeight === b.fontWeight &&
    a.fontStyle === b.fontStyle &&
    a.fontStretch === b.fontStretch &&
    a.fontVariant === b.fontVariant &&
    a.fontKerning === b.fontKerning &&
    a.letterSpacing === b.letterSpacing &&
    colorValueEqual(a.color, b.color) &&
    colorValueEqual(a.backgroundColor, b.backgroundColor) &&
    a.textDecoration === b.textDecoration &&
    a.link === b.link
  );
}

function colorValueEqual(a: UiColorValue | undefined, b: UiColorValue | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

/**
 * Compares two text styles for equality.
 */
export function textStylesEqual(a: UiTextStyle, b: UiTextStyle): boolean {
  const epsilon = 0.0001;
  return (
    a.fontFamily === b.fontFamily &&
    Math.abs(a.fontSize - b.fontSize) < epsilon &&
    a.fontWeight === b.fontWeight &&
    Math.abs(a.lineHeight - b.lineHeight) < epsilon &&
    Math.abs(a.letterSpacing - b.letterSpacing) < epsilon &&
    Math.abs(a.color.r - b.color.r) < epsilon &&
    Math.abs(a.color.g - b.color.g) < epsilon &&
    Math.abs(a.color.b - b.color.b) < epsilon &&
    Math.abs(a.color.a - b.color.a) < epsilon &&
    a.textAlign === b.textAlign &&
    a.textDirection === b.textDirection &&
    a.fontStyle === b.fontStyle &&
    a.fontStretch === b.fontStretch &&
    a.fontVariant === b.fontVariant &&
    a.fontKerning === b.fontKerning &&
    a.textDecoration === b.textDecoration
  );
}
