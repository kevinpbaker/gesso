import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { Slider } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

/**
 * How the value is spoken, and drawn beside the label.
 *
 * Declared here rather than in the call, because a prop that is a new
 * function on every render is a new value to bind every frame.
 */
const asPercent = (value: number) => `${value}%`;
/** The cap the application puts on the controlled slider. */
const SAFE = 80;

// #region sliders
/**
 * Two sliders, and the two ways a value can be owned.
 *
 * **Volume is controlled.** The application holds the number, and it
 * refuses anything above 80: drag or hold the arrow to the end of the
 * track and the thumb stops there, because what the control reports is
 * a request and what the application writes back is the value. The
 * Mute button moves it with no gesture at all.
 *
 * **Zoom is uncontrolled.** One `defaultValue`, no `onChange`, and it
 * runs its whole range on its own.
 *
 * Both are keyboard-operable: arrows step, Page Up and Page Down take
 * a tenth of the range, Home and End go to the ends. Both are
 * draggable: the track measures itself, so a pointer inside it is a
 * fraction of the range.
 */
export function Sliders(_props: Inputs<{}>, _ctx: ComponentContext) {
  const volume = internalState(40);

  return (
    <column gap={16} padding={20} width={percent(100)} height={percent(100)}>
      <Slider
        label="Volume"
        min={0}
        max={100}
        step={5}
        format={asPercent}
        value={volume}
        onChange={next => (volume.value = Math.min(SAFE, next))}
      />
      <box height={8} borderRadius={4} backgroundColor="surface" width={percent(100)}>
        <box height={8} borderRadius={4} backgroundColor="primary" width={volume.pipe(map(value => percent(value)))} />
      </box>
      <row gap={12} y="center">
        <button
          label="Mute"
          onClick={() => (volume.value = 0)}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Mute" fontSize={12} color="text" />
        </button>
        <text text={`The application caps this at ${SAFE}%`} fontSize={12} color="textMuted" />
      </row>
      <Slider label="Zoom" min={50} max={200} step={25} defaultValue={100} format={asPercent} />
    </column>
  );
}
// #endregion sliders
