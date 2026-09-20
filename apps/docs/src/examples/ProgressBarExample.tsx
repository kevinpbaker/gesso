import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { ProgressBar } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import { HOVER_CONTROL } from './interaction';

// #region progress
/**
 * Three bars: one the buttons move, one on a range of its own, and one
 * that cannot say how far along it is.
 *
 * `Upload` is the ordinary case. Its value is a cell between 0 and 1,
 * and the bar reports it as it stands: nothing is clamped on the way
 * to a screen reader, and the fill is clamped only because a fill
 * wider than its track would be a lie about the picture rather than
 * about the number.
 *
 * `Disk used` has `min` and `max` of its own, so the value is 34 out
 * of 120 rather than a fraction someone had to work out first.
 *
 * `Indexing` was built with no value at all, which is what makes it
 * indeterminate: a sliver sweeps the track, and the record says `busy`
 * with no value rather than a value of zero. Zero would be a claim
 * that nothing has happened yet, which is not what "unknown" means.
 * Whether a bar is determinate is decided once, when it is built, so a
 * bar that starts with no value and later gets one has to be built
 * again: give it a `key` that changes with it.
 */
export function Uploads(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const progress = internalState(0.35);
  const caption = progress.pipe(map(value => `${Math.round(value * 100)}% of 24 MB`));

  return (
    <column gap={16} padding={20} width={percent(100)} height={percent(100)}>
      <column gap={6}>
        <row gap={8}>
          <text text="Upload" fontSize={13} flexGrow={1} />
          <text text={caption} fontSize={12} color="textMuted" />
        </row>
        <ProgressBar label="Upload" value={progress} width={percent(100)} />
      </column>
      <row gap={8}>
        <Step label="Less" onPress={() => (progress.value = Math.max(0, progress.value - 0.15))} />
        <Step label="More" onPress={() => (progress.value = Math.min(1, progress.value + 0.15))} />
      </row>
      <column gap={6}>
        <text text="Disk used" fontSize={13} />
        <ProgressBar label="Disk used" value={34} min={0} max={120} thickness={10} width={percent(100)} />
      </column>
      <column gap={6}>
        <text text="Indexing" fontSize={13} />
        <ProgressBar label="Indexing" width={percent(100)} />
      </column>
    </column>
  );
}

/** A button, hovering and pressing as everything clickable here does. */
function Step(inputs: Inputs<{ label: string; onPress: () => void }>) {
  return (
    <button
      label={inputs.label.value}
      onClick={inputs.onPress.value}
      paddingLeft={12}
      paddingRight={12}
      paddingTop={6}
      paddingBottom={6}
      borderRadius={6}
      backgroundColor="controlBackground"
      cursor="pointer"
      modifiers={[HOVER_CONTROL]}>
      <text text={inputs.label} fontSize={12} color="controlForeground" />
    </button>
  );
}
// #endregion progress
