import { Button, Checkbox, Popover, Select, TextInput, type PopoverAlign, type PopoverSide } from 'gesso-components';
import type { UiChild, UiNode } from 'gesso-core';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** The line under a trigger that says what last happened, so a request or a choice can be seen to land. */
function Said(inputs: Inputs<{ text: string }>) {
  return (
    <text textStyle="bodySmall" color="textMuted">
      {inputs.text}
    </text>
  );
}

/**
 * A trigger that says what it opens: `expanded` from the popover's
 * state, announced as expanded or collapsed, and `controls` from its
 * panel. The library's `Button`, outlined, as a popover's trigger is
 * usually a secondary action beside the page's main one.
 */
function Trigger(
  inputs: Inputs<{
    text: string;
    onRef: (node: UiNode | null) => void;
    open: boolean;
    panel: UiNode | null;
    disabled?: boolean;
  }>
) {
  return (
    <Button
      ref={(node: UiNode | null) => inputs.onRef.value?.(node)}
      label={inputs.text.value}
      variant="outlined"
      size="small"
      disabled={inputs.disabled.value === true}
      expanded={inputs.open}
      controls={inputs.panel}
    />
  );
}

/**
 * One trigger and its popover, the application owning the state. With
 * `stubborn` it refuses every close but its own button's, and says so.
 */
function Anchored(
  inputs: Inputs<{
    trigger: string;
    content: UiChild;
    side?: PopoverSide;
    align?: PopoverAlign;
    width?: number;
    stubborn?: boolean;
    disabled?: boolean;
    end?: boolean;
  }>,
  _ctx: ComponentContext
) {
  const open = internalState(false);
  const anchor = internalState<UiNode | null>(null);
  const panel = internalState<UiNode | null>(null);
  const said = internalState('Closed');
  const stubborn = inputs.stubborn.value === true;
  return (
    <column gap={8} x={inputs.end.value === true ? 'end' : 'start'} width={inputs.end.value === true ? 248 : undefined}>
      <Trigger
        text={inputs.trigger.value}
        onRef={node => (anchor.value = node)}
        open={open}
        panel={panel}
        disabled={inputs.disabled.value}
      />
      <Said text={said} />
      <Popover
        open={open}
        onOpenChange={(next: boolean) => {
          if (next || !stubborn) {
            open.value = next;
            said.value = next ? 'Open' : 'Closed';
          } else {
            said.value = 'Asked to close, and refused';
          }
        }}
        anchor={anchor}
        panelRef={(node: UiNode | null) => (panel.value = node)}
        label={inputs.trigger.value}
        side={inputs.side.value}
        align={inputs.align.value}
        width={inputs.width.value}
        disabled={inputs.disabled.value}
        content={
          stubborn ? (
            <column gap={8}>
              <text text="Escape, a press outside and Tab are all refused." />
              <Button
                label="Done"
                onClick={() => {
                  open.value = false;
                  said.value = 'Closed by Done';
                }}
              />
            </column>
          ) : (
            inputs.content.value
          )
        }
      />
    </column>
  );
}

/** A short form: a field to type in, a box to tick, a button that applies and closes. */
function FormPopover(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  const anchor = internalState<UiNode | null>(null);
  const panel = internalState<UiNode | null>(null);
  const field = internalState<UiNode | null>(null);
  const name = internalState('');
  const notify = internalState(true);
  const said = internalState('Nothing saved');
  return (
    <column gap={8} x="start">
      <Trigger text="Rename list" onRef={node => (anchor.value = node)} open={open} panel={panel} />
      <Said text={said} />
      <Popover
        open={open}
        onOpenChange={(next: boolean) => (open.value = next)}
        anchor={anchor}
        panelRef={(node: UiNode | null) => (panel.value = node)}
        initialFocus={field}
        label="Rename list"
        width={240}
        content={
          <column gap={10}>
            <TextInput
              ref={(node: UiNode | null) => (field.value = node)}
              label="Name"
              value={name}
              onChange={(next: string) => (name.value = next)}
            />
            <Checkbox label="Tell the team" checked={notify} onChange={(next: boolean) => (notify.value = next)} />
            <Button
              label="Save"
              onClick={() => {
                said.value = `Saved: ${name.value}${notify.value ? ', team told' : ''}`;
                open.value = false;
              }}
            />
          </column>
        }
      />
    </column>
  );
}

