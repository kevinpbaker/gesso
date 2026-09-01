import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { type ComponentContext, type Inputs, input, internalState } from '@gesso/framework';
import { HOVER_ACCENT } from './interaction';

export function Counter(props: Inputs<{ label?: string }>, _context: ComponentContext) {
  const label = input(props.label, 'Count'); // props are cells; this one has a default
  const count = internalState(0);
  const caption = combineLatest([label, count]).pipe(map(([text, value]) => `${text}: ${value}`));

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
