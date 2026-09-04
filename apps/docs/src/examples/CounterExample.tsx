import { percent } from '@gesso/core';
import { HOVER_ACCENT } from './interaction';
import { type ComponentContext, type Inputs, computed, input, internalState } from '@gesso/framework';

export function Counter(inputs: Inputs<{ label?: string }>, _context: ComponentContext) {
  const label = input(inputs.label, 'Count'); // inputs are cells; this one has a default
  const count = internalState(0);
  const caption = computed(() => `${label.value}: ${count.value}`);

  return (
    <row gap={12} x="center" y="center" width={percent(100)} height={percent(100)}>
      <text text={caption} fontSize={18} />
      <button
        label="Add one"
        onClick={() => count.value++}
        padding={8}
        borderRadius={6}
        backgroundColor="primary"
        cursor="pointer"
        modifiers={[HOVER_ACCENT]}>
        <text text="+1" color="background" fontSize={14} />
      </button>
    </row>
  );
}
