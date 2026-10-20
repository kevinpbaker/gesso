import { describe, expect, expectTypeOf, it } from 'vitest';

import { Text } from 'gesso-core';
import { bind } from './bind';
import type { Inputs } from './FunctionComponent';
import { internalState } from './InternalState';

/**
 * `bind` spread into JSX. As in `createComponent.types.spec.ts`, the
 * `@ts-expect-error` lines and the plain spreads are compile-time
 * assertions enforced by `tsc`; the runtime half only checks the keys.
 */
function Toggle(inputs: Inputs<{ label?: string; checked?: boolean; onChange?: (checked: boolean) => void }>) {
  return Text({ text: inputs.label });
}

describe('bind types', () => {
  it('names the change handler onChange when only the value is renamed, beside other props', () => {
    const on = internalState(false);

    // The event name defaults to `onChange`. It used to be inferred from
    // the JSX around the spread instead, which made it the union of
    // every prop name there and the object a mapped type over `label`
    // too, so `label="Sync"` was "specified more than once".
    const element = <Toggle label="Sync" {...bind(on, 'checked')} />;
    expect(Object.keys(bind(on, 'checked'))).toEqual(['checked', 'onChange']);
    expect(element.props.label).toBe('Sync');

    expectTypeOf(bind(on, 'checked')).toEqualTypeOf<{ checked: typeof on } & { onChange: (next: boolean) => void }>();
    expectTypeOf(bind(on, 'checked', 'onToggle')).toEqualTypeOf<
      { checked: typeof on } & { onToggle: (next: boolean) => void }
    >();
  });

  it('does the same for a channel key bound with its command', () => {
    const on = internalState(false);
    const write = (next: boolean): void => {
      on.value = next;
    };

    const element = <Toggle label="Sync" {...bind(on, write, 'checked')} />;
    expect(element.props.label).toBe('Sync');
    // @ts-expect-error the value is a boolean, and this binds a number
    <Toggle label="Sync" {...bind(internalState(1), 'checked')} />;
  });
});
