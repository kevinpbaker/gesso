import { combineLatest, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import type { ComponentContext, Inputs } from '../../framework/FunctionComponent';
import { state } from '../../framework/State';
import { AppearanceChannel, type AppearanceCommands } from './theme/ThemeContract';
import type { UiChild } from '../../ui/composition';
import type { UiColors } from '../../ui/environment/UiColors';
import type { UiShadows } from '../../ui/environment/UiShadows';
import type { UiShapes } from '../../ui/environment/UiShapes';
import type { UiTheme } from '../../ui/environment/UiTheme';
import type { UiTypography } from '../../ui/environment/UiTypography';
import { boxShadow, type UiBoxShadow } from '../../ui/properties/UiBoxShadow';
import { colorToHex, parseColor, type UiColor } from '../../ui/properties/UiColor';
import type { UiTextStyle } from '../../ui/properties/UiTextStyle';

/**
 * Theming: a settings pane wired to the app it restyles.
 *
 * A theme in Nodal is one value in the environment. A node provides
 * it, every descendant resolves against it, and nothing in between
 * has to pass it along. This example puts that on screen: the four
 * controls on the left build a `UiTheme`, the root provides it, and
 * the page on the right repaints — colors, corner radii and the type
 * scale all at once — without a single node being rebuilt. The
 * timestamp at the bottom of the preview is written when the tree is
 * built, so if it never changes, nothing was rebuilt.
 *
 * Three things worth reading for:
 *
 *   - Colors are written as palette *names* (`backgroundColor="surface"`,
 *     `color="onPrimary"`), resolved at paint time against whichever
 *     theme the node inherits. Nothing below the root mentions a hex
 *     value.
 *   - The environment is scoped, not global. Each palette chip in the
 *     picker provides its own theme to its own preview, so four themes
 *     are painted side by side; the two cards at the bottom of the
 *     preview are the same component under two providers.
 *   - Typography arrives the same way, through the `textStyle` key, so
 *     text that sets neither size nor color still follows the theme.
 *
 * Palettes may carry names beyond the standard eight — this one adds
 * `surfaceAlt`, `onPrimary`, `accentSoft`, `positive` and `negative` —
 * because a name is looked up on whatever palette the node inherits.
 */

// ---------------------------------------------------------------------------
// The four choices, and the theme they build
// ---------------------------------------------------------------------------

export type PaletteName = 'daylight' | 'sepia' | 'midnight' | 'contrast';
export type AccentName = 'blue' | 'violet' | 'emerald' | 'amber' | 'rose';
export type CornerName = 'sharp' | 'soft' | 'round';
export type TextSizeName = 'small' | 'regular' | 'large';

export interface ThemeSpec {
  readonly palette: PaletteName;
  readonly accent: AccentName;
  readonly corners: CornerName;
  readonly textSize: TextSizeName;
}

/** The standard palette plus the names this example needs. */
interface ExampleColors extends UiColors {
  /** A second surface, for tiles and wells that sit on `surface`. */
  readonly surfaceAlt: UiColor;
  /** Text and icons drawn on top of `primary`. */
  readonly onPrimary: UiColor;
  /** The accent at low alpha, for tinted backgrounds. */
  readonly accentSoft: UiColor;
  readonly positive: UiColor;
  readonly negative: UiColor;
}

interface PaletteSpec {
  readonly label: string;
  readonly dark: boolean;
  readonly background: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly text: string;
  readonly textMuted: string;
  readonly border: string;
  readonly positive: string;
  readonly negative: string;
  readonly shadowAlpha: number;
}

const PALETTES: Record<PaletteName, PaletteSpec> = {
  daylight: {
    label: 'Daylight',
    dark: false,
    background: '#f5f7fa',
    surface: '#ffffff',
    surfaceAlt: '#eef1f6',
    text: '#101828',
    textMuted: '#667085',
    border: '#e1e6ee',
    positive: '#0f8a5f',
    negative: '#c8372d',
    shadowAlpha: 0.16
  },
  sepia: {
    label: 'Sepia',
    dark: false,
    background: '#f3ece1',
    surface: '#fbf6ee',
    surfaceAlt: '#eae0cf',
    text: '#3b3027',
    textMuted: '#7d6d5c',
    border: '#e0d3c0',
    positive: '#5b7a34',
    negative: '#a8442a',
    shadowAlpha: 0.18
  },
  midnight: {
    label: 'Midnight',
    dark: true,
    background: '#0b1220',
    surface: '#121a2b',
    surfaceAlt: '#1b2540',
    text: '#e6edf3',
    textMuted: '#8b98a9',
    border: '#22304a',
    positive: '#3fbf94',
    negative: '#e5695f',
    shadowAlpha: 0.55
  },
  contrast: {
    label: 'Contrast',
    dark: true,
    background: '#000000',
    surface: '#0d0d0d',
    surfaceAlt: '#1c1c1c',
    text: '#ffffff',
    textMuted: '#c9c9c9',
    border: '#6f6f6f',
    positive: '#4ade80',
    negative: '#ff6b6b',
    shadowAlpha: 0.7
  }
};

const ACCENTS: Record<AccentName, { readonly label: string; readonly color: string; readonly onPrimary: string }> = {
  blue: { label: 'Blue', color: '#2f6fed', onPrimary: '#ffffff' },
  violet: { label: 'Violet', color: '#7c5cf0', onPrimary: '#ffffff' },
  emerald: { label: 'Emerald', color: '#11a37f', onPrimary: '#ffffff' },
  amber: { label: 'Amber', color: '#e0900c', onPrimary: '#231800' },
  rose: { label: 'Rose', color: '#e0447a', onPrimary: '#ffffff' }
};

/** How far the shape scale is dialled: square, the usual radii, or twice them. */
const CORNERS: Record<CornerName, { readonly label: string; readonly factor: number }> = {
  sharp: { label: 'Sharp', factor: 0 },
  soft: { label: 'Soft', factor: 1 },
  round: { label: 'Round', factor: 2 }
};

const TEXT_SIZES: Record<TextSizeName, { readonly label: string; readonly scale: number }> = {
  small: { label: 'Small', scale: 0.88 },
  regular: { label: 'Regular', scale: 1 },
  large: { label: 'Large', scale: 1.15 }
};

export const PALETTE_ORDER: readonly PaletteName[] = ['daylight', 'sepia', 'midnight', 'contrast'];
export const ACCENT_ORDER: readonly AccentName[] = ['blue', 'violet', 'emerald', 'amber', 'rose'];

function hex(value: string): UiColor {
  const color = parseColor(value);
  if (color === undefined) {
    throw new Error(`'${value}' is not a color.`);
  }
  return color;
}

function withAlpha(color: UiColor, a: number): UiColor {
  return { r: color.r, g: color.g, b: color.b, a };
}

/** `amount` of `b` mixed into `a`, per channel. */
function mix(a: UiColor, b: UiColor, amount: number): UiColor {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
    a: a.a
  };
}

