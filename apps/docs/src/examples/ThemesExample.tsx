import { map } from 'rxjs/operators';

import {
  lightColors,
  lightTheme,
  parseColor,
  percent,
  type UiColor,
  type UiColors,
  type UiTextStyle,
  type UiTheme,
  type UiTypography
} from 'gesso-core';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import { HOVER_CONTROL } from './interaction';

/** A hex string as the `UiColor` a palette holds. */
function hex(value: string): UiColor {
  const color = parseColor(value);
  if (color === undefined) {
    throw new Error(`'${value}' is not a colour.`);
  }
  return color;
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

// #region palette
/**
 * A palette of the application's own, with one name the shipped set
 * does not have.
 *
 * `UiColors` is an interface, so a palette that adds to it is still a
 * palette, and `backgroundColor="accentSoft"` resolves because a token
 * is looked up on whatever palette the node inherits rather than on a
 * fixed list of names.
 */
export interface DocsColors extends UiColors {
  readonly accentSoft: UiColor;
}

interface PaletteSpec {
  readonly background: string;
  readonly surface: string;
  readonly border: string;
  readonly text: string;
  readonly primary: string;
  readonly accentSoft: string;
}

/**
 * The whole theme from one palette spec.
 *
 * Spreading `lightColors` first fills in the tokens this example does
 * not name, so the shape stays complete; the control tokens are then
 * derived from the same four colours, which is what makes a checkbox or
 * a text field follow this palette without naming a colour of its own.
 *
 * The type scale carries the palette's text colour, because text that
 * names no colour takes it from the scale rather than from the palette.
 */
function themeFor(spec: PaletteSpec): UiTheme {
  const surface = hex(spec.surface);
  const text = hex(spec.text);
  const primary = hex(spec.primary);
  const colors: DocsColors = {
    ...lightColors,
    background: hex(spec.background),
    surface,
    border: hex(spec.border),
    text,
    textMuted: mix(surface, text, 0.62),
    primary,
    accentSoft: hex(spec.accentSoft),
    controlBackground: surface,
    controlBackgroundHovered: mix(surface, text, 0.08),
    controlBackgroundPressed: mix(surface, text, 0.16),
    controlBorder: hex(spec.border),
    controlForeground: text,
    controlAccent: primary,
    focusRing: primary
  };
  return { ...lightTheme, colors, typography: recolored(lightTheme.typography, text) };
}
// #endregion palette

/** The shipped scale in one colour. Replacing the scale itself is the type page's subject. */
function recolored(scale: UiTypography, color: UiColor): UiTypography {
  const paint = (style: UiTextStyle): UiTextStyle => ({ ...style, color });
  return {
    body: paint(scale.body),
    bodyLarge: paint(scale.bodyLarge),
    bodySmall: paint(scale.bodySmall),
    headline: paint(scale.headline),
    title: paint(scale.title),
    label: paint(scale.label)
  };
}

/** The two the button rotates between, built once so their identity is stable. */
export const APP_THEMES: readonly { readonly name: string; readonly theme: UiTheme }[] = [
  {
    name: 'Harbour',
    theme: themeFor({
      background: '#eef3f8',
      surface: '#ffffff',
      border: '#c8d7e4',
      text: '#12212e',
      primary: '#1668a8',
      accentSoft: '#d8e8f5'
    })
  },
  {
    name: 'Ember',
    theme: themeFor({
      background: '#211c19',
      surface: '#2c2521',
      border: '#4a3d35',
      text: '#f6ece2',
      primary: '#e08a3c',
      accentSoft: '#3f2d1f'
    })
  }
];

/** The theme the right-hand card provides for itself, whatever is above it. */
export const SCOPED_THEME: UiTheme = themeFor({
  background: '#eef2ea',
  surface: '#f7faf4',
  border: '#cad6c1',
  text: '#1b2a1c',
  primary: '#2f7d4f',
  accentSoft: '#dcead8'
});

// #region card
/**
 * A card that names tokens and no colours.
 *
 * `surface`, `border`, `primary` and `accentSoft` are resolved at paint
 * against whatever theme the node inherits, so this component is the
 * same component under every palette on the page.
 */
function Card(inputs: Inputs<{ heading: string; body: string }>, _ctx: ComponentContext) {
  return (
    <column
      width={200}
      gap={8}
      padding={14}
      borderRadius={10}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface">
      <text text={inputs.heading} fontSize={15} fontWeight={600} color="text" />
      <text text={inputs.body} fontSize={12} />
      <box padding={6} borderRadius={6} backgroundColor="accentSoft">
        <text text="accentSoft" fontSize={11} color="primary" />
      </box>
    </column>
  );
}
// #endregion card

// #region provide
/**
 * One provider above two cards, and a second provider around one of
 * them.
 *
 * The outer column provides `theme` and `textStyle`, so everything
 * below it, including the column itself, resolves against the chosen
 * palette. The box around the right-hand card provides a theme of its
 * own, which is what makes the environment scoped rather than global:
 * the nearest provider above a node wins, and the button below swaps
 * only the outer one.
 */
export function Themes(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const index = internalState(0);
  const chosen = index.pipe(map(value => APP_THEMES[value % APP_THEMES.length]!));
  const theme = chosen.pipe(map(entry => entry.theme));

  return (
    <column
      theme={theme}
      textStyle={theme.pipe(map(value => value.typography.body))}
      backgroundColor="background"
      width={percent(100)}
      height={percent(100)}
      x="center"
      y="center"
      gap={14}
      padding={20}>
      <row gap={12} y="start">
        <Card heading="Inherited" body="This card takes the palette provided above it." />
        <box theme={SCOPED_THEME} textStyle={SCOPED_THEME.typography.body}>
          <Card heading="Scoped" body="This card provides a palette for itself." />
        </box>
      </row>
      <button
        onClick={() => index.value++}
        padding={8}
        borderRadius={6}
        borderWidth={1}
        borderColor="border"
        backgroundColor="controlBackground"
        cursor="pointer"
        label="Swap the palette above both cards"
        modifiers={[HOVER_CONTROL]}>
        <text text={chosen.pipe(map(entry => `Palette: ${entry.name}`))} fontSize={12} color="text" />
      </button>
    </column>
  );
}
// #endregion provide
