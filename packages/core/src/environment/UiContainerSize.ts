import { BehaviorSubject, distinctUntilChanged, map, type Observable } from 'rxjs';

import type { Size } from '../layout/LayoutTypes';

/**
 * A box's content size as it changes, for the things that branch on
 * it.
 *
 * The value behind `UiEnvironmentKeys.containerSize`, and deliberately
 * a *source* rather than a size. An environment value is a snapshot
 * that a subtree caches, so putting a number in one would mean
 * rebuilding the environment of everything under a container on every
 * pixel of a drag. The source object never changes identity, so the
 * environment is built once; what changes is what the source reports,
 * and only the code that asked to hear about it does any work.
 *
 * A media query is the wrong tool for this and is why the environment
 * carries the container and not the window. `observeMediaQuery` needs
 * a window, the runtime that would branch on it is usually in a
 * worker, and the question a component actually has is "how much room
 * do I have", which is not the window's width in any layout with a
 * sidebar in it.
 */
export interface UiContainerSize {
  /** The last size reported, or zeroes before the first layout. */
  readonly current: Size;
  /** Every distinct size, starting with `current`. */
  readonly changes: Observable<Size>;
}

/**
 * A container size nothing has measured yet.
 *
 * The default for the environment key, so a component that reads the
 * key outside any container gets zeroes and one emission rather than
 * an error. A layout branching on zero picks its narrowest arm, which
 * is the right guess for something whose room is unknown.
 */
export const unknownContainerSize: UiContainerSize = {
  current: { width: 0, height: 0 },
  changes: new BehaviorSubject<Size>({ width: 0, height: 0 }).asObservable()
};

/**
 * A container size a modifier feeds from the layout pass.
 *
 * `report` is called by `sizeContainer` after any frame that changed
 * the node's box; the value is deduplicated here rather than at every
 * consumer, because a scroll moves a box without resizing it and
 * reports the same numbers again.
 */
export class UiContainerSizeSource implements UiContainerSize {
  private readonly subject = new BehaviorSubject<Size>({ width: 0, height: 0 });

  get current(): Size {
    return this.subject.value;
  }

  get changes(): Observable<Size> {
    return this.subject.asObservable();
  }

  report(width: number, height: number): void {
    const previous = this.subject.value;
    if (previous.width === width && previous.height === height) {
      return;
    }
    this.subject.next({ width, height });
  }
}

/**
 * The band a width falls into, given the widths a layout switches at.
 *
 * The number the layout should be *built* from, rather than the width
 * itself: children rebuilt on every pixel of a resize would allocate a
 * subtree per frame of a drag, which is the
 * "sugar that hides cost" in the one place it would be most expensive.
 * A width of 900 against `[600, 1200]` gives 600, and every width from
 * 600 to 1199 gives the same 600, so the children are built once for
 * the whole band.
 *
 * Widths below the first breakpoint give 0, which is the band a layout
 * writes its narrowest arm for.
 */
export function bandOf(width: number, breakpoints: readonly number[]): number {
  let band = 0;
  for (const breakpoint of breakpoints) {
    if (width >= breakpoint) {
      band = breakpoint;
    }
  }
  return band;
}

/**
 * The width bands of a container, one value per band entered.
 *
 * What `Responsive` builds its children from, and what an author who
 * wants only a number rather than a subtree can subscribe to directly.
 */
export function containerBands(size: UiContainerSize, breakpoints: readonly number[]): Observable<number> {
  return size.changes.pipe(
    map(measured => bandOf(measured.width, breakpoints)),
    distinctUntilChanged()
  );
}
