import { percent } from '@gesso/core';
import { Icon } from '@gesso/components';
import { type ComponentContext, type Inputs } from '@gesso/framework';

// #region paths
/**
 * The paths, on the 24-unit grid every icon set uses.
 *
 * An `Icon` takes path data rather than a file, because what it does
 * with it is rasterise it: there is no document to load and no SVG
 * parser in the framework. The stroked four are drawn here; the
 * filled two are Heroicons, and `clock` is authored `evenodd`, so the
 * face has a hole in it only if the icon is told so.
 */
const STROKED = [
  { label: 'Done', path: 'M4 12.5 L9.5 18 L20 6' },
  { label: 'Add', path: 'M12 5 L12 19 M5 12 L19 12' },
  { label: 'Search', path: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14 M16 16 L21 21' },
  { label: 'Alerts', path: 'M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6 M10 20a2 2 0 0 0 4 0' }
] as const;

const PLAY =
  'M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 ' +
  '19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z';

const CLOCK =
  'M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 ' +
  '2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z';
// #endregion paths

// #region icons
/**
 * Seven icons: four stroked, two filled, and one nobody announces.
 *
 * Every one of them names a palette entry rather than a colour, which
 * is the same rule the rest of the library follows, and it costs more
 * to keep here than anywhere else: a raster has its colour baked into
 * its pixels, so a palette name cannot be resolved at paint. The
 * modifier resolves it against the theme the node inherits and
 * rasterises again when that theme changes. Switch this site between
 * light and dark and the icons below are redrawn, in the accent of
 * whichever palette arrived.
 *
 * `Search` and `Alerts` are two subpaths in one string. An icon is one
 * path in one colour by construction, so a two-colour mark is two
 * `Icon`s rather than one.
 */
export function Glyphs(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <column gap={16} padding={20} width={percent(100)} height={percent(100)}>
      <row gap={16} y="center">
        {STROKED.map(icon => (
          <Icon
            key={icon.label}
            path={icon.path}
            label={icon.label}
            size={24}
            style="stroke"
            strokeWidth={2}
            color="controlAccent"
          />
        ))}
        <text text="stroke, at strokeWidth 2" fontSize={12} color="textMuted" />
      </row>
      <row gap={16} y="center">
        <Icon path={PLAY} label="Play" size={24} color="text" />
        <Icon path={CLOCK} label="Recent" size={24} color="text" fillRule="evenodd" />
        <text text="fill, and fill with evenodd so the clock keeps its face" fontSize={12} color="textMuted" />
      </row>
      <row gap={16} y="center">
        <Icon path={PLAY} size={12} color="textMuted" />
        <text text="No label, so this one is decorative and is not announced." fontSize={12} color="textMuted" />
      </row>
    </column>
  );
}
// #endregion icons
