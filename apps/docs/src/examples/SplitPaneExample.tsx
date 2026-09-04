import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { SplitPane } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

// #region splitpane
/**
 * A list beside a detail pane, with a divider the user can move.
 *
 * The split is controlled: the application holds the fraction, the
 * divider reports where it was dragged or arrowed to, and the readout
 * under the panes is the same cell. `min` and `max` keep either pane
 * from disappearing, and the component clamps to them on both the
 * pointer path and the keyboard one.
 *
 * The divider follows the pointer from the first pixel because it
 * listens for a Pan. In this input model a Drag is a long press
 * followed by a move, which is the gesture this is not: a divider that
 * waited half a second before moving would feel broken.
 *
 * Both panes clip. A pane's content is not what decides its width: the
 * fraction is, and text wider than the fraction would otherwise refuse
 * to shrink and stop the divider partway across.
 */
export function Panes(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const split = internalState(0.4);

  return (
    <column gap={10} padding={20} width={percent(100)} height={percent(100)}>
      <box height={160} borderRadius={6} borderWidth={1} borderColor="border" overflow="hidden">
        <SplitPane
          label="Resize the list"
          split={split}
          min={0.2}
          max={0.8}
          onSplitChange={next => (split.value = next)}
          first={
            <column gap={6} padding={10} backgroundColor="surface">
              <text text="Shipments" fontSize={12} color="textMuted" />
              <text text="Auckland" fontSize={13} />
              <text text="Lisbon" fontSize={13} />
              <text text="Toronto" fontSize={13} />
            </column>
          }
          second={
            <column gap={6} padding={10}>
              <text text="Shipment 4192" fontSize={13} />
              <text
                text="Two boxes, collected on Tuesday, out for delivery."
                fontSize={12}
                color="textMuted"
                textWrap="word"
              />
            </column>
          }
        />
      </box>
      <text
        text={split.pipe(map(fraction => `The list takes ${Math.round(fraction * 100)}% of the width`))}
        fontSize={12}
        color="textMuted"
      />
    </column>
  );
}
// #endregion splitpane
