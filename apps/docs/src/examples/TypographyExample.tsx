import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { darkTheme, lightTheme, percent, type UiFontWeight, type UiTextStyle, type UiTypography } from 'gesso-core';
import { internalState, ShellService, type ComponentContext, type Inputs } from 'gesso-framework';
import { HOVER_CONTROL } from './interaction';

// #region roles
/**
 * The six roles a `UiTypography` names, largest first.
 *
 * The list is the interface's, not a choice this example makes: a scale
 * carries exactly these, and a component asks for one by name.
 */
export const ROLES: readonly (keyof UiTypography)[] = ['headline', 'title', 'bodyLarge', 'body', 'bodySmall', 'label'];
// #endregion roles

// #region scale
/**
 * A scale of the application's own: the same six roles, a different
 * face and different steps.
 *
 * Each role is built from the shipped one rather than from nothing, so
 * it keeps the colour that scale carries, which is what makes the
 * sample text below legible in both appearances. Everything a role does
 * not restate stays as it was.
 */
function applicationScale(base: UiTypography): UiTypography {
  const step = (
    style: UiTextStyle,
    fontSize: number,
    fontWeight: UiFontWeight,
    letterSpacing: number
  ): UiTextStyle => ({
    ...style,
    fontFamily: 'Georgia, serif',
    fontSize,
    fontWeight,
    lineHeight: Math.round(fontSize * 1.45 * 10) / 10,
    letterSpacing
  });
  return {
    headline: step(base.headline, 30, 700, -0.4),
    title: step(base.title, 22, 600, -0.2),
    bodyLarge: step(base.bodyLarge, 17, 'normal', 0),
    body: step(base.body, 15, 'normal', 0),
    bodySmall: step(base.bodySmall, 13, 'normal', 0),
    label: step(base.label, 11, 600, 1.2)
  };
}
// #endregion scale

/** What the button rotates between. */
export const SCALES: readonly { readonly name: string; readonly build: (base: UiTypography) => UiTypography }[] = [
  { name: 'The shipped scale', build: base => base },
  { name: "The application's scale", build: applicationScale }
];

// #region role
/**
 * One row: a role's name in that role's own style, and its size.
 *
 * The sample names no size, no weight and no face. It is inside a box
 * that provides the role as `textStyle`, and that is the whole
 * mechanism: an inherited text property with no value on the node
 * resolves against the style in the environment.
 */
function Role(inputs: Inputs<{ label: string; style: UiTextStyle }>, _ctx: ComponentContext) {
  return (
    <row gap={12} y="center">
      <box width={78}>
        <text
          text={inputs.style.pipe(map(style => `${style.fontSize} px`))}
          fontSize={11}
          color="textMuted"
          textAlign="right"
        />
      </box>
      <box textStyle={inputs.style}>
        <text text={inputs.label} />
      </box>
    </row>
  );
}
// #endregion role

// #region provide
/**
 * The scale in the environment, and the six roles under it.
 *
 * The column provides `body` as the ambient style, so the first line,
 * which names nothing at all, is body text. Each row then provides its
 * own role for its sample. Swapping the scale writes new values onto
 * the boxes that are already there: no component function runs again,
 * and the samples re-measure because a font size is a layout input.
 */
export function TypeScale(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const index = internalState(0);
  const base = ctx
    .inject(ShellService)
    .colorScheme.pipe(map(scheme => (scheme === 'dark' ? darkTheme : lightTheme).typography));
  const chosen = combineLatest([base, index]).pipe(
    map(([scale, value]) => SCALES[value % SCALES.length]!.build(scale))
  );

  return (
    <column
      textStyle={chosen.pipe(map(scale => scale.body))}
      width={percent(100)}
      height={percent(100)}
      gap={10}
      padding={20}
      x="start"
      y="center">
      <text text="This line names no style, so it is body text." />
      {ROLES.map(role => (
        <Role key={role} label={role} style={chosen.pipe(map(scale => scale[role]))} />
      ))}
      <text text="This line names its own size, so the scale does not decide it." fontSize={12} />
      <button
        onClick={() => index.value++}
        padding={8}
        borderRadius={6}
        borderWidth={1}
        borderColor="border"
        backgroundColor="controlBackground"
        cursor="pointer"
        label="Swap the scale"
        modifiers={[HOVER_CONTROL]}>
        <text
          text={index.pipe(map(value => SCALES[value % SCALES.length]!.name))}
          fontSize={12}
          color="text"
          fontFamily="sans-serif"
        />
      </button>
    </column>
  );
}
// #endregion provide
