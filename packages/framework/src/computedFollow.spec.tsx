import { describe, expect, it } from 'vitest';

import { mountRuntime } from './app/RuntimeTestUtils';
import { computed } from './computed';
import { Each } from './each';
import { internalState } from './InternalState';
import type { ComponentContext, Inputs } from './FunctionComponent';

describe('a list whose own row changes what it lists', () => {
  it('shows the rows added by an effect of a row that mounts with it', async () => {
    const count = internalState(1);
    const pages = computed(() => Array.from({ length: count.value }, (_, i) => ({ id: String(i) })));
    function Grows(_inputs: Inputs<object>, ctx: ComponentContext) {
      ctx.effect(internalState(0), () => (count.value = 3));
      return <text text="grows" />;
    }
    function Host(_inputs: Inputs<object>, _ctx: ComponentContext) {
      return (
        <column>
          <Each of={pages} by="id">
            {p =>
              p.id === '0' ? (
                <column>
                  <text text={`row ${p.id}`} />
                  <Grows />
                </column>
              ) : (
                <text text={`row ${p.id}`} />
              )
            }
          </Each>
        </column>
      );
    }
    const mounted = mountRuntime(<Host />);
    mounted.frame();
    mounted.frame();
    expect(count.value).toBe(3);
    const rows = [...mounted.runtime.semanticsTree().values()]
      .map(r => r.label ?? '')
      .filter(l => l.startsWith('row '));
    expect(rows).toEqual(['row 0', 'row 1', 'row 2']);
  });

  it('a computed tells a new follower of a change made while it took the first value', () => {
    const count = internalState(1);
    const doubled = computed(() => count.value * 2);
    const seen: number[] = [];
    doubled.subscribe(n => {
      seen.push(n);
      if (n === 2) count.value = 5;
    });
    expect(seen).toEqual([2, 10]);
  });
});