/** A popover holding a select and a popover of its own. */
function Nested(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const inner = internalState<UiNode | null>(null);
  const innerOpen = internalState(false);
  const innerPanel = internalState<UiNode | null>(null);
  const sort = internalState('new');
  return (
    <Anchored
      trigger="View options"
      width={240}
      content={
        <column gap={10}>
          <Select
            label="Sort by"
            value={sort}
            onChange={(next: string) => (sort.value = next)}
            options={[
              { value: 'new', label: 'Newest first' },
              { value: 'old', label: 'Oldest first' },
              { value: 'votes', label: 'Most votes' }
            ]}
          />
          <Trigger text="More…" onRef={node => (inner.value = node)} open={innerOpen} panel={innerPanel} />
          <Popover
            open={innerOpen}
            onOpenChange={(next: boolean) => (innerOpen.value = next)}
            anchor={inner}
            panelRef={(node: UiNode | null) => (innerPanel.value = node)}
            side="end"
            label="More view options"
            content={<Checkbox label="Show archived" defaultChecked={false} />}
          />
        </column>
      }
    />
  );
}

const NOTE = <text text="A short note about this setting." />;

const LONG = (
  <column gap={8}>
    {Array.from({ length: 14 }, (_, index) => (
      <text
        key={String(index)}
        text={`Paragraph ${index + 1}. Filters narrow what the list shows without changing what it holds, and they are kept per view, so two people can look at the same list in two different ways.`}
      />
    ))}
  </column>
);

export const popoverFixture: WorkbenchFixture = {
  id: 'popover',
  name: 'Popover',
  source: 'packages/components/src/Popover.ts',
  states: [
    {
      name: 'Basic',
      try: 'Press the button: a bordered panel opens 6px under it, its left edge on the button’s. Press the button again and it closes. Tab to the button and press Enter: it opens with focus on the panel; Escape closes it with the focus ring back on the button. Press anywhere else on the page while it is open: it closes and the press lands.',
      render: () => <Anchored trigger="Details" content={NOTE} />
    },
    {
      name: 'Containing a form',
      try: 'Open it: the caret is in Name. Type, Tab to the checkbox, Space ticks it, Tab to Save, Enter saves and closes with focus back on the button and the line saying what was saved. Tab once more from Save instead: it closes and focus moves to whatever follows the button on the page, not to the top.',
      render: () => <FormPopover />
    },
    {
      name: 'Near each window edge',
      try: 'Resize or scroll so this card sits at the bottom of the window and open each: they flip above. At the right edge of the card, the End popover flips to the start side and the bottom one shifts left, staying whole on screen. Scroll the page while one is open: it follows its button, and the wheel does not close it.',
      width: 420,
      render: () => (
        <column gap={12}>
          <row gap={8} flexWrap="wrap">
            <Anchored trigger="Top" side="top" content={NOTE} />
            <Anchored trigger="Start" side="start" content={NOTE} />
            <Anchored trigger="End" side="end" content={NOTE} />
            <Anchored trigger="Bottom, end" align="end" content={NOTE} />
          </row>
          <Anchored trigger="At the card’s end" end width={300} content={NOTE} />
        </column>
      )
    },
    {
      name: 'Long content',
      try: 'Open it: the panel is 360px wide at most and the text wraps; it is never taller than the room on its side, and its content scrolls inside a border that stays still. The wheel over it scrolls the text, not the page.',
      render: () => <Anchored trigger="Read about filters" content={LONG} />
    },
    {
      name: 'Select and nested popover inside',
      try: 'Open it, then open Sort by and choose Oldest first: the choice lands and the outer popover stays open. Press More…: a second popover opens to its end. Press inside the second: both stay. Press on the outer one’s text: only the second closes. Escape from the outer closes it back to its button.',
      width: 320,
      render: () => <Nested />
    },
    {
      name: 'Start and end, right to left',
      try: 'Switch the workbench to right to left. Start now opens to the button’s right and End to its left; Bottom, start lines up with the button’s right edge. The note inside reads from the right. Switch back and each mirrors again.',
      width: 420,
      render: () => (
        <row gap={8} flexWrap="wrap">
          <Anchored trigger="Start" side="start" content={NOTE} />
          <Anchored trigger="End" side="end" content={NOTE} />
          <Anchored trigger="Bottom, start" content={NOTE} />
        </row>
      )
    },
    {
      name: 'Controlled, refusing to close',
      try: 'Open it, then press Escape, press outside, and Tab out: each time the line says it was asked to close and refused, and the panel stays. Done closes it.',
      render: () => <Anchored trigger="Unsaved changes" stubborn content={NOTE} />
    },
    {
      name: 'Disabled',
      try: 'Pressing the button does nothing, Tab skips it, and nothing opens.',
      render: () => <Anchored trigger="Unavailable" disabled content={NOTE} />
    },
    {
      name: 'Narrow cell, long trigger',
      try: 'The button’s label is cut or wrapped inside the 160px cell. The panel opens at the button and is still as wide as its content, staying on screen.',
      width: 160,
      render: () => <Anchored trigger="Filter by owner, label and milestone" width={220} content={NOTE} />
    }
  ]
};
