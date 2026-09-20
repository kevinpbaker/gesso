import { combineLatest, map, type Observable } from 'rxjs';

import { Box, percent, Row, Text, type UiChild } from 'gesso-core';

import { input, type ComponentContext, type Inputs } from 'gesso-framework';

import { layoutOf, modifiersOf, type ControlLayoutProps } from './internals';

/** Which end of the range is the good end. */
export type MeterOptimum = 'low' | 'high';

export interface MeterProps extends ControlLayoutProps {
  /**
   * Where the needle is.
   *
   * The drawn fill is clamped into `min`..`max`; the reported value is
   * not. See the note on clamping below.
   */
  value: number;
  /** The bottom of the range. Default 0. */
  min?: number;
  /** The top of it. Default 1. */
  max?: number;
  /**
   * The name read with the figure.
   *
   * Given none, the meter's name falls back to whatever text is drawn
   * inside it, which is the reading when `showValue` is on and nothing
   * at all when it is off. "82%" is not a name, so pass one.
   */
  label?: string;
  /**
   * The bottom band's edge, in the same units as `value`.
   *
   * Which side of it is the poor side depends on `optimum`. Omitted,
   * it sits at `min`.
   */
  low?: number;
  /**
   * The top band's edge, in the same units as `value`.
   *
   * Omitted, it sits at `max`. Giving neither edge turns the bands off
   * altogether and the bar is painted `controlAccent`.
   */
  high?: number;
  /** Which direction is good. Default `high`. */
  optimum?: MeterOptimum;
  /**
   * Draws the reading beside the bar. Default false.
   *
   * Read once: see the note on the reading below. Whether the reading
   * is drawn never changes what an assistive technology is told, which
   * is the whole point of putting it in `valueText`.
   */
  showValue?: boolean;
  /**
   * How the reading is written. Default a percentage of the range.
   *
   * A function prop, so it is compared by identity: one written fresh
   * at the call site is a new function on every render. Declare it at
   * module scope, or hold it in a cell.
   */
  format?: (value: number) => string;
}

