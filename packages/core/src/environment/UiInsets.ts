import { BehaviorSubject, type Observable } from 'rxjs';

/** Space along each edge that something else has taken. */
export interface UiInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** One edge of a box, named physically. */
export type UiInsetEdge = 'top' | 'right' | 'bottom' | 'left';

export const noInsets: UiInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function insetsEqual(a: UiInsets, b: UiInsets): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

/**
 * What is in the way of the content, and how much of it there is.
 *
 * The value behind `UiEnvironmentKeys.insets`, and a source for the
 * same reason `UiContainerSize` is: the numbers change while a
 * keyboard slides up, and an environment value that changed with them
 * would rebuild the environment of the whole screen forty times.
 *
 * Three quite different things end up on the same four numbers, which
 * is the point of having them: the platform's safe area (a notch, a
 * home indicator, a window's rounded corner), the soft keyboard, and
 * whatever the application itself has floating over its own content.
 * A screen that keeps its last row clear of all three should not have
 * to know which of the three it is clearing, and before this every
 * Segue screen knew about exactly one of them by name and about the
 * height of the bar that caused it.
 */
export interface UiInsetSource {
  /** The largest contribution on each edge, as it stands. */
  readonly current: UiInsets;
  /** Every distinct set of insets, starting with `current`. */
  readonly changes: Observable<UiInsets>;
}

/**
 * The insets in force, gathered from everything that publishes one.
 *
 * Contributions compose by **maximum per edge, not by sum**. Two
 * things over the same edge overlap far more often than they stack: a
 * bar drawn across the home indicator already covers the safe area
 * under it, and a soft keyboard that pushes a bar up covers it too.
 * Adding them would push the content clear of a strip nothing is
 * occupying, and nobody would notice until the keyboard was open on a
 * phone. A publisher whose bar genuinely sits on top of another one
 * publishes the total it occupies, because it is the only thing that
 * knows.
 *
 * Publishing is by handle, and the handle retracts. That is what makes
 * this usable from a modifier: the bar's contribution goes away when
 * the bar unmounts, without the registry knowing what a bar is.
 */
export class UiInsetRegistry implements UiInsetSource {
  private readonly contributions = new Map<symbol, UiInsets>();
  private readonly subject = new BehaviorSubject<UiInsets>(noInsets);

  get current(): UiInsets {
    return this.subject.value;
  }

  get changes(): Observable<UiInsets> {
    return this.subject.asObservable();
  }

  /**
   * Publishes one contributor's insets, replacing whatever it
   * published before. The returned function retracts them.
   */
  publish(insets: Partial<UiInsets>): (next?: Partial<UiInsets>) => void {
    const token = Symbol('inset');
    const write = (next?: Partial<UiInsets>): void => {
      if (next === undefined) {
        this.contributions.delete(token);
      } else {
        this.contributions.set(token, { ...noInsets, ...next });
      }
      this.recompute();
    };
    write(insets);
    return write;
  }

  private recompute(): void {
    let top = 0;
    let right = 0;
    let bottom = 0;
    let left = 0;
    for (const contribution of this.contributions.values()) {
      top = Math.max(top, contribution.top);
      right = Math.max(right, contribution.right);
      bottom = Math.max(bottom, contribution.bottom);
      left = Math.max(left, contribution.left);
    }
    const next: UiInsets = { top, right, bottom, left };
    if (!insetsEqual(this.subject.value, next)) {
      this.subject.next(next);
    }
  }
}

/**
 * The insets a thread that has a window can see, as plain numbers.
 *
 * Both halves come from the same place. `visualViewport` reports the
 * part of the page the person can actually see, so the strip a soft
 * keyboard covers is `layoutViewport.height - visualViewport.height`
 * once the offset is taken off; the safe area comes from the four
 * `env(safe-area-inset-*)` values, read off a probe element because
 * `env()` is only legal in CSS.
 *
 * **Shell side, and only shell side.** `visualViewport` needs a
 * window, and the runtime that decides what to do about a keyboard is
 * usually in a worker. What crosses the boundary is these four
 * numbers, which is the rule `decisions/0030-thread-model.md` states:
 * the shell holds what only it can hold and posts plain data, and
 * every decision about the data is taken on the far side. Nothing
 * here reads a Gesso object, and the caller passes what it hears to
 * `UiInsetRegistry.publish`.
 *
 * Reports once immediately as well as on change, for the same reason
 * `observeMediaQuery` does: a keyboard that is already open, or a
 * phone whose notch has been there all along, sends no event.
 *
 * Returns a function that stops watching. Where there is no
 * `visualViewport` it reports zeroes once and stops, which is the
 * honest answer on a desktop window with no notch.
 */
export function observeViewportInsets(onChange: (insets: UiInsets) => void): () => void {
  const view = globalThis as {
    visualViewport?: VisualViewportLike;
    innerHeight?: number;
    getComputedStyle?: (element: object) => { getPropertyValue(name: string): string };
    document?: DocumentLike;
  };
  const viewport = view.visualViewport;
  if (viewport === undefined) {
    onChange(noInsets);
    return () => {};
  }
  let last: UiInsets | null = null;
  const report = (): void => {
    const safeArea = readSafeArea(view);
    // What the keyboard covers: the room the layout thinks it has,
    // less the room that is actually visible, less how far the page
    // has been scrolled up out of the way to make room.
    const covered = Math.max(0, (view.innerHeight ?? viewport.height) - viewport.height - viewport.offsetTop);
    const next: UiInsets = {
      top: safeArea.top,
      right: safeArea.right,
      bottom: Math.max(safeArea.bottom, covered),
      left: safeArea.left
    };
    if (last === null || !insetsEqual(last, next)) {
      last = next;
      onChange(next);
    }
  };
  report();
  viewport.addEventListener('resize', report);
  viewport.addEventListener('scroll', report);
  return () => {
    viewport.removeEventListener('resize', report);
    viewport.removeEventListener('scroll', report);
  };
}

/** Only the parts of `VisualViewport` this reads, so core needs no DOM lib. */
interface VisualViewportLike {
  readonly height: number;
  readonly offsetTop: number;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface DocumentLike {
  readonly documentElement?: object;
}

/**
 * The four `env(safe-area-inset-*)` values, in pixels.
 *
 * Read off the document element's computed style through four custom
 * properties, which is the only way to get at `env()` from script: the
 * page's stylesheet has to declare `--gesso-safe-area-top: env(...)`
 * for these to be anything but empty, and an application that has not
 * declared them gets zeroes rather than a failure. That is the same
 * bargain the template's stylesheet strikes for the colour scheme.
 */
function readSafeArea(view: {
  getComputedStyle?: (element: object) => { getPropertyValue(name: string): string };
  document?: DocumentLike;
}): UiInsets {
  const element = view.document?.documentElement;
  if (element === undefined || typeof view.getComputedStyle !== 'function') {
    return noInsets;
  }
  const style = view.getComputedStyle(element);
  return {
    top: pixels(style.getPropertyValue('--gesso-safe-area-top')),
    right: pixels(style.getPropertyValue('--gesso-safe-area-right')),
    bottom: pixels(style.getPropertyValue('--gesso-safe-area-bottom')),
    left: pixels(style.getPropertyValue('--gesso-safe-area-left'))
  };
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
