import { map } from 'rxjs/operators';

import { percent, type UiAlignment } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';
import { HOVER_CONTROL } from './interaction';

const MAIN: readonly UiAlignment[] = ['start', 'center', 'end', 'space-between'];
const CROSS: readonly UiAlignment[] = ['stretch', 'start', 'center', 'end'];

/** Steps through a list of values, wrapping — one control, four states. */
function cycle<T>(values: readonly T[], current: T): T {
  return values[(values.indexOf(current) + 1) % values.length]!;
}

// #region row
/**
 * A row of three boxes, and the two props that place them.
 *
 * `x` distributes the children along the row's main axis; `y` sizes and
 * places them across it. They are the same two props on a `column`,
 * where the axes swap — which is why they are named for the screen
 * rather than for the axis.
 *
 * None of the boxes sets a height, which is what lets `y: 'stretch'`
 * do anything: stretch gives a child the container's cross size only
 * when the child has not already chosen one. Give a box a `height` and
 * it keeps that height under every value of `y`.
 */
function Boxes(props: Inputs<{ x: UiAlignment; y: UiAlignment }>, _ctx: ComponentContext) {
  return (
    <row
      x={props.x}
      y={props.y}
      gap={10}
      padding={12}
      width={percent(100)}
      height={110}
      borderRadius={8}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface">
      <Tile name="one" />
      <Tile name="two" />
      <Tile name="three" />
    </row>
  );
}

/** A box sized by what is in it, so `stretch` has something to change. */
function Tile(props: Inputs<{ name: string }>, _ctx: ComponentContext) {
  return (
    <box width={72} padding={10} x="center" borderRadius={4} backgroundColor="primary">
      <text text={props.name} fontSize={12} color="background" />
    </box>
  );
}
// #endregion row

export function Layout(_props: Inputs<{}>, _ctx: ComponentContext) {
  const x = internalState<UiAlignment>('start');
  const y = internalState<UiAlignment>('stretch');

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)} y="center">
      <Boxes x={x} y={y} />

      <row gap={10} x="center">
        <Choice label="x" value={x} onPress={() => (x.value = cycle(MAIN, x.value))} />
        <Choice label="y" value={y} onPress={() => (y.value = cycle(CROSS, y.value))} />
      </row>
    </column>
  );
}

/** One button that shows a prop's current value and moves it on. */
function Choice(props: Inputs<{ label: string; value: UiAlignment; onPress: () => void }>, _ctx: ComponentContext) {
  return (
    <button
      label={props.label}
      onClick={() => props.onPress.value()}
      padding={8}
      borderRadius={6}
      borderWidth={1}
      borderColor="border"
      backgroundColor="background"
      cursor="pointer"
      modifiers={[HOVER_CONTROL]}>
      <row gap={8} y="center">
        <text text={props.label} fontSize={12} color="textMuted" />
        <text text={props.value.pipe(map(String))} fontSize={13} color="text" width={92} />
      </row>
    </button>
  );
}
