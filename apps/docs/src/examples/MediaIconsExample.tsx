import { map } from 'rxjs/operators';

import { darkTheme, lightTheme, percent, type UiTheme } from '@gesso/core';
import { Icon } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

/**
 * Three paths on the 24-unit grid, which is what an icon set ships.
 *
 * `RING` is two squares wound the same way, which is the shape that
 * makes `fillRule` visible: the inner one punches a hole under
 * `evenodd` and does not under `nonzero`.
 */
export const CHECK = 'M4 12.5 L9.5 18 L20 6';
export const PLUS = 'M12 5 V19 M5 12 H19';
export const RING = 'M3 3 H21 V21 H3 Z M9 9 H15 V15 H9 Z';

// #region icons
/**
 * A card of icons, and a button that changes the theme the card is
 * under.
 *
 * Two things are on show. The row of stroked icons has the check mark
 * in it twice, at one size in one colour, and those two cost a single
 * raster between them: what a raster is keyed on is the icon, not the
 * node. The pair below differ only in `fillRule`, so they are two
 * rasters of one path.
 *
 * The button swaps the theme this card provides. Every icon here names
 * a palette entry rather than a colour, and a raster has its colour
 * baked in, so each one is drawn again in the other palette's value.
 * Nothing is rebuilt: the modifier hears the environment change and
 * re-rasterises in place.
 */
export function MediaIcons(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const dark = internalState(false);
  const theme = dark.pipe(map((on): UiTheme => (on ? darkTheme : lightTheme)));

  return (
    <column gap={16} x="center" y="center" width={percent(100)} height={percent(100)} padding={20}>
      <column
        theme={theme}
        gap={12}
        padding={16}
        x="center"
        borderRadius={12}
        borderWidth={1}
        borderColor="border"
        backgroundColor="surface">
        <row gap={16} y="center">
          <Icon path={CHECK} size={26} style="stroke" strokeWidth={2.2} color="controlAccent" label="Done" />
          <Icon path={PLUS} size={26} style="stroke" strokeWidth={2.2} color="controlAccent" />
          <Icon path={CHECK} size={26} style="stroke" strokeWidth={2.2} color="controlAccent" />
        </row>
        <text text="Two of those are one raster" fontSize={12} color="textMuted" />
        <row gap={24} y="center">
          <column gap={6} x="center">
            <Icon path={RING} size={34} color="text" fillRule="nonzero" />
            <text text="nonzero" fontSize={12} color="textMuted" />
          </column>
          <column gap={6} x="center">
            <Icon path={RING} size={34} color="text" fillRule="evenodd" />
            <text text="evenodd" fontSize={12} color="textMuted" />
          </column>
        </row>
      </column>

      <button
        label="Change the card's theme"
        onClick={() => (dark.value = !dark.value)}
        padding={8}
        borderRadius={6}
        borderWidth={1}
        borderColor="border"
        backgroundColor="background"
        cursor="pointer"
        modifiers={[HOVER_CONTROL]}>
        <text text={dark.pipe(map(on => (on ? 'Light card' : 'Dark card')))} fontSize={12} color="text" />
      </button>
    </column>
  );
}
// #endregion icons
