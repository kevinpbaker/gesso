import { DirtyFlags } from '../graph/DirtyFlags';
import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import { defineProperty } from './UiPropertyDefinition';
import type { UiEnvironmentKey } from '../environment/UiEnvironmentKey';
import type { UiColor } from './UiColor';
import { UiColors, colorsEqual, normalizeColor } from './UiColor';
import type { UiBorderRadius } from './UiBorderRadius';
import { UiBorderRadiuses, borderRadiusEqual, normalizeBorderRadius } from './UiBorderRadius';
import type { UiBoxShadow } from './UiBoxShadow';
import { boxShadowArraysEqual } from './UiBoxShadow';
import type { UiTransform } from './UiTransform';
import { transformsEqual } from './UiTransform';
import type { UiTextStyle } from './UiTextStyle';
import { defaultTextStyle } from './UiTextStyle';
import type { UiVisualStateSet } from './UiVisualState';
import { defaultVisualState, visualStatesEqual } from './UiVisualState';

const L = DirtyFlags.Layout;
const P = DirtyFlags.Paint;
const C = DirtyFlags.Content;
const T = DirtyFlags.Transform;
const E = DirtyFlags.Environment;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const UiProperties = {
  width: defineProperty<number | undefined>({
    name: 'width',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  height: defineProperty<number | undefined>({
    name: 'height',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  minWidth: defineProperty<number | undefined>({
    name: 'minWidth',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  maxWidth: defineProperty<number | undefined>({
    name: 'maxWidth',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  minHeight: defineProperty<number | undefined>({
    name: 'minHeight',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  maxHeight: defineProperty<number | undefined>({
    name: 'maxHeight',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  padding: defineProperty<number | undefined>({
    name: 'padding',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  paddingTop: defineProperty<number | undefined>({
    name: 'paddingTop',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  paddingRight: defineProperty<number | undefined>({
    name: 'paddingRight',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  paddingBottom: defineProperty<number | undefined>({
    name: 'paddingBottom',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  paddingLeft: defineProperty<number | undefined>({
    name: 'paddingLeft',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  margin: defineProperty<number | undefined>({
    name: 'margin',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  marginTop: defineProperty<number | undefined>({
    name: 'marginTop',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  marginRight: defineProperty<number | undefined>({
    name: 'marginRight',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  marginBottom: defineProperty<number | undefined>({
    name: 'marginBottom',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  marginLeft: defineProperty<number | undefined>({
    name: 'marginLeft',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  gap: defineProperty<number | undefined>({
    name: 'gap',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  flexGrow: defineProperty<number | undefined>({
    name: 'flexGrow',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  flexShrink: defineProperty<number | undefined>({
    name: 'flexShrink',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  flexBasis: defineProperty<number | undefined>({
    name: 'flexBasis',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * Alignment of children along the x-axis.
   *
   * For a row this is the main axis; for a column this is the cross
   * axis. The value is axis-relative and does not flip meaning when
   * the flex direction changes.
   */
  x: defineProperty<string | undefined>({
    name: 'x',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * Alignment of children along the y-axis.
   *
   * For a column this is the main axis; for a row this is the cross
   * axis. The value is axis-relative and does not flip meaning when
   * the flex direction changes.
   */
  y: defineProperty<string | undefined>({
    name: 'y',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * Per-child override for x-axis alignment.
   */
  selfX: defineProperty<string | undefined>({
    name: 'selfX',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * Per-child override for y-axis alignment.
   */
  selfY: defineProperty<string | undefined>({
    name: 'selfY',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  position: defineProperty<string | undefined>({
    name: 'position',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  /**
   * Layout direction for flex and scroll containers.
   */
  direction: defineProperty<string | undefined>({
    name: 'direction',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  inset: defineProperty<number | undefined>({
    name: 'inset',
    defaultValue: undefined,
    inherited: false,
    affects: L
  }),

  // -------------------------------------------------------------------------
  // Paint
  // -------------------------------------------------------------------------

  backgroundColor: defineProperty<UiColor | string | undefined>({
    name: 'backgroundColor',
    defaultValue: undefined,
    inherited: false,
    affects: P,
    compare: (a, b) => {
      const normalizedA = normalizeColor(a);
      const normalizedB = normalizeColor(b);
      if (normalizedA === undefined && normalizedB === undefined) return true;
      if (normalizedA === undefined || normalizedB === undefined) return false;
      return colorsEqual(normalizedA, normalizedB);
    }
  }),

  color: defineProperty<UiColor | string>({
    name: 'color',
    defaultValue: UiColors.black,
    inherited: true,
    affects: P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => {
      const textStyle = value as UiTextStyle;
      return textStyle.color;
    },
    compare: (a, b) => {
      const normalizedA = normalizeColor(a) ?? UiColors.black;
      const normalizedB = normalizeColor(b) ?? UiColors.black;
      return colorsEqual(normalizedA, normalizedB);
    }
  }),

  borderColor: defineProperty<UiColor | string | undefined>({
    name: 'borderColor',
    defaultValue: undefined,
    inherited: false,
    affects: P,
    compare: (a, b) => {
      const normalizedA = normalizeColor(a);
      const normalizedB = normalizeColor(b);
      if (normalizedA === undefined && normalizedB === undefined) return true;
      if (normalizedA === undefined || normalizedB === undefined) return false;
      return colorsEqual(normalizedA, normalizedB);
    }
  }),

  borderWidth: defineProperty<number | undefined>({
    name: 'borderWidth',
    defaultValue: undefined,
    inherited: false,
    affects: P
  }),

  borderRadius: defineProperty<UiBorderRadius | number>({
    name: 'borderRadius',
    defaultValue: UiBorderRadiuses.none,
    inherited: false,
    affects: P,
    compare: (a, b) => borderRadiusEqual(normalizeBorderRadius(a), normalizeBorderRadius(b))
  }),

  opacity: defineProperty<number>({
    name: 'opacity',
    defaultValue: 1,
    inherited: false,
    affects: P
  }),

  boxShadows: defineProperty<readonly UiBoxShadow[]>({
    name: 'boxShadows',
    defaultValue: [],
    inherited: false,
    affects: P,
    compare: boxShadowArraysEqual
  }),

  visible: defineProperty<boolean>({
    name: 'visible',
    defaultValue: true,
    inherited: false,
    affects: P
  }),

  // -------------------------------------------------------------------------
  // Typography
  // -------------------------------------------------------------------------

  fontFamily: defineProperty<string>({
    name: 'fontFamily',
    defaultValue: defaultTextStyle.fontFamily,
    inherited: true,
    affects: L | P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).fontFamily
  }),

  fontSize: defineProperty<number>({
    name: 'fontSize',
    defaultValue: defaultTextStyle.fontSize,
    inherited: true,
    affects: L | P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).fontSize
  }),

  fontWeight: defineProperty<number | string>({
    name: 'fontWeight',
    defaultValue: defaultTextStyle.fontWeight,
    inherited: true,
    affects: L | P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).fontWeight
  }),

  lineHeight: defineProperty<number>({
    name: 'lineHeight',
    defaultValue: defaultTextStyle.lineHeight,
    inherited: true,
    affects: L | P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).lineHeight
  }),

  letterSpacing: defineProperty<number>({
    name: 'letterSpacing',
    defaultValue: defaultTextStyle.letterSpacing,
    inherited: true,
    affects: L | P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).letterSpacing
  }),

  textAlign: defineProperty<'left' | 'center' | 'right'>({
    name: 'textAlign',
    defaultValue: defaultTextStyle.textAlign,
    inherited: true,
    affects: P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).textAlign
  }),

  textDirection: defineProperty<'ltr' | 'rtl'>({
    name: 'textDirection',
    defaultValue: defaultTextStyle.textDirection,
    inherited: true,
    affects: P,
    environmentKey: UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>,
    resolveFromEnvironment: (value: unknown) => (value as UiTextStyle).textDirection
  }),

  verticalAlign: defineProperty<string | undefined>({
    name: 'verticalAlign',
    defaultValue: undefined,
    inherited: false,
    affects: P
  }),

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  cursor: defineProperty<string | undefined>({
    name: 'cursor',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  pointerEvents: defineProperty<string | undefined>({
    name: 'pointerEvents',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  focusable: defineProperty<boolean | undefined>({
    name: 'focusable',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  disabled: defineProperty<boolean | undefined>({
    name: 'disabled',
    defaultValue: undefined,
    inherited: false,
    affects: DirtyFlags.Properties
  }),

  // -------------------------------------------------------------------------
  // Transform
  // -------------------------------------------------------------------------

  transform: defineProperty<UiTransform | undefined>({
    name: 'transform',
    defaultValue: undefined,
    inherited: false,
    affects: P | T,
    compare: (a, b) => {
      if (a === undefined && b === undefined) return true;
      if (a === undefined || b === undefined) return false;
      return transformsEqual(a, b);
    }
  }),

  // -------------------------------------------------------------------------
  // Content
  // -------------------------------------------------------------------------

  text: defineProperty<string | undefined>({
    name: 'text',
    defaultValue: undefined,
    inherited: false,
    affects: C | L
  }),

  image: defineProperty<unknown | undefined>({
    name: 'image',
    defaultValue: undefined,
    inherited: false,
    affects: P
  }),

  objectFit: defineProperty<string | undefined>({
    name: 'objectFit',
    defaultValue: undefined,
    inherited: false,
    affects: P
  }),

  scrollX: defineProperty<number | undefined>({
    name: 'scrollX',
    defaultValue: undefined,
    inherited: false,
    affects: T
  }),

  scrollY: defineProperty<number | undefined>({
    name: 'scrollY',
    defaultValue: undefined,
    inherited: false,
    affects: T
  }),

  // -------------------------------------------------------------------------
  // Environment provider properties
  // -------------------------------------------------------------------------

  theme: defineProperty<unknown | undefined>({
    name: 'theme',
    defaultValue: undefined,
    inherited: false,
    affects: E
  }),

  textStyle: defineProperty<unknown | undefined>({
    name: 'textStyle',
    defaultValue: undefined,
    inherited: false,
    affects: E
  }),

  contentColor: defineProperty<unknown | undefined>({
    name: 'contentColor',
    defaultValue: undefined,
    inherited: false,
    affects: E
  }),

  // -------------------------------------------------------------------------
  // Visual state
  // -------------------------------------------------------------------------

  visualState: defineProperty<UiVisualStateSet>({
    name: 'visualState',
    defaultValue: defaultVisualState,
    inherited: false,
    affects: P,
    compare: visualStatesEqual
  })
} as const;

export type UiPropertyName = keyof typeof UiProperties;
