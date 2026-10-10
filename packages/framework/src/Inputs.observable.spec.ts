import { BehaviorSubject, type Observable } from 'rxjs';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { Text } from 'gesso-core';

import { ComponentHost } from './ComponentHost';
import type { ComponentElement } from './ComponentElement';
import type { Inputs } from './FunctionComponent';

/**
 * A member declared as an Observable holds its values, not the stream.
 *
 * Found by gesso-code: a line component declared
 * `display: Observable<Display>` and called `inputs.display.value.pipe`,
 * which compiled and threw "pipe is not a function" on mount, because the
 * host subscribes to what the parent passes and feeds the cell its values.
 * The type now says what the runtime does.
 */
interface Shown {
  readonly text: string;
}

let seen: unknown = null;

function Line(inputs: Inputs<{ shown: Observable<Shown>; maybe?: Observable<number> }>) {
  expectTypeOf(inputs.shown.value).toEqualTypeOf<Shown>();
  expectTypeOf(inputs.maybe.value).toEqualTypeOf<number | undefined>();
  // @ts-expect-error a cell holds the values, so there is no stream to pipe
  void (() => inputs.shown.value.pipe);
  seen = inputs.shown.value;
  return Text({ text: 'line' });
}

describe('Inputs of an Observable member', () => {
  it('holds the value the parent streams', () => {
    const shown = new BehaviorSubject<Shown>({ text: 'hello' });
    const element: ComponentElement<Record<string, unknown>> = {
      kind: 'component',
      tag: 'Line',
      component: Line,
      props: { shown }
    };
    new ComponentHost(element).render();
    expect(seen).toEqual({ text: 'hello' });
  });
});
