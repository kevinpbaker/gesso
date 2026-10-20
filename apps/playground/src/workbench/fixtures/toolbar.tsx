import { map } from 'rxjs/operators';

import { Button, Divider, TextInput, Toolbar, tooltip } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** The line under a toolbar that says what was pressed, so a press can be seen to land. */
function Said(inputs: Inputs<{ text: string }>) {
  return (
    <text textStyle="bodySmall" color="textMuted">
      {inputs.text}
    </text>
  );
}

/** Formatting tools in two groups, with a rule between. */
function Formatting(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const said = internalState('Nothing pressed yet');
  const bold = internalState(false);
  const boldTip = tooltip(ctx, { text: 'Bold (Ctrl B)' });
  const italicTip = tooltip(ctx, { text: 'Italic (Ctrl I)' });
  const press = (name: string) => () => (said.value = `Chose: ${name}`);
  return (
    <column gap={8} x="start">
      <Toolbar label="Formatting">
        <row gap={6} y="center">
          <Button
            label="Bold"
            size="small"
            variant={bold.pipe(map(on => (on ? 'filled' : 'plain')))}
            rootModifiers={[boldTip]}
            onClick={() => {
              bold.value = !bold.value;
              said.value = `Chose: Bold (${bold.value ? 'on' : 'off'})`;
            }}
          />
          <Button label="Italic" size="small" variant="plain" rootModifiers={[italicTip]} onClick={press('Italic')} />
          <Divider direction="column" />
          <Button label="Link" size="small" variant="plain" onClick={press('Link')} />
          <Button label="Image" size="small" variant="plain" disabled onClick={press('Image')} />
        </row>
      </Toolbar>
      <Said text={said} />
    </column>
  );
}

/** A button before and after, to Tab across the toolbar. */
function TabOrder(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const said = internalState('Nothing pressed yet');
  const press = (name: string) => () => (said.value = `Chose: ${name}`);
  return (
    <column gap={8} x="start">
      <Button label="Before" variant="outlined" onClick={press('Before')} />
      <Toolbar label="Edit">
        <row gap={6} y="center">
          <Button label="Cut" size="small" variant="plain" onClick={press('Cut')} />
          <Button label="Copy" size="small" variant="plain" onClick={press('Copy')} />
          <Button label="Paste" size="small" variant="plain" disabled onClick={press('Paste')} />
          <Button label="Undo" size="small" variant="plain" onClick={press('Undo')} />
        </row>
      </Toolbar>
      <Button label="After" variant="outlined" onClick={press('After')} />
      <Said text={said} />
    </column>
  );
}

const TOOLS = ['Bold', 'Italic', 'Underline', 'Strike', 'Code', 'Quote', 'List', 'Numbered', 'Link', 'Image'];

/** More tools than the card is wide. */
function Crowded(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <Toolbar label="Too many tools">
      <row gap={6} y="center">
        {TOOLS.map(tool => (
          <Button key={tool} label={tool} size="small" variant="plain" />
        ))}
      </row>
    </Toolbar>
  );
}

/** Controls of different heights side by side. */
function Mixed(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const said = internalState('Nothing searched yet');
  return (
    <column gap={8} x="stretch">
      <Toolbar label="Search tools">
        <row gap={6} y="center" flexGrow={1}>
          <Button label="Small" size="small" variant="outlined" />
          <Button label="Large" size="large" variant="outlined" />
          <TextInput
            label="Search"
            labelHidden
            placeholder="Search…"
            flexGrow={1}
            onSubmit={() => (said.value = 'Chose: Search')}
          />
        </row>
      </Toolbar>
      <Said text={said} />
    </column>
  );
}

/** Stretched across the cell, with a spacer pushing the last group to the end. */
function Spread(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <Toolbar label="Document" selfX="stretch">
      <row gap={6} y="center" flexGrow={1}>
        <Button label="Back" size="small" variant="plain" />
        <text color="text" maxLines={1} textOverflow="ellipsis" flexShrink={1}>
          Quarterly report — final draft
        </text>
        <box flexGrow={1} />
        <Button label="Share" size="small" />
      </row>
    </Toolbar>
  );
}

export const toolbarFixture: WorkbenchFixture = {
  id: 'toolbar',
  name: 'Toolbar',
  source: 'packages/components/src/Structure.ts',
  states: [
    {
      name: 'Formatting',
      try: 'A framed strip with every button centred vertically and a visible vertical rule between Italic and Link. Bold toggles filled and the line says on or off; hovering it shows its tooltip above, not clipped by the toolbar. Image is grey and does nothing.',
      width: 340,
      render: () => <Formatting />
    },
    {
      name: 'Tab order',
      try: 'Tab from Before: Cut, Copy, Undo (Paste is skipped), then After, each with its own focus ring not cut off by the toolbar’s border. Enter on Copy says Chose: Copy.',
      render: () => <TabOrder />
    },
    {
      name: 'More tools than room',
      try: 'Ten tools in a 280px card: the toolbar does not draw past the card’s border, and no button is squashed until its label overlaps the next.',
      render: () => <Crowded />
    },
    {
      name: 'Mixed heights',
      try: 'Small, Large and the field all share one centre line, the toolbar is as tall as Large plus its padding, and the field takes the rest of the width. Enter in the field says Chose: Search.',
      width: 400,
      stretch: true,
      render: () => <Mixed />
    },
    {
      name: 'Stretched with a spacer',
      try: 'The toolbar spans the card; Share sits at the right end. Make the window narrow: the title shortens with an ellipsis before Share or Back is pushed out. In right-to-left, Back is on the right and Share on the left.',
      width: 360,
      stretch: true,
      render: () => <Spread />
    },
    {
      name: 'Empty',
      try: 'A toolbar with nothing in it is a small framed box, not a zero-height line or a collapsed border.',
      render: () => <Toolbar label="Empty" />
    }
  ]
};
