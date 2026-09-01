import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { type ComponentContext, type Inputs, input, internalState } from '@gesso/framework';
import { HOVER_ACCENT } from './interaction';

/**
 * The counter from the README, as the docs site shows it.
 *
 * This file is the single source for three things: the live canvas on
 * the page, the snippet printed beside it, and `CounterExample.spec.ts`
 * next door. `ROADMAP.md` F7 asks for a docs site "whose examples are
 * the tests", and that is what the arrangement buys — a snippet cannot
 * drift from behaviour that a spec is asserting on the same file.
 */
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
        <text text="+1" color="#ffffff" fontSize={14} />
      </button>
    </row>
  );
}
