import type { Observable } from 'rxjs';

import {
  type BoxProps,
  type ButtonProps,
  type ColumnProps,
  type GridProps,
  type RowProps,
  type ScrollViewProps,
  type StackProps,
  type TextProps
} from '../../ui/composition/UiElementProps';
import type { ComponentLikeElement, UiChild, UiElement } from '../../ui/composition/UiElement';
import { createElement } from '../../ui/composition/UiFactory';
import type { UiProps } from '../../ui/composition/UiProps';
import { UiNodeType } from '../../ui/graph/UiNodeType';
import type { Component } from '../Component';
import type { InputCell } from '../Input';
import { createComponent } from '../createComponent';
import type { ClassComponent, ComponentContext, ComponentProps, ComponentType } from '../FunctionComponent';

/**
 * The JSX runtime: `<row gap={8}>…</row>` compiles to
 * `jsx('row', { gap: 8, children: … })`, which calls `createElement`;
 * `<Counter label="x" />` calls `createComponent`. There is no virtual
 * DOM and nothing is diffed here — the output is the same UiElement /
 * ComponentElement the factory API produces, so JSX costs nothing at
 * runtime and the two surfaces can be mixed freely.
 *
 * Enabled per project with
 *
 *   "jsx": "react-jsx", "jsxImportSource": "nodal"
 *
 * in tsconfig (the repository maps `nodal/jsx-runtime` to this file).
 *
 * Intrinsic tags are the element factories in lowercase: `text`,
 * `button`, `box`, `stack`, `row`, `column`, `scrollview`, `grid`.
 * A `text` or `button` with a string (or Observable string) child
 * takes it as its `text` prop.
 */

/** What may appear between tags: children, or nothing (for conditionals). */
export type JsxChild = UiChild | string | number | boolean | null | undefined;
export type JsxChildren = JsxChild | readonly JsxChildren[];

type WithChildren<P, C = JsxChildren> = P & { children?: C };

/** A text child: a string, or an Observable of one. */
type TextChildren = string | number | Observable<string | number>;

const INTRINSIC_TYPES = {
  text: UiNodeType.Text,
  button: UiNodeType.Button,
  box: UiNodeType.Box,
  stack: UiNodeType.Box,
  row: UiNodeType.Row,
  column: UiNodeType.Column,
  scrollview: UiNodeType.ScrollView,
  grid: UiNodeType.Grid
} as const satisfies Record<string, UiNodeType>;

export type IntrinsicTag = keyof typeof INTRINSIC_TYPES;

export namespace JSX {
  export type Element = UiElement | ComponentLikeElement;

  /** Anything a tag may name. */
  export type ElementType = IntrinsicTag | ComponentType;

  /** A class usable as a tag; `Component` satisfies it. */
  export interface ElementClass {
    render(): UiChild;
  }

  /** `key` is accepted on every tag and is never a prop. */
  export interface IntrinsicAttributes {
    key?: string | number;
  }

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicElements {
    text: WithChildren<TextProps, TextChildren>;
    button: WithChildren<ButtonProps, JsxChildren | TextChildren>;
    box: WithChildren<BoxProps>;
    stack: WithChildren<StackProps>;
    row: WithChildren<RowProps>;
    column: WithChildren<ColumnProps>;
    scrollview: WithChildren<ScrollViewProps>;
    grid: WithChildren<GridProps>;
  }

  /**
   * The attributes a component tag takes: computed from the component
   * itself — a class's `input()` fields or a function's `Inputs<P>`
   * parameter — exactly as `createComponent` types them.
   *
   * TypeScript consults this for intrinsic tags too, handing them in
   * as a synthetic `(props: IntrinsicElements[tag]) => Element`
   * signature. That looks like a functional component, so the check
   * is on the parameter: only a record of input cells is one. Anything
   * else keeps `P`, the attributes TypeScript already found.
   */
  export type LibraryManagedAttributes<C, P> = C extends ClassComponent
    ? ComponentProps<C>
    : C extends (props: infer I, ...rest: any[]) => UiChild
      ? unknown extends I
        ? ComponentProps<C>
        : I extends Record<string, InputCell<any>>
          ? ComponentProps<C>
          : P
      : P;
}

