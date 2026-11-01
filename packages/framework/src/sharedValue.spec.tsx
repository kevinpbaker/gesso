import { BehaviorSubject, map } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { provided, type UiChild } from 'gesso-core';

import { mountRuntime } from './app/RuntimeTestUtils';
import type { ComponentContext, Inputs } from './FunctionComponent';
import type { InternalState } from './InternalState';
import { SharedValues, SharedValuesKey, sharedValue } from './sharedValue';

/**
 * Two screens of a prototype: one where an email is typed, one that
 * shows it, each written with a start of its own.
 */
describe('sharedValue', () => {
  const held: Record<string, InternalState<string>> = {};
  function Screen(inputs: Inputs<{ name: string; start: string }>, ctx: ComponentContext): UiChild {
    const email = sharedValue(ctx, 'email', inputs.start.value);
    held[inputs.name.value] = email;
    return <text text={email} />;
  }

  it('is one cell for every component under one store, made at the first one’s start', () => {
    const values = new SharedValues();
    const step = new BehaviorSubject(1);
    const mounted = mountRuntime(
      <column provide={[provided(SharedValuesKey, values)]}>
        {step.pipe(
          map(at =>
            at === 1
              ? [<Screen key="1" name="forgot" start="" />]
              : [<Screen key="2" name="check" start="jordan@greenleaf.co" />]
          )
        )}
      </column>
    );
    mounted.frame();
    held.forgot!.value = 'sam@greenleaf.co';
    step.next(2);
    mounted.frame();

    expect(held.check!.value).toBe('sam@greenleaf.co');
    expect([...values.values.value]).toEqual([['email', 'sam@greenleaf.co']]);
    values.reset();
    expect(held.check!.value).toBe('');
    values.set('email', 'ana@greenleaf.co');
    expect(held.check!.value).toBe('ana@greenleaf.co');
  });

  it('is a cell of each component’s own, at its own start, with no store above', () => {
    const mounted = mountRuntime(
      <column>
        <Screen name="forgot" start="" />
        <Screen name="check" start="jordan@greenleaf.co" />
      </column>
    );
    mounted.frame();
    held.forgot!.value = 'sam@greenleaf.co';

    expect(held.check!.value).toBe('jordan@greenleaf.co');
  });
});
