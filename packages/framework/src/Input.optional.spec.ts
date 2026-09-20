import { describe, expect, expectTypeOf, it } from 'vitest';

import { Text, type UiChild } from 'gesso-core';

import { ComponentHost } from './ComponentHost';
import type { ComponentElement } from './ComponentElement';
import type { Inputs } from './FunctionComponent';
import { InputCell, input } from './Input';
import { select } from './select';

/**
 * An optional input the parent did not pass.
 *
 * `TrackScreen.tsx` carried a nine-line comment saying such an input
 * "has no cell to read", and that piping one drew a hole where a
 * control should be. Half of that is not true and the other half is a
 * different fault, so this is the case written down: the cell is always
 * there, holds `undefined`, and emits; what draws a hole is binding
 * that `undefined` straight to a property, which is what `input(cell,
 * fallback)` and `select` are for.
 */
interface Props {
  required: string;
  tint?: string;
}

function mount(props: Partial<Props>): { host: ComponentHost; cells: Inputs<Props> } {
  let cells!: Inputs<Props>;
  const component = (inputs: Inputs<Props>): UiChild => {
    cells = inputs;
    return Text({ text: inputs.required });
  };
  const element: ComponentElement<Record<string, unknown>> = {
    kind: 'component',
    tag: 'Optional',
    component,
    props: props as Record<string, unknown>
  };
  const host = new ComponentHost(element);
  host.render();
  return { host, cells };
}

describe('an optional input the parent did not pass', () => {
  it('is a cell like any other', () => {
    const { cells } = mount({ required: 'x' });

    expect(cells.tint).toBeInstanceOf(InputCell);
    expect(cells.tint.value).toBeUndefined();
  });

  it('emits, so a projection of it reaches the property it feeds', () => {
    const { cells } = mount({ required: 'x' });
    const seen: unknown[] = [];
    select(cells.tint, chosen => chosen ?? 'inherit').subscribe(value => seen.push(value));

    expect(seen).toEqual(['inherit']);
  });

  it('takes the value when the parent starts passing one', () => {
    const { host, cells } = mount({ required: 'x' });
    const seen: unknown[] = [];
    cells.tint.subscribe(value => seen.push(value));

    host.updateProps({ required: 'x', tint: 'red' });

    expect(seen).toEqual([undefined, 'red']);
  });

  it('gets its default from `input(cell, fallback)`, which is what a body reads', () => {
    const { cells } = mount({ required: 'x' });

    expect(input(cells.tint, 'inherit').value).toBe('inherit');
  });

  it('is typed as admitting undefined, which is what the runtime hands over', () => {
    const { cells } = mount({ required: 'x' });

    expectTypeOf(cells.tint.value).toEqualTypeOf<string | undefined>();
    expectTypeOf(cells.required.value).toEqualTypeOf<string>();
  });
});