/**
 * A measurement inside a known range, which is simply true right now.
 *
 * Disk 82% full. A password's strength. How much of a budget is spent,
 * how much charge is left, how many of the seats in a plan are taken.
 * A meter is a read-out: it says where a quantity sits between two
 * ends, and it says nothing at all about where it is going.
 *
 * ## Why this is not `ProgressBar`
 *
 * `ProgressBar` reports how far along a task is. That is a claim about
 * *time*: it starts empty, it fills, it ends, and every pixel of it
 * implies that the thing it describes is under way and will finish.
 * That is why it has an indeterminate form — "going, size unknown" is
 * a sensible thing for a task to be — and why ARIA lets it drop its
 * value while it is `busy`.
 *
 * A meter never has an indeterminate form, because "a measurement, but
 * we do not know it" is not a reading, it is an absence. It never
 * reaches an end and stops. A disk that is 82% full is not 82% of the
 * way through being a disk. Drawing a measurement with a progress bar
 * tells the reader that something is happening, which is the one thing
 * that is not.
 *
 * So: a task with a size, `ProgressBar`. A quantity with a range,
 * `Meter`. If the number could go down again without anything having
 * gone wrong, it is a meter.
 *
 * ## The bands, which are why this exists rather than being a box
 *
 * A meter that could only be `controlAccent` would be a rounded box
 * with a fill in it, and every caller would write the same conditional
 * — is this reading good? — at their own call site, each of them
 * slightly differently. `low`, `high` and `optimum` are that
 * conditional, once:
 *
 *   - **`optimum: 'high'`** (the default): at or above `high` is good,
 *     at or below `low` is poor, between them is middling. Password
 *     strength, battery charge, a test's coverage.
 *   - **`optimum: 'low'`**: the other way round. At or below `low` is
 *     good, at or above `high` is poor. This is the disk case: 5% full
 *     is fine and 95% full is not.
 *
 * An edge that is not given sits at the end of the range it bounds, so
 * `high` alone means "everything up to `high` is the bottom of the
 * scale". Giving *neither* turns the bands off, and the bar is
 * `controlAccent`: a caller who named no edges has told the component
 * nothing about what a good reading is, and painting one of three
 * tones on a guess would be worse than painting none.
 *
 * `poor` is tested before `good`, so a caller who crosses the two
 * edges gets a deterministic answer rather than a band that depends on
 * which branch was written first.
 *
 * ## Three tones, and no colour prop
 *
 * | Band     | Token           |
 * | -------- | --------------- |
 * | good     | `controlAccent` |
 * | middling | `textMuted`     |
 * | poor     | `danger`        |
 *
 * The two ends are the tokens the library already uses for those two
 * claims: `controlAccent` is the fill of a control that is on, and it
 * is what `ProgressBar` and `Slider` already fill a track with;
 * `danger` is what a control's border turns when it is invalid, and
 * what a `danger` badge is painted in.
 *
 * The middle one had no obvious token, because the palette has no
 * `warning` and this component is not a good enough reason to add one
 * — a token exists so that several components agree about a colour,
 * and one caller of a new name is a colour prop with extra steps.
 * Of what is actually in `UiColors`, `placeholder` is within a few
 * percent of `controlBackground` in both stock palettes, so a middling
 * bar would read as an empty one; `secondary` is an accent that means
 * "notable", which is a louder claim than a middling reading makes.
 * `textMuted` is the ink the theme already writes de-emphasised text
 * in: present, legible against the track in both palettes, and
 * endorsing nothing. That is exactly what the middle band says, and a
 * theme that adjusts its muted ink adjusts this with it.
 *
 * There is no colour prop and there will not be one. Restyling a meter
 * is a theme provider around it.
 *
 * ## Clamping, and a range that is not one
 *
 * A `value` outside `min`..`max` clamps the *fill*, because a fill
 * wider than its track would be a lie about the picture. It does not
 * clamp the *reported* value, because that would be a lie about the
 * number — the same split `ProgressBar` makes, for the same reason.
 * The band is read from the raw value too: 140% of a quota is more
 * poor than 100% of it, not less.
 *
 * `max <= min` draws an empty bar rather than throwing. It is a caller
 * error in the sense that nothing sensible can be drawn, but a meter's
 * range usually comes from data — a quota that has not been set, a
 * plan with no seats yet, a file of zero bytes — so the degenerate
 * case arrives at runtime from a server rather than from a typo. An
 * empty bar beside an honest `valueMin` and `valueMax` lets the reader
 * see that the range is wrong; a thrown error takes the screen down
 * over one read-out. `quantize` and `ProgressBar` both take the same
 * view of a zero span.
 *
 * ## Where the reading goes, which is `valueText`
 *
 * `format` writes the reading, defaulting to a percentage of the
 * range. The formatted string is what an assistive technology hears,
 * because "0.82" is not something anybody can act on, and it goes in
 * `valueText` — ARIA's `aria-valuetext`, which means precisely "read
 * this instead of the number".
 *
 * The three alternatives all lose something. `label` is the meter's
 * *name*, so putting the reading there would either throw away "Disk
 * used" or make every caller concatenate the two, and a name that
 * changes as the value changes is a name that is not one. A
 * `description` is supplementary, announced after the value and
 * sometimes not at all. And a drawn `Text` node cannot carry it,
 * because `progressbar` is one of the roles whose children are
 * presentational: the semantics tree claims everything under the
 * meter's root, so the reading beside the bar is not read at all.
 * `valueText` is the only one of the four that is announced whether or
 * not `showValue` drew anything.
 *
 * The band is paint. Nothing announces it, because a caller who wants
 * "82%, running low" heard has a `format` to say it in, and a
 * component that invented `invalid` out of a colour would be claiming
 * something the caller never said.
 *
 * ## Role
 *
 * `progressbar`, which is a narrowing: `UiRole` has no `meter`, and
 * `progressbar` is its only numeric-range role that is not a control.
 * It is still the honest choice — the record carries `valueNow`,
 * `valueMin`, `valueMax` and `valueText`, which is the whole of what a
 * meter has to say, and the alternative is declaring nothing and being
 * unreachable. What it costs is the word "progress" in some readers'
 * announcements, and a `label` and a `valueText` that say what the
 * reading actually is are what pay for it.
 *
 * ## Read once
 *
 * `showValue` decides the meter's *shape* — whether there is a text
 * node beside the bar at all — rather than a value inside it, so it is
 * read once when the component is built, the way `Badge` reads `dot`.
 * Binding it to `visible` would not do: `visible` is paint-only here,
 * so a hidden reading would go on holding its width and its gap, and a
 * meter with no reading would be drawn short of the space it was
 * given. A meter that has to gain or lose its reading changes its
 * `key`. Everything else follows a cell as it changes.
 */
