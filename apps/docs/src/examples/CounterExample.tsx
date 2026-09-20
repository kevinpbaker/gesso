import { percent } from 'gesso-core';
import { Button } from 'gesso-components';
import { type ComponentContext, type Inputs, computed, input, internalState } from 'gesso-framework';

export function Counter(inputs: Inputs<{ label?: string }>, _context: ComponentContext) {
  const label = input(inputs.label, 'Count'); // inputs are cells; this one has a default
  const count = internalState(0);
  const caption = computed(() => `${label.value}: ${count.value}`);

  return (
    <row gap={12} x="center" y="center" width={percent(100)} height={percent(100)}>
      <text text={caption} textStyle="title" />
      <Button label="Add one" onClick={() => count.value++} />
    </row>
  );
}
