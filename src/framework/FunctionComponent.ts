import type { Observable } from 'rxjs';

import type { Reactive } from '../ui/composition/UiElementProps';
import type { UiChild } from '../ui/composition/UiElement';
import { Component } from './Component';
import type { InputCell } from './Input';
import type { ChannelReplica } from './channel/ChannelReplica';
import type { ChannelToken } from './channel/ChannelToken';

/**
 * What a functional component can ask of the framework while its body
 * runs. It is the function's half of what `@Inject`, `onMount()` and
 * `onUnmount()` give a class.
 */
export interface ComponentContext {
  /**
   * The runtime service of this class: overlays, focus, find, the
   * clipboard, media, animation.
   *
   * Services stay on this thread and are simply called. Application
   * state comes through `channel` instead.
   */
  inject<S extends object>(ServiceClass: new () => S): S;

  /**
   * The channel declared by `token`: `view` keys to read or bind, and
   * `send` to issue a command.
   */
  channel<V extends object, C extends object>(token: ChannelToken<V, C>): ChannelReplica<V, C>;

  /**
   * Runs once after the component's nodes exist and its bindings are
   * connected. Must be called while the component function runs.
   */
  onMount(hook: () => void): void;

  /**
   * Runs once when the component leaves the tree, before its
   * subscriptions are torn down. Must be called while the component
   * function runs.
   */
  onUnmount(hook: () => void): void;
}

/**
 * The props a functional component receives: one host-owned input
 * cell per declared prop.
 *
 * The parent supplies values or Observables; the host feeds them into
 * these cells and keeps feeding them when the parent's props change,
 * so the function can run exactly once — like a class `render()` — and
 * still follow its parent. An optional prop is a cell whose value may
 * be `undefined`; `input(props.name, fallback)` gives it a default.
 */
export type Inputs<P> = {
  readonly [K in keyof P]-?: InputCell<P[K]>;
};

/**
 * A component written as a function.
 *
 *   function Counter(props: Inputs<{ label?: string }>, ctx: ComponentContext) {
 *     const label = input(props.label, 'Count');
 *     const count = state(0);
 *     const store = ctx.inject(DemoStore);
 *     return Row(Text({ text: label }), Button({ onClick: () => count.value++ }));
 *   }
 *
 * The body is the component's `render()`: it runs once per instance,
 * and everything dynamic in the returned tree is an Observable. Local
 * state is `internalState()` cells created in the body.
 */
export type FunctionComponent<P = {}> = (props: Inputs<P>, context: ComponentContext) => UiChild;

export type ClassComponent = new () => Component;

/**
 * Anything `createComponent` (and JSX) can mount. The function half is
 * loose on purpose: a function's own `Inputs<P>` parameter is what
 * `ComponentProps` reads its props from.
 */
export type ComponentType = ClassComponent | ((props: any, context: ComponentContext) => UiChild);

type IsAny<T> = 0 extends 1 & T ? true : false;

type CellValue<C> = C extends InputCell<infer T> ? T : never;

/** The keys of a cell record whose value may be undefined; the parent may omit those. */
type OptionalCellKeys<I> = {
  [K in keyof I]: undefined extends CellValue<I[K]> ? K : never;
}[keyof I];

/**
 * The props a parent may pass for a record of input cells: each one a
 * value or an Observable of it. A cell that admits `undefined` is
 * optional; every other one is required.
 */
type PropsForCells<I> = [keyof I] extends [never]
  ? NoProps
  : {
      [K in OptionalCellKeys<I>]?: Reactive<CellValue<I[K]>>;
    } & {
      [K in Exclude<keyof I, OptionalCellKeys<I>>]: Reactive<CellValue<I[K]>>;
    };

/**
 * A component that declares no props accepts none: `{}` passes, anything
 * else is an excess property error. A bare `{}` type would accept
 * anything, and an index signature would swallow JSX's `key`, so this
 * is an object type with one optional phantom member that can never be
 * set.
 */
type NoProps = { readonly __noProps?: never };

/** The `input()` fields of a class component, as the props its parent may pass. */
type InputFields<I> = {
  [K in keyof I as I[K] extends InputCell<any> ? K : never]: I[K];
};

/**
 * The props a parent passes to a component.
 *
 * For a class, its `@Input() x = input(default)` fields, all optional
 * because each has a default. For a function, the cells of its first
 * parameter. A misspelled prop is an excess property error; a prop
 * whose cell holds a `string` rejects a `number` or an
 * `Observable<number>`.
 */
export type ComponentProps<C> = C extends ClassComponent
  ? Partial<PropsForCells<InputFields<InstanceType<C>>>>
  : C extends (props: infer I, ...rest: any[]) => UiChild
    ? IsAny<I> extends true
      ? Record<string, unknown>
      : unknown extends I
        ? NoProps
        : [I] extends [undefined]
          ? NoProps
          : PropsForCells<I>
    : never;

type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

/**
 * The trailing arguments of `createComponent`: props may be omitted
 * only when the component requires none of them.
 */
export type ComponentArgs<C> =
  RequiredKeys<ComponentProps<C>> extends never
    ? [props?: ComponentProps<C>, key?: string | number]
    : [props: ComponentProps<C>, key?: string | number];

/**
 * Whether a component is a class (extends Component) rather than a
 * function. Arrow functions have no prototype; a plain function's
 * prototype is not a Component.
 */
export function isClassComponent(component: ComponentType): component is ClassComponent {
  const prototype = (component as { prototype?: unknown }).prototype;
  return prototype instanceof Component;
}

/** A value a parent passed for a prop, as the cell will hold it. */
export type Unwrapped<T> = T extends Observable<infer V> ? V : T;
