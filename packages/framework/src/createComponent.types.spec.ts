import { BehaviorSubject } from 'rxjs';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { Text } from 'gesso-core';
import { Component } from './Component';
import { createComponent } from './createComponent';
import { Define, Input } from './decorators';
import type { ComponentContext, Inputs } from './FunctionComponent';
import { input } from './Input';

/**
 * Typed `createComponent`, for classes and functions. As in
 * UiElementProps.spec, the `@ts-expect-error` lines are compile-time
 * assertions enforced by `tsc`.
 */
@Define('typed-class')
class TypedClass extends Component {
  @Input() label = input('Count');
  @Input() step = input(1);

  override render() {
    return Text({ text: this.label });
  }
}

function TypedFunction(inputs: Inputs<{ title: string; subtitle?: string; count?: number }>, _ctx: ComponentContext) {
  expectTypeOf(inputs.title.value).toEqualTypeOf<string>();
  expectTypeOf(inputs.subtitle.value).toEqualTypeOf<string | undefined>();
  return Text({ text: inputs.title });
}

function NoProps() {
  return Text({ text: 'static' });
}

describe('createComponent types', () => {
  it('types a class component by its input() fields', () => {
    const element = createComponent(TypedClass, { label: 'x', step: new BehaviorSubject(2) });
    expect(element.props.label).toBe('x');
    createComponent(TypedClass);
    // @ts-expect-error 'lable' is not an input
    createComponent(TypedClass, { lable: 'x' });
    // @ts-expect-error step is a number
    createComponent(TypedClass, { step: 'two' });
    // @ts-expect-error an Observable of the wrong type
    createComponent(TypedClass, { label: new BehaviorSubject(1) });
  });

  it('types a functional component by its Inputs parameter', () => {
    const element = createComponent(TypedFunction, { title: 'T', count: new BehaviorSubject(1) }, 'k');
    expect(element.key).toBe('k');
    expect(element.tag).toBe('TypedFunction');
    // @ts-expect-error title is required
    createComponent(TypedFunction, { subtitle: 's' });
    // @ts-expect-error props are required when one of them is
    createComponent(TypedFunction);
    // @ts-expect-error 'titel' is not a prop
    createComponent(TypedFunction, { title: 'T', titel: 'x' });
    // @ts-expect-error count is a number
    createComponent(TypedFunction, { title: 'T', count: 'many' });
  });

  it('lets a component without inputs be created bare', () => {
    expect(createComponent(NoProps).props).toEqual({});
    createComponent(NoProps, {});
    // @ts-expect-error it declares no props
    createComponent(NoProps, { anything: 1 });
  });
});
