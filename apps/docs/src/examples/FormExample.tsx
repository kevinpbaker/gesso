import { percent } from '@gesso/core';
import { Checkbox, Select, TextInput } from '@gesso/components';
import { computed, internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_ACCENT } from './interaction';

const PLANS = [
  { value: 'free', label: 'Free' },
  { value: 'team', label: 'Team' },
  { value: 'enterprise', label: 'Enterprise' }
];

// #region form
/**
 * A form built from `@gesso/components`, and nothing hand-rolled.
 *
 * Each control takes `value` and `onChange` and is otherwise the
 * library's problem: the label above it, the caret and selection, the
 * focus ring, the hover and press states, the keyboard map, and the
 * `role`, `label` and `states` an assistive technology reads. Tab moves
 * between them in order, Space toggles the checkbox, and the select
 * opens from the keyboard alone.
 *
 * What the application supplies is the state and what to do with it.
 */
export function Form(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const email = internalState('');
  const plan = internalState('team');
  const updates = internalState(true);
  const submitted = internalState(false);

  const summary = computed(() =>
    email.value === ''
      ? 'Enter an address to continue'
      : `${email.value} on ${plan.value}${updates.value ? ', with updates' : ''}`
  );

  return (
    <column gap={14} padding={20} width={percent(100)} height={percent(100)} y="center">
      <TextInput
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChange={next => {
          email.value = next;
          submitted.value = false;
        }}
      />
      <Select label="Plan" options={PLANS} value={plan} onChange={next => (plan.value = next)} />
      <Checkbox label="Send me product updates" checked={updates} onChange={next => (updates.value = next)} />

      <row gap={12} y="center">
        <button
          label="Continue"
          onClick={() => (submitted.value = true)}
          padding={10}
          borderRadius={6}
          backgroundColor="primary"
          cursor="pointer"
          modifiers={[HOVER_ACCENT]}>
          <text text="Continue" fontSize={13} color="background" />
        </button>
        <text
          text={computed(() => (submitted.value ? `Sent: ${summary.value}` : summary.value))}
          fontSize={12}
          color="textMuted"
        />
      </row>
    </column>
  );
}
// #endregion form
