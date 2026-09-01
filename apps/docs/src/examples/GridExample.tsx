import { map } from 'rxjs/operators';

import { auto, fr, percent } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';
import { HOVER_CONTROL } from './interaction';

const LABELS = ['Text', 'Text measurement'] as const;

// #region table
/**
 * Three rows of label and value, and a note across the bottom.
 *
 * The point is the first column. It is one `auto` track, sized to the
 * widest label in the whole grid, so every value starts on the same
 * line. Three rows would each size their own label, and keeping them
 * aligned would mean picking a width and hoping.
 *
 * `fr(1)` gives the second track what is left. `columnSpan` puts the
 * note across both tracks without a container of its own, which is the
 * other thing nested rows cannot do.
 */
function Specs(props: Inputs<{ middle: string }>, _ctx: ComponentContext) {
  return (
    <grid
      columns={[auto, fr(1)]}
      columnGap={16}
      rowGap={8}
      width={percent(100)}
      padding={16}
      fontSize={13}
      borderRadius={10}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface">
      <text text="Renderer" color="textMuted" />
      <text text="Canvas2D or WebGPU, chosen at startup" color="text" />

      <text text={props.middle} color="textMuted" />
      <text text="One measurer for layout, paint and the caret" color="text" />

      <text text="Threads" color="textMuted" />
      <text text="The whole tree in a render worker" color="text" />

      <text
        text="Widen the first label and every value moves with it: the track is shared, not agreed on."
        columnSpan={2}
        fontSize={12}
        color="textMuted"
      />
    </grid>
  );
}
// #endregion table

export function GridTable(_props: Inputs<{}>, _ctx: ComponentContext) {
  const step = internalState(0);
  const middle = step.pipe(map(index => LABELS[index % LABELS.length]!));

  return (
    <column gap={14} x="center" y="center" width={percent(100)} height={percent(100)} padding={20}>
      <box width={460}>
        <Specs middle={middle} />
      </box>

      <button
        label="Longer label"
        onClick={() => step.value++}
        padding={8}
        borderRadius={6}
        borderWidth={1}
        borderColor="border"
        backgroundColor="background"
        cursor="pointer"
        modifiers={[HOVER_CONTROL]}>
        <text text="Longer label" fontSize={12} color="text" />
      </button>
    </column>
  );
}