type JsxProps = Record<string, unknown> & { children?: JsxChildren };

/**
 * Creates one element. `key` arrives separately, as the compiler
 * passes it; `children` arrives inside props.
 */
export function jsx(type: JSX.ElementType, props: JsxProps | null, key?: string | number): JSX.Element {
  const { children, ...rest } = props ?? {};
  if (typeof type === 'string') {
    return intrinsic(type, rest, children, key);
  }
  if (typeof type !== 'function') {
    throw new Error(`JSX tag must be an intrinsic name or a component, got ${describe(type)}.`);
  }
  if (children !== undefined) {
    throw new Error(
      `Component '${(type as { name?: string }).name ?? 'anonymous'}' received JSX children. ` +
        `Components take inputs, not children; pass them as a prop.`
    );
  }
  return createComponent(type as ClassComponent, rest as ComponentProps<ClassComponent>, key);
}

/** The compiler's variant for static child lists; identical here. */
export const jsxs = jsx;

/**
 * Development-mode entry (`jsxDEV`), used by Vite in dev. The extra
 * arguments describe the source location and are not needed.
 */
export function jsxDEV(type: JSX.ElementType, props: JsxProps | null, key?: string | number): JSX.Element {
  return jsx(type, props, key);
}

/**
 * `<>…</>` has no node to become. Children of a fragment are spliced
 * into the parent, so it can only be used where a list of children is
 * accepted — which is every container tag.
 */
export function Fragment(_props: { children?: JsxChildren }): never {
  throw new Error('JSX fragments are not supported: return a list of elements, or wrap them in a container tag.');
}

function intrinsic(
  tag: string,
  props: Record<string, unknown>,
  children: JsxChildren,
  key?: string | number
): UiElement {
  const type = (INTRINSIC_TYPES as Record<string, UiNodeType | undefined>)[tag];
  if (type === undefined) {
    throw new Error(
      `Unknown JSX tag '${tag}'. Intrinsic tags are ${Object.keys(INTRINSIC_TYPES)
        .map(name => `'${name}'`)
        .join(', ')}.`
    );
  }
  const elementProps: UiProps = key !== undefined ? { ...props, key } : props;
  if ((type === UiNodeType.Text || type === UiNodeType.Button) && isTextChild(children)) {
    if (elementProps.text !== undefined) {
      throw new Error(`<${tag}> has both a text prop and a text child; use one.`);
    }
    return createElement(
      type,
      { ...elementProps, text: typeof children === 'number' ? String(children) : children },
      []
    );
  }
  return createElement(type, elementProps, flattenChildren(children));
}

/**
 * Inside <text> and <button> a single string, number or Observable
 * child is the label. An Observable cannot be told apart from an
 * observable child list at runtime, so the rule is by tag: these two
 * take it as text, and a button whose children are observable elements
 * wraps them in a container tag.
 */
function isTextChild(value: JsxChildren | TextChildren): value is TextChildren {
  return typeof value === 'string' || typeof value === 'number' || isObservableValue(value);
}

function isObservableValue(value: unknown): value is Observable<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as Observable<unknown>).subscribe === 'function';
}

/**
 * Nested arrays are flattened and `null`, `undefined` and booleans are
 * dropped, so `{cond && <text/>}` and `{items.map(…)}` both work.
 */
function flattenChildren(children: JsxChildren, out: UiChild[] = []): UiChild[] {
  if (children === null || children === undefined || typeof children === 'boolean') {
    return out;
  }
  if (Array.isArray(children)) {
    for (const child of children as readonly JsxChildren[]) {
      flattenChildren(child, out);
    }
    return out;
  }
  if (typeof children === 'string' || typeof children === 'number') {
    throw new Error(
      `A bare string child ('${String(children)}') is only allowed inside <text> or <button>. Wrap it: <text>{…}</text>.`
    );
  }
  out.push(children as UiChild);
  return out;
}

function describe(value: unknown): string {
  return value === null ? 'null' : typeof value === 'object' ? 'an object' : `a ${typeof value}`;
}

export type { Component, ComponentContext };