const BASE_SHAPES: UiShapes = {
  none: 0,
  extraSmall: 2,
  small: 6,
  medium: 10,
  large: 16,
  extraLarge: 24,
  // Pills and circles stay pills and circles at every setting; the
  // scale below is about how square the boxes are, not about shape.
  full: 9999
};

function shapesFor(corners: CornerName): UiShapes {
  const { factor } = CORNERS[corners];
  return {
    none: 0,
    extraSmall: BASE_SHAPES.extraSmall * factor,
    small: BASE_SHAPES.small * factor,
    medium: BASE_SHAPES.medium * factor,
    large: BASE_SHAPES.large * factor,
    extraLarge: BASE_SHAPES.extraLarge * factor,
    full: BASE_SHAPES.full
  };
}

interface TypeStep {
  readonly size: number;
  readonly weight: UiTextStyle['fontWeight'];
  readonly tracking: number;
  readonly muted: boolean;
}

const TYPE_SCALE: Record<keyof UiTypography, TypeStep> = {
  headline: { size: 22, weight: 700, tracking: -0.2, muted: false },
  title: { size: 17, weight: 600, tracking: 0, muted: false },
  bodyLarge: { size: 15, weight: 'normal', tracking: 0, muted: false },
  body: { size: 14, weight: 'normal', tracking: 0, muted: false },
  bodySmall: { size: 12.5, weight: 'normal', tracking: 0, muted: true },
  label: { size: 11, weight: 600, tracking: 0.7, muted: true }
};