export function Meter(inputs: Inputs<MeterProps>, _ctx: ComponentContext): UiChild {
  const min = input(inputs.min, 0);
  const max = input(inputs.max, 1);
  const label = input(inputs.label, undefined);
  const optimum = input(inputs.optimum, 'high');

  // Read once: this decides whether the reading exists, not what it
  // says, and `visible` is paint-only so a hidden text node would keep
  // its width.
  const showValue = input(inputs.showValue, false).value === true;

  const fraction: Observable<number> = combineLatest([inputs.value, min, max]).pipe(
    map(([current, low, high]) => {
      const span = high - low;
      return span <= 0 ? 0 : Math.min(1, Math.max(0, (current - low) / span));
    })
  );

  const band: Observable<string> = combineLatest([inputs.value, min, max, inputs.low, inputs.high, optimum]).pipe(
    map(([current, low, high, bottom, top, direction]) => tokenFor(current, low, high, bottom, top, direction))
  );

  const reading: Observable<string> = combineLatest([inputs.value, min, max, inputs.format]).pipe(
    map(([current, low, high, write]) => (write === undefined ? asPercentage(current, low, high) : write(current)))
  );

  const children: UiChild[] = showValue
    ? [
        Text({
          text: reading,
          textStyle: 'bodySmall',
          color: 'controlForeground',
          textWrap: 'none',
          // The bar gives up width before the reading does: a bar two
          // pixels shorter still reads, half a number does not.
          flexShrink: 0,
          selectable: false
        })
      ]
    : [];

  return Row(
    {
      ...layoutOf(inputs),
      modifiers: modifiersOf(inputs),
      gap: showValue ? GAP : 0,
      y: 'center',
      role: 'progressbar',
      label,
      // Raw, not clamped. The fill is the thing that has to fit inside
      // the track; the number does not.
      valueNow: inputs.value,
      valueMin: min,
      valueMax: max,
      // The whole reason the reading is computed even when it is not
      // drawn: a `progressbar`'s children are presentational, so the
      // text beside the bar is never announced.
      valueText: reading
    },
    Box(
      {
        flexGrow: 1,
        height: THICKNESS,
        borderRadius: RADIUS,
        backgroundColor: 'controlBackground',
        overflow: 'hidden',
        position: 'relative'
      },
      // A percentage of the track rather than a `flexGrow` bound to the
      // fraction, which is what `ProgressBar` does and for the reason it
      // does it: the fill is then layout, so it follows the track when
      // the meter is resized, and a fraction of 0 is an absent box
      // rather than a flex child that still claims its basis.
      Box({
        position: 'absolute',
        top: 0,
        left: 0,
        height: THICKNESS,
        borderRadius: RADIUS,
        width: fraction.pipe(map(part => percent(part * 100))),
        backgroundColor: band
      })
    ),
    ...children
  );
}

/**
 * Which of the three tones the bar is painted in.
 *
 * `poor` is tested first so that crossed edges resolve the same way
 * every time rather than by the order the branches happen to be in.
 */
function tokenFor(
  value: number,
  min: number,
  max: number,
  low: number | undefined,
  high: number | undefined,
  optimum: MeterOptimum | undefined
): string {
  if (low === undefined && high === undefined) {
    return GOOD;
  }
  const bottom = low ?? min;
  const top = high ?? max;
  if (optimum === 'low') {
    if (value >= top) {
      return POOR;
    }
    return value <= bottom ? GOOD : MIDDLING;
  }
  if (value <= bottom) {
    return POOR;
  }
  return value >= top ? GOOD : MIDDLING;
}

/**
 * The default reading: where the value sits in the range, as a whole
 * percentage.
 *
 * Unclamped, so it agrees with the `valueNow` beside it rather than
 * quietly reporting 100% for a quota that has been passed. A range
 * with no span has no percentage to report, so the bare number is the
 * only honest thing left to say.
 */
function asPercentage(value: number, min: number, max: number): string {
  const span = max - min;
  if (span <= 0) {
    return String(value);
  }
  return `${Math.round(((value - min) / span) * 100)}%`;
}

/** The track, at the height a read-out beside a line of text wants. */
const THICKNESS = 8;
const RADIUS = THICKNESS / 2;

/** Between the bar and its reading, when there is one. */
const GAP = 8;

const GOOD = 'controlAccent';
const MIDDLING = 'textMuted';
const POOR = 'danger';
