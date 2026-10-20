import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { Button, Combobox, filterCombobox, type ComboboxOption } from 'gesso-components';
import { bind, internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const PEOPLE: readonly ComboboxOption[] = [
  { value: 'ada', label: 'Ada Okafor', detail: '@ada' },
  { value: 'grace', label: 'Grace Hopper', detail: '@grace' },
  { value: 'alan', label: 'Alan Turing', detail: 'on leave', disabled: true },
  { value: 'kim', label: 'Kim Lee', detail: '@kim', keywords: ['design'] },
  { value: 'linus', label: 'Linus Park', detail: '@linus', keywords: ['infra'] },
  { value: 'margaret', label: 'Margaret Hamilton', detail: '@mh' }
];

const LABELS: readonly ComboboxOption[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'perf', label: 'Performance', keywords: ['slow', 'speed'] },
  { value: 'a11y', label: 'Accessibility', keywords: ['screen reader'] },
  { value: 'docs', label: 'Documentation' },
  { value: 'security', label: 'Security' },
  { value: 'regression', label: 'Regression' },
  { value: 'question', label: 'Question' }
];

/** Two hundred tags, so the list has to scroll and the highlight has to follow. */
const TAGS: readonly ComboboxOption[] = Array.from({ length: 200 }, (_, index) => {
  const n = String(index + 1).padStart(3, '0');
  return { value: `tag-${n}`, label: `Tag ${n}`, detail: index % 7 === 0 ? 'archived' : undefined };
});

const LONG: readonly ComboboxOption[] = [
  {
    value: 'eng',
    label: 'Engineering, platform and developer experience',
    detail: '42 people'
  },
  { value: 'ops', label: 'Operations', detail: '7 people' },
  {
    value: 'legal',
    label: 'Legal, compliance, privacy and the standing committee on retention',
    detail: '3 people'
  }
];

const chosenLine = (value: string): string => (value === '' ? 'Nothing chosen' : `Chosen: ${value}`);

/** Single, controlled, echoed, and written from outside. */
function Single(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState('');
  return (
    <column gap={8} x="stretch">
      <Combobox label="Assignee" placeholder="Unassigned" options={PEOPLE} {...bind(value)} />
      <row gap={8} y="center">
        <Button label="Grace" size="small" variant="outlined" onClick={() => (value.value = 'grace')} />
        <Button label="Clear" size="small" variant="outlined" onClick={() => (value.value = '')} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {value.pipe(map(chosenLine))}
      </text>
    </column>
  );
}

/** Several values, echoed. */
function Multiple(inputs: Inputs<{ start: readonly string[] }>, _ctx: ComponentContext) {
  const values = internalState<readonly string[]>(inputs.start.value);
  return (
    <column gap={8} x="stretch">
      <Combobox
        label="Labels"
        placeholder="Add a label"
        multiple
        options={LABELS}
        values={values}
        onValuesChange={next => (values.value = next)}
      />
      <text textStyle="bodySmall" color="textMuted">
        {values.pipe(map(chosen => (chosen.length === 0 ? 'No labels' : chosen.join(', '))))}
      </text>
    </column>
  );
}

/** A search done somewhere else: the field reports the query and the options are what came back. */
function Searched(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const query = internalState('');
  const value = internalState('');
  const found = query.pipe(map(text => (text.trim() === '' ? [] : filterCombobox(TAGS, text).slice(0, 5))));
  return (
    <column gap={8} x="stretch">
      <Combobox
        label="Tag"
        placeholder="Search tags"
        filter={false}
        options={found}
        emptyText="Type to search"
        onQueryChange={next => (query.value = next)}
        {...bind(value)}
      />
      <text textStyle="bodySmall" color="textMuted">
        {combineLatest([query, value]).pipe(map(([text, chosen]) => `Query "${text}", ${chosenLine(chosen)}`))}
      </text>
    </column>
  );
}

/** Required, with an error until something is chosen. */
function Required(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState('');
  return (
    <Combobox
      label="Reviewer"
      description="They are told when the draft is ready."
      required
      options={PEOPLE}
      {...bind(value)}
      error={value.pipe(map(chosen => (chosen === '' ? 'Pick a reviewer' : '')))}
    />
  );
}

