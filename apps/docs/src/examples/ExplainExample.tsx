import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import { measure, percent, type LayoutBox } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

const EMPTY: LayoutBox = { x: 0, y: 0, width: 0, height: 0 };

// #region vanished
/**
 * A title that is not there, and the one property that decided it.
 *
 * The row is 240 wide and the badge is 240 wide and refuses to shrink,
 * so there is nothing left for the title. It is still a node, still in
 * the tree, still measured: it is simply zero pixels across, which is
 * what `engine.explain` says about it in so many words.
 *
 * `measure` is how the number gets on screen. It reports the node's box
 * whenever the box moves, which is the `ResizeObserver` a canvas does
 * not have, and it is the only thing here that is about the example
 * rather than about the bug.
 */
export function Vanished(_props: Inputs<{}>, _ctx: ComponentContext) {
  const rigid = internalState(true);
  const titleBox = new BehaviorSubject<LayoutBox>(EMPTY);
  const action = rigid.pipe(map(fixed => (fixed ? 'Let the badge shrink' : 'Make the badge rigid again')));

  return (
    <column gap={14} x="center" y="center" width={percent(100)} height={percent(100)} padding={20}>
      <row width={240} height={28} borderWidth={1} borderColor="border" borderRadius={6}>
        <box
          width={240}
          flexShrink={rigid.pipe(map(fixed => (fixed ? 0 : 1)))}
          paddingLeft={8}
          y="center"
          backgroundColor="controlBackground"
          borderRadius={6}>
          <text text="Draft" fontSize={12} color="textMuted" />
        </box>
        <text
          label="title"
          text="Quarterly report"
          fontSize={13}
          color="text"
          textOverflow="ellipsis"
          modifiers={[measure(titleBox)]}
        />
      </row>
      <text
        text={titleBox.pipe(map(box => `The title is ${Math.round(box.width)} px wide.`))}
        fontSize={12}
        color="textMuted"
      />
      <button
        label={action}
        onClick={() => (rigid.value = !rigid.value)}
        padding={8}
        borderRadius={6}
        borderWidth={1}
        borderColor="border"
        backgroundColor="background"
        cursor="pointer"
        modifiers={[HOVER_CONTROL]}>
        <text text={action} fontSize={12} color="text" />
      </button>
    </column>
  );
}
// #endregion vanished
