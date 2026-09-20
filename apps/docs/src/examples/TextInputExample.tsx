import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { TextArea, TextInput } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

import { HOVER_CONTROL } from './interaction';

const ADDRESS = 'ada@example.com';

// #region fields
/**
 * Three fields, and the two ways a value can be owned.
 *
 * **Email is controlled.** The application holds the string; the field
 * shows what it is given and reports what was typed. The button writes
 * the cell from outside, which is the ownership being visible rather
 * than claimed: nothing was typed and the field still moved.
 *
 * **Nickname is uncontrolled.** One `defaultValue` and no `onChange`,
 * so the control keeps its own text. No cell in this component holds
 * it and the line at the bottom cannot see it.
 *
 * **Notes is a `TextArea`**, which is `TextInput` with `multiline` on.
 * The difference that matters is Enter: in the single-line field it is
 * the form's, and calls `onSubmit`; here it belongs to the text.
 */
export function TextFields(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const email = internalState('');
  const notes = internalState('');
  const sent = internalState(false);

  // An error is a string, and an empty one is no error: the field goes
  // back to showing its description and drops the `invalid` state.
  const error = email.pipe(map(value => (value.length === 0 || value.includes('@') ? '' : 'An address needs an @')));
  const status = combineLatest([email, notes, sent]).pipe(
    map(([address, body, done]) =>
      done ? `Sent ${body.length} characters to ${address}` : `${body.length} characters, not sent`
    )
  );

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)}>
      <TextInput
        label="Email"
        placeholder="you@example.com"
        description="Enter submits it."
        required
        value={email}
        error={error}
        onChange={next => {
          email.value = next;
          sent.value = false;
        }}
        onSubmit={() => (sent.value = true)}
      />
      <button
        label={`Use ${ADDRESS}`}
        onClick={() => {
          email.value = ADDRESS;
          sent.value = false;
        }}
        padding={8}
        borderRadius={6}
        borderWidth={1}
        borderColor="border"
        backgroundColor="background"
        cursor="pointer"
        modifiers={[HOVER_CONTROL]}>
        <text text={`Use ${ADDRESS}`} fontSize={12} color="text" />
      </button>
      <TextInput label="Nickname" defaultValue="ada" description="This one keeps its own text." />
      <TextArea
        label="Notes"
        placeholder="Enter starts a line."
        value={notes}
        onChange={next => (notes.value = next)}
      />
      <text text={status} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion fields
