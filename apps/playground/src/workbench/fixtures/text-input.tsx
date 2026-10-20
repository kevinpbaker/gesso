import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { Button, TextArea, TextInput } from 'gesso-components';
import { bind, internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const quoted = (text: string): string => `Value: "${text}" (${text.length} characters)`;

/** Empty, controlled, with the value echoed under it. */
function Echoed(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState('');
  return (
    <column gap={8} x="stretch">
      <TextInput label="Name" placeholder="Ada Lovelace" {...bind(value)} />
      <text textStyle="bodySmall" color="textMuted">
        {value.pipe(map(quoted))}
      </text>
    </column>
  );
}

/** Written from outside, and submitted with Enter. */
function OutsideAndSubmit(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState('');
  const submits = internalState(0);
  return (
    <column gap={8} x="stretch">
      <TextInput label="Email" placeholder="you@example.com" {...bind(value)} onSubmit={() => (submits.value += 1)} />
      <row gap={8} y="center">
        <Button label="Fill in" size="small" variant="outlined" onClick={() => (value.value = 'ada@example.com')} />
        <Button label="Clear" size="small" variant="outlined" onClick={() => (value.value = '')} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {combineLatest([value, submits]).pipe(map(([text, count]) => `"${text}", submitted ${count} times`))}
      </text>
    </column>
  );
}

/** A description that an error replaces while the value is wrong. */
function Validated(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState('ada');
  return (
    <TextInput
      label="Email"
      description="We only use it to send receipts."
      required
      {...bind(value)}
      error={value.pipe(map(text => (text === '' || text.includes('@') ? '' : 'An address needs an @')))}
    />
  );
}

/** A password field, with the real length shown so the bullets can be checked against it. */
function Secret(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState('hunter2');
  return (
    <column gap={8} x="stretch">
      <TextInput label="Password" secret {...bind(value)} />
      <text textStyle="bodySmall" color="textMuted">
        {value.pipe(map(text => `${text.length} characters typed`))}
      </text>
    </column>
  );
}

/** A text area, with a line count so Enter can be seen to insert and Mod-Enter to submit. */
function Notes(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const value = internalState('');
  const submits = internalState(0);
  return (
    <column gap={8} x="stretch">
      <TextArea
        label="Notes"
        placeholder="Enter starts a new line."
        {...bind(value)}
        onSubmit={() => (submits.value += 1)}
      />
      <text textStyle="bodySmall" color="textMuted">
        {combineLatest([value, submits]).pipe(
          map(([text, count]) => `${text.split('\n').length} lines, submitted ${count} times`)
        )}
      </text>
    </column>
  );
}

const LONG_VALUE = 'https://example.com/reports/2026/october/the-quarterly-summary-for-every-region-and-every-team.pdf';
const LONG_PROSE =
  'The meeting ran long because nobody had read the agenda, and the agenda was itself a list of the reasons the last meeting ran long. ' +
  'Next time we will send it a day early.';

export const textInputFixture: WorkbenchFixture = {
  id: 'text-input',
  name: 'TextInput',
  source: 'packages/components/src/TextInput.ts',
  states: [
    {
      name: 'Empty',
      try: 'The placeholder shows in a muted colour. Click in and type: the placeholder goes at the first character and the line under it follows every key. Tab in: focus ring.',
      stretch: true,
      render: () => <Echoed />
    },
    {
      name: 'Set from outside, Enter submits',
      try: 'Press Fill in: the field shows the address without being typed in. Press Enter in the field: the submit count goes up and the text is unchanged. Clear empties it.',
      stretch: true,
      render: () => <OutsideAndSubmit />
    },
    {
      name: 'Uncontrolled',
      try: 'Starts with ada. Typing changes it and nothing else on the page; it keeps its text when you Tab away and back.',
      stretch: true,
      render: () => <TextInput label="Nickname" defaultValue="ada" description="This one keeps its own text." />
    },
    {
      name: 'Description and error',
      try: 'Starts red with the error under it, not the description. Type an @: the red and the error go and the description comes back in their place.',
      stretch: true,
      render: () => <Validated />
    },
    {
      name: 'Disabled',
      try: 'Dimmed label and text. Clicking puts no caret in it, typing does nothing, Tab skips it.',
      stretch: true,
      render: () => <TextInput label="Account ID" value="acct_1029384756" disabled />
    },
    {
      name: 'Read-only',
      try: 'Not dimmed. Click in: the text can be selected and copied, Tab reaches it, but no key changes it, and paste does nothing.',
      stretch: true,
      render: () => <TextInput label="Share link" value="https://gesso.dev/s/9f2c" readOnly />
    },
    {
      name: 'Password',
      try: 'Drawn as bullets, one per character. Typing adds bullets and the count follows. Select all and copy: pasting elsewhere gives nothing. Enter does not add a line.',
      stretch: true,
      render: () => <Secret />
    },
    {
      name: 'Long value in a narrow box',
      try: 'One line that scrolls rather than wraps or spills out of the field. Click in and press End: the caret reaches the end and the text slides to keep it visible. Home brings back the start.',
      width: 180,
      stretch: true,
      render: () => <TextInput label="Link" defaultValue={LONG_VALUE} />
    },
    {
      name: 'Long label and description',
      try: 'Label and description both wrap inside the card; nothing is cut off or drawn past the edge.',
      width: 180,
      stretch: true,
      render: () => (
        <TextInput
          label="The name the invoice should be addressed to, if not yours"
          description="Leave it empty to use the name on the account, which you can change in settings."
          placeholder="Company name"
        />
      )
    },
    {
      name: 'Label hidden',
      try: 'No label above the field, and no gap where one would be: the field sits at the top of the card’s content.',
      stretch: true,
      render: () => <TextInput label="Search" labelHidden placeholder="Search reports" />
    },
    {
      name: 'TextArea',
      try: 'Type, then press Enter twice: two new lines appear and the submit count stays at 0. Press Cmd-Enter or Ctrl-Enter: the count goes up and no line is added. Keep typing past the right edge: words wrap onto the next line rather than scroll.',
      stretch: true,
      render: () => <Notes />
    },
    {
      name: 'TextArea, long text and an unbroken word',
      try: 'The prose wraps at word boundaries. The long link has no spaces: it is broken or clipped inside the field, never drawn past its border.',
      width: 220,
      stretch: true,
      render: () => (
        <TextArea
          label="Minutes"
          defaultValue={`${LONG_PROSE}\n\n${LONG_VALUE}`}
          error="Keep it under 100 characters"
        />
      )
    }
  ]
};
