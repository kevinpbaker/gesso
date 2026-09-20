import { Observable, defer, distinctUntilChanged, map, of } from 'rxjs';

import { isComponentLikeElement, isObservable, type UiChild, type UiElement } from 'gesso-core';

export interface ShowProps {
  /** The condition: a cell, any Observable, or a plain value. */
  readonly when: Observable<unknown> | unknown;
  /** What to draw while it is truthy. */
  readonly children: () => UiChild;
  /** What to draw while it is not. Nothing, by default. */
  readonly otherwise?: () => UiChild;
}

/**
 * One child, while a condition holds.
 *
 *   <Show when={liked}>{() => <Icon path={ICONS.heart} />}</Show>
 *
 * `{cond && <x />}` already works when `cond` is a plain value, because
 * JSX drops a `false` child. A reactive `cond` had to become
 * `cond.pipe(map(on => (on ? [<x key="x" />] : [])))`, which is the
 * fifty-six-block idiom in the two applications, and the discontinuity
 * between the two forms is the surprise this removes.
 *
 * The child is built once, on the first frame it is shown, and kept
 * while it is shown: a condition that emits `true` again draws nothing
 * and reconciles nothing. It carries a stable key, so the node it
 * built is the node it gets back when the condition returns, and it
 * adds no node of its own: what a `Show` puts under its parent is the
 * child, or nothing, and never a wrapper that layout would have to
 * account for.
 *
 * Anything inside it that changes is bound as usual. The function is
 * not re-run when the *data* changes, only when the condition does, so
 * a `Show` whose child shows a value binds that value rather than
 * reading it.
 */
export function Show(props: ShowProps): Observable<readonly UiChild[]> {
  return show(props.when, props.children, props.otherwise);
}

/**
 * The function form of `Show`:
 *
 *   {show(liked, () => <Icon path={ICONS.heart} />)}
 */
export function show(
  when: Observable<unknown> | unknown,
  children: () => UiChild,
  otherwise?: () => UiChild
): Observable<readonly UiChild[]> {
  const condition = isObservable(when) ? (when as Observable<unknown>) : of(when);
  return defer(() => {
    let shown: readonly UiChild[] | null = null;
    let hidden: readonly UiChild[] | null = null;
    return condition.pipe(
      map(value => Boolean(value)),
      distinctUntilChanged(),
      map(on => {
        if (on) {
          shown ??= [keyed(children(), 'when')];
          return shown;
        }
        hidden ??= otherwise === undefined ? EMPTY : [keyed(otherwise(), 'otherwise')];
        return hidden;
      })
    );
  });
}

const EMPTY: readonly UiChild[] = [];

/**
 * Gives the branch its stable key, so returning to it returns to the
 * node it built. An element that named its own key keeps it.
 */
function keyed(child: UiChild, key: string): UiChild {
  if (isComponentLikeElement(child)) {
    return child.key === undefined || child.key === null ? { ...child, key } : child;
  }
  if (isObservable(child)) {
    return child;
  }
  const element = child as UiElement;
  const existing = element.props.key;
  if (existing !== undefined && existing !== null) {
    return element;
  }
  return { ...element, props: { ...element.props, key } };
}
