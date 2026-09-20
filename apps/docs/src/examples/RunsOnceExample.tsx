import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import { HOVER_ACCENT } from './interaction';

/**
 * How many component bodies this module has run.
 *
 * Module state rather than a cell in a component, because the whole
 * point is that it counts across the tree and never goes up again once
 * the screen is built.
 */
const bodies = internalState(0);

/** A second mount would keep counting, so the spec starts from zero. */
export function resetBodyCount(): void {
  bodies.value = 0;
}

// #region rows
/**
 * One reading. Its body runs when the row is mounted and never again;
 * `value` is a cell, so a new number is written into the node that is
 * already on screen.
 */
function Reading(inputs: Inputs<{ name: string; value: number }>, _ctx: ComponentContext) {
  bodies.value++;

  return (
    <row gap={12} y="center">
      <text text={inputs.name} fontSize={13} color="textMuted" width={80} />
      <text text={inputs.value.pipe(map(value => value.toFixed(2)))} fontSize={15} color="text" />
    </row>
  );
}
// #endregion rows

// #region root
export function RunsOnce(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  bodies.value++;
  const tick = internalState(0);

  return (
    <column gap={18} x="center" y="center" width={percent(100)} height={percent(100)}>
      <column gap={8} padding={18} borderRadius={10} borderWidth={1} borderColor="border" backgroundColor="surface">
        <Reading name="Pressure" value={tick.pipe(map(t => 12.4 + (t % 9) * 0.35))} />
        <Reading name="Flow" value={tick.pipe(map(t => 3.1 + (t % 5) * 0.2))} />
        <Reading name="Level" value={tick.pipe(map(t => 68 - (t % 11) * 1.5))} />
      </column>

      <row gap={16} y="center">
        <button
          label="Update readings"
          onClick={() => tick.value++}
          padding={8}
          borderRadius={6}
          backgroundColor="primary"
          cursor="pointer"
          modifiers={[HOVER_ACCENT]}>
          <text text="Update readings" fontSize={13} color="background" />
        </button>
        <column gap={2}>
          <text text={tick.pipe(map(t => `${t * 3} property updates`))} fontSize={12} color="textMuted" />
          <text text={bodies.pipe(map(n => `${n} component bodies run`))} fontSize={12} color="textMuted" />
        </column>
      </row>
    </column>
  );
}
// #endregion root