function typographyFor(colors: ExampleColors, textSize: TextSizeName): UiTypography {
  const { scale } = TEXT_SIZES[textSize];
  const style = (step: TypeStep): UiTextStyle => {
    const fontSize = Math.round(step.size * scale * 10) / 10;
    return {
      fontFamily: 'system-ui, sans-serif',
      fontSize,
      fontWeight: step.weight,
      lineHeight: Math.round(fontSize * 1.4 * 10) / 10,
      letterSpacing: step.tracking,
      // The scale carries its colors, so text that sets no color at all
      // still changes with the palette.
      color: step.muted ? colors.textMuted : colors.text,
      textAlign: 'left',
      textDirection: 'ltr'
    };
  };
  return {
    headline: style(TYPE_SCALE.headline),
    title: style(TYPE_SCALE.title),
    bodyLarge: style(TYPE_SCALE.bodyLarge),
    body: style(TYPE_SCALE.body),
    bodySmall: style(TYPE_SCALE.bodySmall),
    label: style(TYPE_SCALE.label)
  };
}

function shadowsFor(shadow: UiColor): UiShadows {
  const at = (alpha: number): UiColor => withAlpha(shadow, shadow.a * alpha);
  return {
    none: [],
    extraSmall: [boxShadow(0, 1, 2, 0, at(0.4))],
    small: [boxShadow(0, 2, 4, -1, at(0.5))],
    medium: [boxShadow(0, 6, 12, -3, at(0.6)), boxShadow(0, 2, 4, -2, at(0.4))],
    large: [boxShadow(0, 14, 28, -6, at(0.7)), boxShadow(0, 4, 8, -4, at(0.4))],
    extraLarge: [boxShadow(0, 24, 48, -12, at(0.8))]
  };
}

/** The whole theme, from the four choices. Pure, so it is easy to test. */
export function buildTheme(spec: ThemeSpec): UiTheme {
  const palette = PALETTES[spec.palette];
  const accent = ACCENTS[spec.accent];
  const primary = hex(accent.color);
  const text = hex(palette.text);
  const colors: ExampleColors = {
    background: hex(palette.background),
    surface: hex(palette.surface),
    surfaceAlt: hex(palette.surfaceAlt),
    primary,
    secondary: mix(primary, text, 0.3),
    onPrimary: hex(accent.onPrimary),
    accentSoft: withAlpha(primary, palette.dark ? 0.24 : 0.14),
    text,
    textMuted: hex(palette.textMuted),
    border: hex(palette.border),
    positive: hex(palette.positive),
    negative: hex(palette.negative),
    shadow: withAlpha(hex('#000000'), palette.shadowAlpha),
    // The control tokens the component library reads, derived from the
    // same four choices, so a checkbox in this preview follows the
    // palette without naming a colour of its own.
    controlBackground: hex(palette.surface),
    controlBackgroundHovered: mix(hex(palette.surface), text, palette.dark ? 0.12 : 0.06),
    controlBackgroundPressed: mix(hex(palette.surface), text, palette.dark ? 0.2 : 0.12),
    controlBorder: hex(palette.border),
    controlBorderFocused: primary,
    controlForeground: text,
    controlForegroundDisabled: hex(palette.textMuted),
    controlAccent: primary,
    danger: hex(palette.negative),
    focusRing: primary,
    // A chosen row: the accent behind it, and text that stays legible
    // on top of it whichever way the palette leans.
    selectionBackground: mix(hex(palette.surface), primary, palette.dark ? 0.32 : 0.2),
    selectionForeground: text
  };
  return {
    colors,
    typography: typographyFor(colors, spec.textSize),
    shapes: shapesFor(spec.corners),
    shadows: shadowsFor(colors.shadow)
  };
}

