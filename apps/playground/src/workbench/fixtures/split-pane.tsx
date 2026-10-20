import { map } from 'rxjs/operators';

import { Button, SplitPane, TextInput } from 'gesso-components';
import { percent } from 'gesso-core';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** A pane with a name on it, filled so its edge can be seen against the divider. */
function pane(name: string, tinted = false) {
  return (
    <column
      gap={4}
      padding={8}
      width={percent(100)}
      height={percent(100)}
      backgroundColor={tinted ? 'surface' : 'background'}>
      <text color="text" maxLines={1} textOverflow="ellipsis">
        {name}
      </text>
    </column>
  );
}

/** How far across the divider is, said under the panes. */
function Readout(inputs: Inputs<{ split: number }>) {
  return (
    <text textStyle="bodySmall" color="textMuted">
      {inputs.split.pipe(map(fraction => `Split at ${Math.round(fraction * 100)}%`))}
    </text>
  );
}

/** A split and its readout, filling the cell: every SplitPane prop that matters passed through. */
function Framed(
  inputs: Inputs<{
    direction?: 'row' | 'column';
    min?: number;
    max?: number;
    divider?: 'bar' | 'line';
    start?: number;
  }>,
  _ctx: ComponentContext
) {
  const split = internalState(inputs.start.value ?? 0.5);
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <box flexGrow={1} minHeight={0} borderWidth={1} borderColor="border" borderRadius={6} overflow="hidden">
        <SplitPane
          split={split}
          onSplitChange={next => (split.value = next)}
          direction={inputs.direction.value}
          min={inputs.min.value}
          max={inputs.max.value}
          divider={inputs.divider.value}
          first={pane('First', true)}
          second={pane('Second')}
        />
      </box>
      <Readout split={split} />
    </column>
  );
}

/** A pane whose content is far wider than any fraction it is given. */
function Wide(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const split = internalState(0.5);
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <box flexGrow={1} minHeight={0} borderWidth={1} borderColor="border" borderRadius={6} overflow="hidden">
        <SplitPane
          split={split}
          onSplitChange={next => (split.value = next)}
          first={
            <text color="text" padding={8}>
              A-single-unbroken-line-of-text-much-wider-than-the-pane-it-sits-in-and-then-some
            </text>
          }
          second={
            <text color="text" padding={8} textWrap="word">
              The second pane wraps its words, so it reflows as the divider moves.
            </text>
          }
        />
      </box>
      <Readout split={split} />
    </column>
  );
}

/** Which panes are shown, switched from outside, with a field to prove a hidden pane keeps its state. */
function Showing(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const show = internalState<'both' | 'first' | 'second'>('both');
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <row gap={6}>
        <Button label="Both" size="small" variant="outlined" onClick={() => (show.value = 'both')} />
        <Button label="First" size="small" variant="outlined" onClick={() => (show.value = 'first')} />
        <Button label="Second" size="small" variant="outlined" onClick={() => (show.value = 'second')} />
      </row>
      <box flexGrow={1} minHeight={0} borderWidth={1} borderColor="border" borderRadius={6} overflow="hidden">
        <SplitPane
          defaultSplit={0.5}
          show={show}
          first={
            <column padding={8} gap={6} backgroundColor="surface" width={percent(100)} height={percent(100)}>
              <TextInput label="Draft" placeholder="Type, then hide me" />
            </column>
          }
          second={pane('Second')}
        />
      </box>
      <text textStyle="bodySmall" color="textMuted">
        {show.pipe(map(value => `Showing: ${value}`))}
      </text>
    </column>
  );
}

/** A column split inside the second pane of a row split. */
function Nested(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <box
      width={percent(100)}
      height={percent(100)}
      borderWidth={1}
      borderColor="border"
      borderRadius={6}
      overflow="hidden">
      <SplitPane
        defaultSplit={0.3}
        label="Sidebar"
        first={pane('Sidebar', true)}
        second={
          <SplitPane
            direction="column"
            defaultSplit={0.7}
            label="Panel"
            first={pane('Editor')}
            second={pane('Terminal', true)}
          />
        }
      />
    </box>
  );
}

export const splitPaneFixture: WorkbenchFixture = {
  id: 'split-pane',
  name: 'SplitPane',
  source: 'packages/components/src/SplitPane.ts',
  states: [
    {
      name: 'Default',
      try: 'Drag the divider: it follows the pointer from the first pixel and the readout follows it. It stops at 10% and 90% however far the pointer goes. Tab onto it: a focus ring; Left and Right move it 2% at a time; Home and End go to 10% and 90%. Scroll the page a little and drag again: it still sits under the pointer.',
      width: 400,
      height: 220,
      stretch: true,
      render: () => <Framed />
    },
    {
      name: 'Tight limits',
      try: 'min 30%, max 70%: the divider will not pass either by drag or by key, and Home / End land exactly on 30% and 70%.',
      width: 400,
      height: 220,
      stretch: true,
      render: () => <Framed min={0.3} max={0.7} start={0.4} />
    },
    {
      name: 'Column',
      try: 'The divider is horizontal and the cursor is a row resize. Drag up and down; Up and Down move it 2% and Left and Right do nothing (and do not scroll the page).',
      width: 320,
      height: 300,
      stretch: true,
      render: () => <Framed direction="column" />
    },
    {
      name: 'Line divider',
      try: 'A one-pixel rule where the panes meet, with a wider grab area around it: the resize cursor appears a few pixels either side. It lights up under the pointer and shows a focus ring after Tab.',
      width: 400,
      height: 220,
      stretch: true,
      render: () => <Framed divider="line" />
    },
    {
      name: 'Content wider than its pane',
      try: 'Drag the divider left past the unbroken text: it keeps moving all the way to 10% and the text is clipped at the pane’s edge, not drawn over the divider or the other pane.',
      width: 400,
      height: 220,
      stretch: true,
      render: () => <Wide />
    },
    {
      name: 'One pane at a time',
      try: 'Type in Draft, press Second, then Both: the draft is still there and the divider is back where it was. With one pane showing it fills the box and there is no divider, nothing to Tab to and no gap at the edge.',
      width: 400,
      height: 240,
      stretch: true,
      render: () => <Showing />
    },
    {
      name: 'Nested',
      try: 'Drag the outer divider: the inner split keeps its 70/30 proportion. Drag the inner one: the outer does not move. Tab reaches both dividers in order.',
      width: 480,
      height: 280,
      stretch: true,
      render: () => <Nested />
    },
    {
      name: 'Right to left',
      try: 'Switch to Right to left. Drag: the divider still sits under the pointer. Note which way Left and Right move it and whether First is on the left or the right; the arrow should move the divider the way it points.',
      width: 400,
      height: 220,
      stretch: true,
      render: () => <Framed />
    }
  ]
};
