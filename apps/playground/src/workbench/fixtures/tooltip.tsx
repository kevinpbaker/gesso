import { map } from 'rxjs/operators';

import { Button, Tooltip, tooltip } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs, type OverlayPlacement } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** Three buttons with the modifier, and a line that says which was pressed. */
function Basic(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const said = internalState('Nothing pressed yet');
  const save = tooltip(ctx, { text: 'Writes the note to the server' });
  const archive = tooltip(ctx, { text: 'Hides the note without deleting it' });
  const remove = tooltip(ctx, { text: 'Permanent: there is no undo' });
  const press = (name: string) => () => (said.value = `Pressed: ${name}`);
  return (
    <column gap={8} x="start">
      <row gap={8}>
        <Button label="Save" rootModifiers={[save]} onClick={press('Save')} />
        <Button label="Archive" variant="outlined" rootModifiers={[archive]} onClick={press('Archive')} />
        <Button label="Delete" tone="danger" rootModifiers={[remove]} onClick={press('Delete')} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {said}
      </text>
    </column>
  );
}

/** One button per side. */
function Sides(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const sides: readonly OverlayPlacement[] = ['top', 'right', 'bottom', 'left'];
  const tips = sides.map(side => tooltip(ctx, { text: `Placed ${side}`, placement: side, delay: 0 }));
  return (
    <row gap={8} flexWrap="wrap">
      {sides.map((side, index) => (
        <Button key={side} label={side} variant="outlined" rootModifiers={[tips[index]]} />
      ))}
    </row>
  );
}

/** No pause, the default pause, and a long one. */
function Delays(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const now = tooltip(ctx, { text: 'No delay', delay: 0 });
  const usual = tooltip(ctx, { text: 'The usual 400 ms' });
  const slow = tooltip(ctx, { text: 'A second and a half', delay: 1500 });
  return (
    <row gap={8}>
      <Button label="0 ms" variant="outlined" rootModifiers={[now]} />
      <Button label="400 ms" variant="outlined" rootModifiers={[usual]} />
      <Button label="1500 ms" variant="outlined" rootModifiers={[slow]} />
    </row>
  );
}

/** A paragraph of a tooltip, and a word with no breaks in it. */
function Long(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const paragraph = tooltip(ctx, {
    text: 'Exports every selected report, with its attachments and the comments left on it, as one spreadsheet per quarter, and emails the lot to the address on your profile when it is done.',
    delay: 0
  });
  const word = tooltip(ctx, {
    text: 'Supercalifragilisticexpialidocious-and-then-some-more-without-a-space',
    delay: 0
  });
  return (
    <row gap={8}>
      <Button label="Paragraph" variant="outlined" rootModifiers={[paragraph]} />
      <Button label="Unbroken" variant="outlined" rootModifiers={[word]} />
    </row>
  );
}

/** A tooltip whose text is asked for each time it opens. */
function Following(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const sorted = internalState(false);
  const tip = tooltip(ctx, { text: () => (sorted.value ? 'Undo sort' : 'Sort by name'), delay: 0 });
  return (
    <column gap={8} x="start">
      <Button
        label={sorted.pipe(map(on => (on ? 'Unsort' : 'Sort')))}
        variant="outlined"
        rootModifiers={[tip]}
        onClick={() => (sorted.value = !sorted.value)}
      />
      <text textStyle="bodySmall" color="textMuted">
        {sorted.pipe(map(on => (on ? 'Sorted' : 'Not sorted')))}
      </text>
    </column>
  );
}

/** The element under the tooltip is replaced by another while it is showing. */
function Replaced(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const running = internalState(false);
  const run = tooltip(ctx, { text: 'Runs the job' });
  const cancel = tooltip(ctx, { text: 'Stops the job' });
  return (
    <column gap={8} x="start">
      {running.pipe(
        map(on =>
          on ? (
            <Button
              key="cancel"
              label="Cancel"
              tone="danger"
              rootModifiers={[cancel]}
              onClick={() => (running.value = false)}
            />
          ) : (
            <Button key="run" label="Run" rootModifiers={[run]} onClick={() => (running.value = true)} />
          )
        )
      )}
      <text textStyle="bodySmall" color="textMuted">
        {running.pipe(map(on => (on ? 'Running' : 'Idle')))}
      </text>
    </column>
  );
}

/** The wrapping component, around a badge that takes no focus and around a button that does. */
function Wrapped(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <row gap={12} y="center">
      <Tooltip text="Everything on this note is read only" placement="bottom">
        <box padding={6} borderRadius={4} borderWidth={1} borderColor="border" backgroundColor="surface">
          <text textStyle="bodySmall" color="textMuted" selectable={false}>
            Read only
          </text>
        </box>
      </Tooltip>
      <Tooltip text="Shares the note with your team" placement="right">
        <Button label="Share" variant="outlined" />
      </Tooltip>
    </row>
  );
}

export const tooltipFixture: WorkbenchFixture = {
  id: 'tooltip',
  name: 'Tooltip',
  source: 'packages/components/src/Tooltip.ts',
  states: [
    {
      name: 'Modifier on buttons',
      try: 'Rest the pointer on Save: after a short pause a tooltip appears above it. Leave and it goes at once. Press a button: the tooltip goes and does not come back for that press. Tab onto Archive: its tooltip appears with no pause; clicking a button never opens one. The line says what was pressed.',
      width: 320,
      render: () => <Basic />
    },
    {
      name: 'Escape',
      try: 'Tab onto Save so its tooltip shows, then press Escape: the tooltip goes and focus stays on Save. Hover Delete and press Escape: same.',
      width: 320,
      render: () => <Basic />
    },
    {
      name: 'Placements',
      try: 'Each tooltip sits on the side its button names, 6px off, centred on the button. left at the card’s left edge has room on the page; scroll this card to the window’s top and top flips below.',
      width: 320,
      render: () => <Sides />
    },
    {
      name: 'Delays',
      try: '0 ms is up the moment the pointer arrives; 400 ms after a beat; 1500 ms only if the pointer stays still that long. Sweeping across all three quickly opens none but the first.',
      width: 320,
      render: () => <Delays />
    },
    {
      name: 'Long text',
      try: 'The paragraph wraps at about 220px and stays fully on screen. The unbroken word does not draw outside the tooltip’s dark box.',
      render: () => <Long />
    },
    {
      name: 'Text that follows the app',
      try: 'Hover: Sort by name. Click, then leave and hover again: Undo sort. The tooltip never shows the previous text, even for a frame.',
      render: () => <Following />
    },
    {
      name: 'Trigger replaced while open',
      try: 'Tab onto Run so its tooltip shows and press Enter: Run turns into Cancel and the Runs the job tooltip is gone, not floating where Run was.',
      render: () => <Replaced />
    },
    {
      name: 'Wrapping component',
      try: 'Hover Read only: a tooltip below it. Tab onto Share: its tooltip shows to the right without a pause, and goes when focus leaves. The wrapper does not stretch Share wider than its label.',
      width: 320,
      render: () => <Wrapped />
    },
    {
      name: 'Theme',
      try: 'Switch the toolbar to Dark and hover each button: the tooltip inverts the stage, a light box with dark text, and switches back in Light. Its text is readable in both.',
      width: 320,
      render: () => <Basic />
    }
  ]
};
