import { percent } from '@gesso/core';
import { Button, Checkbox, email, field, form, required, Select, TextInput } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

const PLANS = [
  { value: 'free', label: 'Free' },
  { value: 'team', label: 'Team' },
  { value: 'enterprise', label: 'Enterprise' }
];

// #region form
/**
 * A form: three controls, three rules, and a button that will not go
 * until they pass.
 *
 * `form` holds the fields by name and each field carries its own
 * checks. `bind()` spreads onto a control everything the control needs
 * from the form: the value, the writer, the message to show once the
 * field has been left, and the ref the form uses to put the caret in
 * the first field that failed. Nothing about validation is written on
 * a control, and nothing about it is written twice.
 *
 * Press Continue with the form empty and nothing is sent: the caret
 * lands in the email field and every rule that failed says so, in
 * words a screen reader announces as well as draws.
 */
export function Form(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const sent = internalState('');
  const signUp = form(
    ctx,
    {
      email: field({ initial: '', validate: [required('We need an address'), email()] }),
      plan: field({ initial: 'team' }),
      terms: field({ initial: false, validate: [required('Accept the terms to continue')] })
    },
    {
      onSubmit: values => {
        sent.value = `Sent: ${values.email} on ${values.plan}`;
      }
    }
  );

  return (
    <column gap={14} padding={20} width={percent(100)} height={percent(100)} y="center">
      <TextInput label="Email" placeholder="you@example.com" {...signUp.fields.email.bind()} />
      <Select label="Plan" options={PLANS} {...signUp.fields.plan.bind()} />
      <Checkbox label="I accept the terms" {...signUp.fields.terms.bindAs('checked')} />

      <row gap={12} y="center">
        <Button label="Continue" onClick={() => void signUp.submit()} />
        <text text={sent} textStyle="bodySmall" color="textMuted" />
      </row>
    </column>
  );
}
// #endregion form