export const comboboxFixture: WorkbenchFixture = {
  id: 'combobox',
  name: 'Combobox',
  source: 'packages/components/src/Combobox.ts',
  states: [
    {
      name: 'Single',
      try: 'Click in: the full list opens under the field, as wide as it. Type gr: only Grace Hopper is left. Enter chooses her, the field shows her name and the list closes. Grace and Clear write from outside and the field follows.',
      stretch: true,
      render: () => <Single />
    },
    {
      name: 'Keyboard',
      try: 'Tab in and press Down: the list opens with Ada highlighted. Down skips Alan (disabled). Type a, then Escape: the list closes; Escape again puts the chosen name back in the field.',
      stretch: true,
      render: () => <Combobox label="Assignee" options={PEOPLE} defaultValue="ada" />
    },
    {
      name: 'Details, keywords, disabled',
      try: 'Each row shows the name and a quieter handle at the right. Type design: Kim Lee matches on a keyword. Alan Turing is dimmed and clicking him does nothing. The chosen row has a tick.',
      stretch: true,
      render: () => <Combobox label="Assignee" options={PEOPLE} defaultValue="grace" />
    },
    {
      name: 'Two hundred options',
      try: 'Open it: the list is 200px tall and scrolls. Hold Down: the highlight scrolls into view as it goes. Type 15: Tag 015 and the tags starting 15 come first.',
      stretch: true,
      render: () => <Combobox label="Tag" options={TAGS} listHeight={200} placeholder="Find a tag" />
    },
    {
      name: 'No matches',
      try: 'Type zzz: the list shows No one by that name, muted, and Enter does nothing. Delete it: the people come back.',
      stretch: true,
      render: () => <Combobox label="Assignee" options={PEOPLE} emptyText="No one by that name" />
    },
    {
      name: 'Multiple',
      try: 'Choose Feature then Docs from the list: each becomes a chip before the text, the list stays open and the search clears. Click a chip’s ×: it goes. With the field empty, Backspace removes the last chip.',
      stretch: true,
      render: () => <Multiple start={['bug']} />
    },
    {
      name: 'Multiple, many chips, narrow',
      try: 'The chips wrap onto more lines inside the field’s border, and the text area stays at least 80px wide at the end. The list opens below the whole box, not over the chips.',
      width: 200,
      stretch: true,
      render: () => <Multiple start={['bug', 'feature', 'perf', 'a11y', 'docs', 'security']} />
    },
    {
      name: 'Searched elsewhere',
      try: 'Empty, the list says Type to search. Type 12: up to five tags come back and the query line follows each key. The options are not filtered a second time.',
      stretch: true,
      render: () => <Searched />
    },
    {
      name: 'Required with an error',
      try: 'Red border and the error under the field, not the description. Choose anyone: the red goes and the description comes back.',
      stretch: true,
      render: () => <Required />
    },
    {
      name: 'Disabled',
      try: 'Dimmed. No caret on click, no list, Tab skips it. In the multiple one below, the chips’ × buttons do nothing.',
      stretch: true,
      render: () => (
        <column gap={10} x="stretch">
          <Combobox label="Assignee" options={PEOPLE} value="ada" disabled />
          <Combobox label="Labels" options={LABELS} multiple values={['bug', 'docs']} disabled />
        </column>
      )
    },
    {
      name: 'Long labels in a narrow field',
      try: 'The field shows the start of the chosen label and scrolls, not spills. Open it: the list is at least 180px, and long names are cut or wrapped inside it with the people count still visible.',
      width: 170,
      stretch: true,
      render: () => <Combobox label="Team" options={LONG} defaultValue="legal" />
    },
    {
      name: 'Against the right edge',
      try: 'A narrow field flush right. Open it: the 180px list stays inside the window rather than being cut off at the right.',
      stretch: true,
      render: () => (
        <row x="end">
          <Combobox label="Label" labelHidden options={LABELS} width={110} placeholder="Label" />
        </row>
      )
    }
  ]
};
