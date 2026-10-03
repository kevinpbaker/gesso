import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { Combobox, type ComboboxOption } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region combobox
/** Declared once: a fresh array per frame rebuilds every row. */
const PEOPLE: readonly ComboboxOption[] = [
  { value: 'ada', label: 'Ada Okafor', detail: '@ada' },
  { value: 'grace', label: 'Grace Hopper', detail: '@grace' },
  { value: 'alan', label: 'Alan Turing', detail: 'on leave', disabled: true },
  { value: 'kim', label: 'Kim Lee', detail: '@kim', keywords: ['design'] },
  { value: 'linus', label: 'Linus Park', detail: '@linus', keywords: ['infra'] }
];

const LABELS: readonly ComboboxOption[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'perf', label: 'Performance', keywords: ['slow', 'speed'] },
  { value: 'a11y', label: 'Accessibility', keywords: ['screen reader'] },
  { value: 'docs', label: 'Documentation' }
];

/**
 * An issue's assignee and labels, the two lists a person searches
 * rather than reads.
 *
 * **Assignee is one value.** Type part of a name, or a keyword (`design`
 * finds Kim), and Enter takes the highlighted match. Alan is on leave,
 * so the arrows step over him. Escape closes the list; a second Escape
 * puts back the name that's chosen.
 *
 * **Labels are several.** Each choice toggles a label and the list stays
 * open for the next; Backspace in the empty field takes the last one
 * off, and each chosen label has its own remove button.
 */
export function AssignIssue(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const assignee = internalState('ada');
  const labels = internalState<readonly string[]>(['bug']);

  return (
    <column gap={14} padding={20} width={percent(100)} height={percent(100)}>
      <Combobox
        label="Assignee"
        placeholder="Unassigned"
        options={PEOPLE}
        value={assignee}
        onChange={next => (assignee.value = next)}
      />
      <Combobox
        label="Labels"
        placeholder="Add a label"
        multiple
        options={LABELS}
        values={labels}
        onValuesChange={next => (labels.value = next)}
      />
      <text
        text={labels.pipe(map(chosen => `${chosen.length} label${chosen.length === 1 ? '' : 's'}`))}
        fontSize={12}
        color="textMuted"
      />
    </column>
  );
}
// #endregion combobox