/** Whether a palette is a dark one, for the light/dark counterpart. */
export function isDark(palette: PaletteName): boolean {
  return PALETTES[palette].dark;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface AppearanceView extends ThemeSpec {
  readonly dark: boolean;
}

export function specOf(view: AppearanceView): ThemeSpec {
  return { palette: view.palette, accent: view.accent, corners: view.corners, textSize: view.textSize };
}

/**
 * The appearance application: four choices and four ways to change
 * them.
 *
 * It publishes the *choices*, not the theme. `UiTheme` is a plain
 * object and would cross happily, but it is derived from these four
 * strings by a pure function, and rebuilding it on the render side
 * costs one call where sending it costs a diff of every colour,
 * radius, shadow and font size on every change. Only what cannot be
 * recomputed should travel.
 */
export class AppearanceApp {
  readonly palette = state<PaletteName>('daylight');
  readonly accent = state<AccentName>('blue');
  readonly corners = state<CornerName>('soft');
  readonly textSize = state<TextSizeName>('regular');

  readonly view: Observable<AppearanceView> = combineLatest([
    this.palette,
    this.accent,
    this.corners,
    this.textSize
  ]).pipe(
    map(([palette, accent, corners, textSize]) => ({ palette, accent, corners, textSize, dark: isDark(palette) }))
  );

  setPalette(palette: PaletteName): void {
    this.palette.value = palette;
  }

  setAccent(accent: AccentName): void {
    this.accent.value = accent;
  }

  setCorners(corners: CornerName): void {
    this.corners.value = corners;
  }

  setTextSize(textSize: TextSizeName): void {
    this.textSize.value = textSize;
  }
}

// ---------------------------------------------------------------------------
// What a component reads off the theme
//
// Colors resolve by name through the environment and need nothing from
// here. Radii, shadows and font sizes are plain numbers a component has
// to be given, so they come from the store's theme projection.
// ---------------------------------------------------------------------------

interface Appearance {
  /** The four choices, as they crossed the barrier. */
  readonly view: Observable<AppearanceView>;
  /** The commands that change them. */
  readonly send: AppearanceCommands;
  readonly theme: Observable<UiTheme>;
  readonly text: (name: keyof UiTypography) => Observable<UiTextStyle>;
  readonly size: (name: keyof UiTypography) => Observable<number>;
  readonly radius: (name: keyof UiShapes) => Observable<number>;
  readonly shadow: (name: keyof UiShadows) => Observable<readonly UiBoxShadow[]>;
}

function appearance(ctx: ComponentContext): Appearance {
  const channel = ctx.channel(AppearanceChannel);
  const view = channel.view.view;
  // Built here, from the four choices that crossed. `buildTheme` is
  // pure, so this is cheaper than shipping the result.
  const theme = view.pipe(map(choices => buildTheme(specOf(choices))));
  return {
    view,
    send: channel.send,
    theme,
    text: name => theme.pipe(map(value => value.typography[name])),
    size: name => theme.pipe(map(value => value.typography[name].fontSize)),
    radius: name => theme.pipe(map(value => value.shapes[name])),
    shadow: name => theme.pipe(map(value => value.shadows[name]))
  };
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

interface Option {
  readonly value: string;
  readonly label: string;
}

function SegmentButton(
  props: Inputs<{ label: string; selected: boolean; onPress: () => void }>,
  ctx: ComponentContext
) {
  const { radius } = appearance(ctx);
  const hovered = state(false);
  const background = combineLatest([props.selected, hovered]).pipe(
    map(([selected, hover]) => (selected ? 'primary' : hover ? 'surfaceAlt' : 'transparent'))
  );
  return (
    <button
      onClick={() => props.onPress.value()}
      onPointerEnter={() => (hovered.value = true)}
      onPointerLeave={() => (hovered.value = false)}
      flexGrow={1}
      height={34}
      x="center"
      y="center"
      borderRadius={radius('small')}
      borderWidth={1}
      borderColor={props.selected.pipe(map(selected => (selected ? 'primary' : 'border')))}
      backgroundColor={background}
      cursor="pointer">
      <text
        color={props.selected.pipe(map(selected => (selected ? 'onPrimary' : 'text')))}
        fontSize={12.5}
        fontWeight={600}>
        {props.label}
      </text>
    </button>
  );
}

/** One row of mutually exclusive choices. */
function Segmented(props: Inputs<{ options: readonly Option[]; selected: string; onSelect: (value: string) => void }>) {
  return (
    <row gap={6} selfX="stretch">
      {props.options.value.map(option => (
        <SegmentButton
          key={option.value}
          label={option.label}
          selected={props.selected.pipe(map(value => value === option.value))}
          onPress={() => props.onSelect.value(option.value)}
        />
      ))}
    </row>
  );
}

/**
 * A palette in the picker, drawn in its own colors.
 *
 * The chip builds the theme that choosing it would produce and
 * provides it to the miniature below — so the swatch is not a picture
 * of the palette, it is the palette, painted by the same resolution
 * path as the page.
 */
function PaletteChip(props: Inputs<{ name: PaletteName }>, ctx: ComponentContext) {
  const { view, send, radius } = appearance(ctx);
  const preview = combineLatest([props.name, view]).pipe(
    map(([name, current]) => buildTheme({ ...specOf(current), palette: name }))
  );
  const selected = combineLatest([props.name, view]).pipe(map(([name, current]) => name === current.palette));
  return (
    <column
      onClick={() => send.setPalette(props.name.value)}
      flexGrow={1}
      gap={8}
      padding={8}
      borderWidth={1}
      borderColor={selected.pipe(map(on => (on ? 'primary' : 'border')))}
      backgroundColor={selected.pipe(map(on => (on ? 'accentSoft' : 'transparent')))}
      borderRadius={radius('medium')}
      cursor="pointer">
      <column
        theme={preview}
        height={52}
        padding={8}
        gap={6}
        backgroundColor="background"
        borderRadius={radius('small')}>
        <row gap={6} y="center">
          <box width={12} height={12} borderRadius={6} backgroundColor="primary" />
          <box height={7} flexGrow={1} borderRadius={3} backgroundColor="surface" />
        </row>
        <box height={7} width={44} borderRadius={3} backgroundColor="surfaceAlt" />
        <box height={7} width={30} borderRadius={3} backgroundColor="surfaceAlt" />
      </column>
      <text color={selected.pipe(map(on => (on ? 'primary' : 'textMuted')))} fontSize={12} fontWeight={600}>
        {props.name.pipe(map(name => PALETTES[name].label))}
      </text>
    </column>
  );
}

function AccentSwatch(props: Inputs<{ name: AccentName }>, ctx: ComponentContext) {
  const { view, send } = appearance(ctx);
  const selected = view.pipe(map(choices => choices.accent === props.name.value));
  return (
    <box
      onClick={() => send.setAccent(props.name.value)}
      width={36}
      height={36}
      x="center"
      y="center"
      borderRadius={18}
      borderWidth={selected.pipe(map(on => (on ? 2 : 1)))}
      borderColor={selected.pipe(map(on => (on ? 'text' : 'border')))}
      cursor="pointer">
      <box
        width={22}
        height={22}
        borderRadius={11}
        backgroundColor={props.name.pipe(map(name => ACCENTS[name].color))}
      />
    </box>
  );
}

function SettingsPanel(_props: Inputs<{}>, ctx: ComponentContext) {
  const { view, send, theme, text, radius } = appearance(ctx);
  const label = text('label');

  const section = (title: string, body: UiChild): UiChild => (
    <column gap={10} selfX="stretch">
      <text textStyle={label}>{title}</text>
      {body}
    </column>
  );

  const cornerOptions = Object.entries(CORNERS).map(([value, corner]) => ({ value, label: corner.label }));
  const textOptions = Object.entries(TEXT_SIZES).map(([value, size]) => ({ value, label: size.label }));
  const resolved = theme.pipe(
    map(
      current =>
        `primary ${colorToHex(current.colors.primary)} · radius ${current.shapes.medium}px · body ${current.typography.body.fontSize}px`
    )
  );

  return (
    <scrollview width={320} padding={24} gap={24} backgroundColor="surface" borderColor="border" borderWidth={1}>
      <column gap={6}>
        <text textStyle={text('headline')}>Appearance</text>
        <text textStyle={text('bodySmall')}>
          Four choices build one theme. The root provides it; everything to the right resolves against it.
        </text>
      </column>

      {section(
        'PALETTE',
        <column gap={10}>
          <row gap={10}>
            {PALETTE_ORDER.slice(0, 2).map(name => (
              <PaletteChip key={name} name={name} />
            ))}
          </row>
          <row gap={10}>
            {PALETTE_ORDER.slice(2).map(name => (
              <PaletteChip key={name} name={name} />
            ))}
          </row>
        </column>
      )}

      {section(
        'ACCENT',
        <row gap={10}>
          {ACCENT_ORDER.map(name => (
            <AccentSwatch key={name} name={name} />
          ))}
        </row>
      )}

      {section(
        'CORNERS',
        <Segmented
          options={cornerOptions}
          selected={view.pipe(map(current => current.corners))}
          onSelect={value => send.setCorners(value as CornerName)}
        />
      )}

      {section(
        'TEXT SIZE',
        <Segmented
          options={textOptions}
          selected={view.pipe(map(current => current.textSize))}
          onSelect={value => send.setTextSize(value as TextSizeName)}
        />
      )}

      <column gap={6} padding={12} backgroundColor="surfaceAlt" borderRadius={radius('medium')} selfX="stretch">
        <text textStyle={label}>RESOLVED</text>
        <text textStyle={text('bodySmall')}>{resolved}</text>
      </column>
    </scrollview>
  );
}

// ---------------------------------------------------------------------------
// Preview: an ordinary screen, written only in palette names
// ---------------------------------------------------------------------------

function Pill(props: Inputs<{ label: string; primary?: boolean }>, ctx: ComponentContext) {
  const { radius, size } = appearance(ctx);
  const hovered = state(false);
  const background = combineLatest([props.primary, hovered]).pipe(
    map(([primary, hover]) => (primary === true ? 'primary' : hover ? 'surfaceAlt' : 'transparent'))
  );
  return (
    <button
      onPointerEnter={() => (hovered.value = true)}
      onPointerLeave={() => (hovered.value = false)}
      paddingTop={9}
      paddingBottom={9}
      paddingLeft={16}
      paddingRight={16}
      x="center"
      y="center"
      borderRadius={radius('small')}
      borderWidth={1}
      borderColor={props.primary.pipe(map(primary => (primary === true ? 'primary' : 'border')))}
      backgroundColor={background}
      cursor="pointer">
      <text
        color={props.primary.pipe(map(primary => (primary === true ? 'onPrimary' : 'text')))}
        fontSize={size('bodySmall')}
        fontWeight={600}>
        {props.label}
      </text>
    </button>
  );
}

function Tile(props: Inputs<{ label: string; value: string; delta?: string }>, ctx: ComponentContext) {
  const { text, radius, size } = appearance(ctx);
  return (
    <column
      flexGrow={1}
      gap={6}
      padding={16}
      backgroundColor="surface"
      borderColor="border"
      borderWidth={1}
      borderRadius={radius('medium')}>
      <text textStyle={text('label')}>{props.label}</text>
      <row gap={8} y="center">
        <text textStyle={text('headline')}>{props.value}</text>
        <text color="positive" fontSize={size('bodySmall')} fontWeight={600}>
          {props.delta.pipe(map(delta => delta ?? ''))}
        </text>
      </row>
    </column>
  );
}

interface Activity {
  readonly id: string;
  readonly title: string;
  readonly when: string;
  readonly mark: string;
  readonly good: boolean;
}

const ACTIVITY: readonly Activity[] = [
  { id: 'a1', title: 'Release 0.9 promoted to stable', when: '12 minutes ago', mark: '↑', good: true },
  { id: 'a2', title: 'WebGPU parity run · 3 diffs', when: 'an hour ago', mark: '!', good: false },
  { id: 'a3', title: 'Layout conformance suite green', when: 'this morning', mark: '↑', good: true }
];

function ActivityRow(props: Inputs<{ item: Activity }>, ctx: ComponentContext) {
  const { text, size } = appearance(ctx);
  const item = props.item;
  return (
    <row gap={12} y="center" paddingTop={10} paddingBottom={10}>
      <box
        width={30}
        height={30}
        borderRadius={15}
        x="center"
        y="center"
        backgroundColor={item.pipe(map(value => (value.good ? 'accentSoft' : 'surfaceAlt')))}>
        <text
          color={item.pipe(map(value => (value.good ? 'primary' : 'negative')))}
          fontSize={size('bodySmall')}
          fontWeight={700}>
          {item.pipe(map(value => value.mark))}
        </text>
      </box>
      <column flexGrow={1} gap={2}>
        <text textStyle={text('body')} maxLines={1} textOverflow="ellipsis">
          {item.pipe(map(value => value.title))}
        </text>
        <text textStyle={text('bodySmall')}>{item.pipe(map(value => value.when))}</text>
      </column>
    </row>
  );
}

/**
 * The card the scoped-override row shows twice.
 *
 * It names colors and nothing else — no style handed down from the
 * page, no hex — which is what lets the second copy come out in a
 * different theme with no change to the component.
 */
function SampleCard(_props: Inputs<{}>, ctx: ComponentContext) {
  const { radius, shadow, size } = appearance(ctx);
  return (
    <column
      gap={10}
      padding={16}
      backgroundColor="surface"
      borderColor="border"
      borderWidth={1}
      borderRadius={radius('medium')}
      boxShadows={shadow('small')}>
      <text fontSize={size('title')} fontWeight={600}>
        Deploy to production
      </text>
      <text color="textMuted" fontSize={size('bodySmall')}>
        Runs the conformance suite first, then promotes the build.
      </text>
      <row gap={8} y="center">
        <box
          paddingTop={5}
          paddingBottom={5}
          paddingLeft={10}
          paddingRight={10}
          borderRadius={radius('full')}
          backgroundColor="primary">
          <text color="onPrimary" fontSize={size('bodySmall')} fontWeight={600}>
            Ready
          </text>
        </box>
        <box
          paddingTop={5}
          paddingBottom={5}
          paddingLeft={10}
          paddingRight={10}
          borderRadius={radius('full')}
          backgroundColor="surfaceAlt">
          <text color="textMuted" fontSize={size('bodySmall')}>
            4.1 ms frame
          </text>
        </box>
      </row>
    </column>
  );
}

function Preview(_props: Inputs<{}>, ctx: ComponentContext) {
  const { view, text, radius, shadow } = appearance(ctx);
  // The same choices in the opposite mode, so a light card can live
  // inside a dark page. Derived here for the same reason the theme is.
  const contrast = view.pipe(
    map(choices => buildTheme({ ...specOf(choices), palette: choices.dark ? 'daylight' : 'midnight' }))
  );
  const contrastBody = contrast.pipe(map(value => value.typography.body));
  // Written once, when this component's body runs. A theme change that
  // rebuilt the tree would reset it; it never does.
  const builtAt = new Date().toLocaleTimeString();

  return (
    <scrollview flexGrow={1} padding={28} gap={18} backgroundColor="background">
      <row gap={14} y="center" selfX="stretch">
        <box width={44} height={44} x="center" y="center" borderRadius={radius('medium')} backgroundColor="primary">
          <text color="onPrimary" fontSize={18} fontWeight={700}>
            N
          </text>
        </box>
        <column flexGrow={1} gap={2}>
          <text textStyle={text('title')}>Nodal · Releases</text>
          <text textStyle={text('bodySmall')}>Three services, one canvas renderer</text>
        </column>
        <Pill label="Invite" />
        <Pill label="Publish" primary />
      </row>

      <row gap={12} selfX="stretch">
        <Tile label="OPEN PRS" value="12" delta="+3" />
        <Tile label="BUILDS TODAY" value="48" delta="+11" />
        <Tile label="FRAME BUDGET" value="4.1 ms" />
      </row>

      <column
        gap={0}
        padding={16}
        selfX="stretch"
        backgroundColor="surface"
        borderColor="border"
        borderWidth={1}
        borderRadius={radius('medium')}
        boxShadows={shadow('small')}>
        <text textStyle={text('label')}>RECENT ACTIVITY</text>
        {ACTIVITY.map(item => (
          <ActivityRow key={item.id} item={item} />
        ))}
      </column>

      <column gap={10} selfX="stretch">
        <text textStyle={text('label')}>SCOPED OVERRIDE</text>
        <row gap={14} selfX="stretch" y="stretch">
          <column flexGrow={1} gap={8}>
            <SampleCard />
            <text textStyle={text('bodySmall')}>Inherits the page theme.</text>
          </column>
          <column flexGrow={1} gap={8} theme={contrast} textStyle={contrastBody}>
            <SampleCard />
            <text textStyle={text('bodySmall')}>Same component, its own provider.</text>
          </column>
        </row>
      </column>

      <text textStyle={text('bodySmall')}>
        {`This tree was built once, at ${builtAt}. Every change since has been a repaint: the theme is an environment value, so a new one reaches each node that resolves against it without any of them being rebuilt.`}
      </text>
    </scrollview>
  );
}

/**
 * The root, and the only node that provides the page's theme.
 *
 * `textStyle` goes with it so text that sets neither size nor color
 * follows the type scale; both are ordinary props, so both accept an
 * Observable and neither costs a rebuild when it changes.
 */
export function ThemeApp(_props: Inputs<{}>, ctx: ComponentContext) {
  const { theme, text } = appearance(ctx);
  return (
    <row theme={theme} textStyle={text('body')} backgroundColor="background" y="stretch">
      <SettingsPanel />
      <Preview />
    </row>
  );
}
