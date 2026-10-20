import { map } from 'rxjs/operators';

import { Button, Tabs, TextInput, type TabDefinition } from 'gesso-components';
import { percent } from 'gesso-core';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const VIEWS: readonly TabDefinition[] = [
  { value: 'Summary', label: 'Summary' },
  { value: 'Activity', label: 'Activity' },
  { value: 'Audit', label: 'Audit', disabled: true },
  { value: 'Billing', label: 'Billing' }
];

const MANY: readonly TabDefinition[] = Array.from({ length: 15 }, (_, index) => ({
  value: `Tab ${index + 1}`,
  label: `Tab ${index + 1}`,
  disabled: index === 6
}));

const LONG: readonly TabDefinition[] = [
  { value: 'short', label: 'All' },
  { value: 'long', label: 'Shipments waiting for customs clearance at the border' },
  { value: 'Unbroken', label: 'Supercalifragilisticexpialidocious' }
];

const EDGES: readonly TabDefinition[] = [
  { value: 'First', label: 'First', disabled: true },
  { value: 'Second', label: 'Second' },
  { value: 'Third', label: 'Third' },
  { value: 'Last', label: 'Last', disabled: true }
];

/** Tabs that own their selection, with a panel and a line that follow it. */
function Owned(
  inputs: Inputs<{ tabs: readonly TabDefinition[]; defaultValue?: string; label?: string }>,
  _ctx: ComponentContext
) {
  const chosen = internalState(inputs.defaultValue.value ?? '');
  return (
    <column gap={8} x="stretch">
      <Tabs
        tabs={inputs.tabs.value}
        label={inputs.label.value}
        defaultValue={inputs.defaultValue.value}
        onChange={value => (chosen.value = value)}>
        <text color="text" textWrap="word">
          {chosen.pipe(map(value => (value === '' ? 'No tab selected' : `The ${value} panel`)))}
        </text>
      </Tabs>
      <text textStyle="bodySmall" color="textMuted">
        {chosen.pipe(map(value => `Chose: ${value === '' ? 'nothing yet' : value}`))}
      </text>
    </column>
  );
}

/** The application owns the selection and refuses Billing. */
function Refusing(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const selected = internalState('Summary');
  const said = internalState('Nothing refused yet');
  return (
    <column gap={8} x="stretch">
      <Tabs
        tabs={VIEWS}
        value={selected}
        onChange={value => {
          if (value === 'Billing') {
            said.value = 'Refused: Billing';
            return;
          }
          selected.value = value;
          said.value = `Chose: ${value}`;
        }}>
        <text color="text">{selected.pipe(map(value => `The ${value} panel`))}</text>
      </Tabs>
      <text textStyle="bodySmall" color="textMuted">
        {said}
      </text>
    </column>
  );
}

const ROWS = Array.from({ length: 30 }, (_, index) => `Row ${index + 1}`);

/** A strip over a panel that is given the rest of a fixed height. */
function Filling(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <Tabs tabs={VIEWS} defaultValue="Summary" height={percent(100)}>
      <scrollview x="stretch" y="stretch" borderWidth={1} borderColor="border" borderRadius={6}>
        <column gap={4} padding={8} x="stretch">
          {ROWS.map(row => (
            <text key={row} color="text">
              {row}
            </text>
          ))}
        </column>
      </scrollview>
    </Tabs>
  );
}

/** A field in the panel, to Tab between the strip and the content. */
function WithField(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <column gap={8} x="stretch">
      <Button label="Before" variant="outlined" />
      <Tabs tabs={VIEWS} defaultValue="Summary">
        <TextInput label="Note" placeholder="Type here" />
      </Tabs>
    </column>
  );
}

/** Tabs added and removed while it is showing. */
function Changing(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const tabs = internalState<readonly TabDefinition[]>(VIEWS.slice(0, 2));
  const selected = internalState('Summary');
  let next = 1;
  return (
    <column gap={8} x="stretch">
      <row gap={8}>
        <Button
          label="Add a tab"
          variant="outlined"
          onClick={() => {
            const name = `New ${next++}`;
            tabs.value = [...tabs.value, { value: name, label: name }];
          }}
        />
        <Button
          label="Remove selected"
          variant="outlined"
          onClick={() => {
            // Tabs leaves a removed value alone, so its owner moves it.
            tabs.value = tabs.value.filter(tab => tab.value !== selected.value);
            selected.value = tabs.value[0]?.value ?? '';
          }}
        />
      </row>
      <Tabs tabs={tabs} value={selected} onChange={value => (selected.value = value)}>
        <text color="text">{selected.pipe(map(value => `The ${value} panel`))}</text>
      </Tabs>
    </column>
  );
}

export const tabsFixture: WorkbenchFixture = {
  id: 'tabs',
  name: 'Tabs',
  source: 'packages/components/src/Structure.ts',
  states: [
    {
      name: 'Default',
      try: 'Click Activity: it lights up and the panel and line follow. Tab onto the strip: one focus ring round the strip, shown only after Tab. Right walks Summary, Activity, Billing and wraps, skipping the grey Audit; Home and End go to Summary and Billing. Clicking Audit does nothing.',
      width: 360,
      stretch: true,
      render: () => <Owned tabs={VIEWS} defaultValue="Summary" />
    },
    {
      name: 'Controlled, refusing one',
      try: 'Click Billing or arrow onto it: the selection stays where it was and the line says Refused: Billing. Every other tab moves as usual.',
      width: 360,
      stretch: true,
      render: () => <Refusing />
    },
    {
      name: 'Fifteen tabs',
      try: 'The strip wraps onto more lines inside the card rather than drawing past it. Arrow to Tab 15: it is visible when selected, and Tab 7 is skipped.',
      stretch: true,
      render: () => <Owned tabs={MANY} defaultValue="Tab 1" />
    },
    {
      name: 'Long labels',
      try: 'The long label wraps or is cut with an ellipsis inside its tab; nothing draws past the card, and the tabs stay on one baseline.',
      stretch: true,
      render: () => <Owned tabs={LONG} defaultValue="short" />
    },
    {
      name: 'No default',
      try: 'Nothing is selected and the panel says so. Tab onto the strip and press Right: Second is selected (First is disabled). End selects Third, not the disabled Last.',
      stretch: true,
      render: () => <Owned tabs={EDGES} />
    },
    {
      name: 'Panel fills a fixed height',
      try: 'The panel fills the cell under the strip and its list scrolls inside it while the strip stays put. Switch tab: the strip does not jump.',
      stretch: true,
      height: 240,
      render: () => <Filling />
    },
    {
      name: 'Tab into the panel',
      try: 'Tab from Before: the strip, then the field in the panel, then out. Shift+Tab walks back the same way. Typing in the field never switches tabs, even with the arrow keys.',
      width: 320,
      stretch: true,
      render: () => <WithField />
    },
    {
      name: 'Tabs added and removed',
      try: 'Add two tabs: they appear at the end without the strip flickering. Select one and Remove selected: the app, which owns the value, picks the first tab that is left, and the strip and the panel both follow it.',
      width: 360,
      stretch: true,
      render: () => <Changing />
    }
  ]
};
