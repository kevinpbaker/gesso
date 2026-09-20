import { Observable, defer, distinctUntilChanged, map, of } from 'rxjs';

import { isComponentLikeElement, isObservable, type UiChild, type UiElement } from 'gesso-core';

/**
 * What gives a row its identity: the name of a field holding it, or a
 * function returning it. Omitting it keys by index, which is what the
 * builder falls back to and what `each` warns about.
 */
export type EachKey<T> = (keyof T & string) | ((item: T, index: number) => string | number);

export interface EachProps<T> {
  /** The list: a cell, any Observable of one, or a plain array. */
  readonly of: Observable<readonly T[]> | readonly T[];
  /** Identity per row. See `EachKey`. */
  readonly by?: EachKey<T>;
  /** What one row draws as. */
  readonly children: (item: T, index: number) => UiChild;
}

/**
 * A keyed list.
 *
 *   <Each of={rows} by="id">{row => <Row row={row} />}</Each>
 *
 * The `map`, the change check and the keying, which every screen in
 * both applications wrote by hand: forty blocks of
 * `map(items => items.map(item => <Row key={item.id} />))`, each of
 * which rebuilt every row's element on every emission of the list.
 *
 * A row's element is built once and kept while the row is in the list
 * and its value has not changed, so a list that re-emits equal data
 * builds nothing and reconciles nothing: the result is the same array,
 * and the change check downstream ends the emission there. A row whose
 * value changed is rebuilt alone; the key keeps its node and its
 * component instance, so only what changed is written.
 *
 * `key` is set from `by` on the element the function returns, so a row
 * component is written without one. An element that carries its own key
 * keeps it.
 *
 * `LazyColumn` is the same shape for a list long enough that only the
 * visible rows should exist. This is the short-list case, and the two
 * read alike on purpose.
 */
export function Each<T>(props: EachProps<T>): Observable<readonly UiChild[]> {
  return each(props.of, props.by, props.children);
}

/**
 * The function form of `Each`, for a list built outside a tag:
 *
 *   const rows = each(tracks, 'id', track => <ItemRow item={track} />);
 */
export function each<T>(
  source: Observable<readonly T[]> | readonly T[],
  by: EachKey<T> | undefined,
  render: (item: T, index: number) => UiChild
): Observable<readonly UiChild[]> {
  const keyOf = keyFunction(by);
  const dynamic = isObservable(source);
  const items = dynamic ? (source as Observable<readonly T[]>) : of(source as readonly T[]);
  if (by === undefined && dynamic) {
    warnIndexKeyed(render);
  }
  // Whether the row function took the index. One that did not is
  // unaffected by its row moving, so a reorder or a removal reuses
  // every element it already built; one that did has to be asked again
  // for a row that moved, since the index is part of what it drew.
  const positional = render.length >= 2;
  return defer(() => {
    const held = new Map<string | number, Row<T>>();
    let previous: readonly UiChild[] | null = null;
    let generation = 0;
    return items.pipe(
      map(list => {
        previous = reconcile(held, previous, ++generation, list, keyOf, render, positional);
        return previous;
      }),
      distinctUntilChanged()
    );
  });
}

/** One row's element, and what it was built from. */
interface Row<T> {
  item: T;
  index: number;
  child: UiChild;
  /** The pass that last saw this key; anything older has left the list. */
  generation: number;
}

/**
 * Builds the children for one emission, reusing every row it can.
 *
 * The result is the previous array itself when nothing about the list
 * changed, so the `distinctUntilChanged` above it ends the emission and
 * the builder is never entered. A new array is allocated at the first
 * row that differs and not before, which is what keeps an unchanged
 * emission free rather than merely cheap.
 */
function reconcile<T>(
  held: Map<string | number, Row<T>>,
  previous: readonly UiChild[] | null,
  generation: number,
  list: readonly T[],
  keyOf: (item: T, index: number) => string | number,
  render: (item: T, index: number) => UiChild,
  positional: boolean
): readonly UiChild[] {
  let next: UiChild[] | null = null;
  for (let index = 0; index < list.length; index++) {
    const item = list[index] as T;
    const key = keyOf(item, index);
    const row = held.get(key);
    if (row !== undefined && row.generation === generation) {
      throw new Error(`Duplicate key '${String(key)}' in a list: two rows claim the same identity.`);
    }
    let child: UiChild;
    if (row !== undefined && Object.is(row.item, item) && (!positional || row.index === index)) {
      child = row.child;
      row.index = index;
      row.generation = generation;
    } else {
      child = keyed(render(item, index), key);
      if (row === undefined) {
        held.set(key, { item, index, child, generation });
      } else {
        row.item = item;
        row.index = index;
        row.child = child;
        row.generation = generation;
      }
    }
    if (next === null && (previous === null || index >= previous.length || previous[index] !== child)) {
      next = previous === null ? [] : previous.slice(0, index);
    }
    next?.push(child);
  }
  for (const [key, row] of held) {
    if (row.generation !== generation) {
      held.delete(key);
    }
  }
  if (next === null && previous !== null && previous.length !== list.length) {
    // Nothing before the end changed and the list got shorter: the
    // rows that remain are the ones already in `previous`.
    next = previous.slice(0, list.length);
  }
  return next ?? previous ?? EMPTY;
}

const EMPTY: readonly UiChild[] = [];

function keyFunction<T>(by: EachKey<T> | undefined): (item: T, index: number) => string | number {
  if (by === undefined) {
    return (_item, index) => index;
  }
  if (typeof by === 'function') {
    return by;
  }
  return item => (item as Record<string, unknown>)[by] as string | number;
}

/**
 * Puts the row's key on the element the render function returned.
 *
 * An element that named its own key keeps it, since the author meant
 * something by it. An observable row cannot carry one at all: its
 * fragment anchor is identified by position, so a list of them
 * reorders wrongly, and it is worth saying so rather than leaving a
 * reorder to look like corruption.
 */
function keyed(child: UiChild, key: string | number): UiChild {
  if (isComponentLikeElement(child)) {
    return child.key === undefined || child.key === null ? { ...child, key } : child;
  }
  if (isObservable(child)) {
    throw new Error(
      `A row of a list is an observable, which cannot carry the key '${String(key)}'. ` +
        `Return an element or a component from the row function and bind the observable inside it.`
    );
  }
  const element = child as UiElement;
  const existing = element.props.key;
  if (existing !== undefined && existing !== null) {
    return element;
  }
  return { ...element, props: { ...element.props, key } };
}

/** Said once: every unkeyed list has the same problem and the same fix. */
let warnedAboutIndexKeys = false;

function warnIndexKeyed(render: (item: never, index: number) => UiChild): void {
  if (warnedAboutIndexKeys) {
    return;
  }
  warnedAboutIndexKeys = true;
  const what = render.name === '' ? 'a list' : `the list drawn by '${render.name}'`;
  console.warn(
    `${what} is keyed by index, because \`each\` was given no \`by\`. A row inserted or removed ` +
      `anywhere but the end then shifts every row after it onto a different node: state moves between rows, ` +
      `a text field keeps the wrong value, and an animation runs on the wrong element. ` +
      `Pass \`by\` naming what identifies a row: by="id", or by={row => row.id}.`
  );
}
