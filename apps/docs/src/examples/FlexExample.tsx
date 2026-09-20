import { map } from 'rxjs/operators';

import { percent, type UiFlexWrap } from 'gesso-core';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import { HOVER_CONTROL } from './interaction';

const WIDTHS = [520, 400, 300] as const;
const WRAPS: readonly UiFlexWrap[] = ['nowrap', 'wrap'];

// #region bar
/**
 * One row, four items, and a different sizing rule on each.
 *
 * `fontSize` and `color` are set on the row rather than on each item:
 * the typography properties are inherited, so a container is the right
 * place for them and the items are left saying only what makes them
 * different.
 *
 *  - `flex` is the shorthand: grow n, shrink 1, basis 0. Basis 0 is
 *    what makes the two shares exact, so the second item is twice the
 *    first whatever either of them says.
 *  - `flexShrink={0}` opts out of shrinking, so that item keeps its
 *    96 px at every width and the others give up the space instead.
 *  - `flexBasis` is a starting main size that is not a width: this item
 *    begins at 140 px and shrinks from there.
 *
 * None of them shrinks below its own longest word, which is why the
 * narrowest width overflows the row rather than crushing its contents.
 */
function Bar(inputs: Inputs<{ width: number; wrap: UiFlexWrap }>, _ctx: ComponentContext) {
  return (
    <row
      width={inputs.width}
      flexWrap={inputs.wrap}
      gap={10}
      rowGap={10}
      padding={12}
      fontSize={12}
      color="background"
      borderRadius={10}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface">
      <text text="grow 1" flex={1} padding={10} borderRadius={6} backgroundColor="primary" />
      <text text="grow 2" flex={2} padding={10} borderRadius={6} backgroundColor="primary" />
      <text text="fixed 96" width={96} flexShrink={0} padding={10} borderRadius={6} backgroundColor="secondary" />
      <text text="basis 140" flexBasis={140} padding={10} borderRadius={6} backgroundColor="secondary" />
    </row>
  );
}
// #endregion bar

export function FlexBar(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const widthStep = internalState(0);
  const wrapStep = internalState(0);
  const width = widthStep.pipe(map(index => WIDTHS[index % WIDTHS.length]!));
  const wrap = wrapStep.pipe(map(index => WRAPS[index % WRAPS.length]!));

  return (
    <column gap={14} x="center" y="center" width={percent(100)} height={percent(100)} padding={20}>
      <Bar width={width} wrap={wrap} />

      <row gap={10} x="center">
        <Choice label="Width" value={width.pipe(map(value => `${value} px`))} onPress={() => widthStep.value++} />
        <Choice label="Wrap" value={wrap} onPress={() => wrapStep.value++} />
      </row>
    </column>
  );
}

/** One button that shows a prop's current value and moves it on. */
function Choice(inputs: Inputs<{ label: string; value: string; onPress: () => void }>, _ctx: ComponentContext) {
  return (
    <button
      label={inputs.label}
      onClick={() => inputs.onPress.value()}
      padding={8}
      borderRadius={6}
      borderWidth={1}
      borderColor="border"
      backgroundColor="background"
      cursor="pointer"
      modifiers={[HOVER_CONTROL]}>
      <row gap={8} y="center">
        <text text={inputs.label} fontSize={12} color="textMuted" />
        <text text={inputs.value} fontSize={13} color="text" width={64} />
      </row>
    </button>
  );
}
