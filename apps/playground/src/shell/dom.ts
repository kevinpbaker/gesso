/**
 * Small DOM helpers shared by the shell and the routes.
 *
 * These replace five near-identical private `requireElement`
 * implementations that each queried `document` globally. Scoping the
 * lookup to a root element matters now that routes are swapped in
 * place: a stale node from the outgoing route can still be in the
 * document when the incoming one looks up its own elements.
 */

import { prepareInputSurface } from '@gesso/core';

/**
 * Finds a required descendant, throwing a located error if it is
 * missing rather than returning null for a caller to trip over later.
 */
export function requireElement<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Playground element '${selector}' not found.`);
  }
  return element;
}

/** Creates an element, assigning class, text and attributes in one call. */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    className?: string;
    text?: string;
    attrs?: Record<string, string>;
  } = {}
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options.className !== undefined) {
    element.className = options.className;
  }
  if (options.text !== undefined) {
    element.textContent = options.text;
  }
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    element.setAttribute(name, value);
  }
  return element;
}

/**
 * Creates the canvas the renderer routes draw into.
 *
 * Every one of them needs the same three non-obvious settings:
 * `tabIndex` so the canvas can hold keyboard focus, the surface styles
 * that stop the browser treating it as a document (`prepareInputSurface`
 * says which and why), and the `pg-canvas` class for sizing. Getting one
 * wrong produces a subtly dead input surface, so they live in one place.
 */
export function createPreviewCanvas(parent: HTMLElement, options: { focusable?: boolean } = {}): HTMLCanvasElement {
  const canvas = createElement('canvas', { className: 'pg-canvas' });
  if (options.focusable !== false) {
    canvas.tabIndex = 0;
  }
  prepareInputSurface(canvas);
  parent.appendChild(canvas);
  return canvas;
}

export interface SizeObservation {
  /**
   * Re-invokes the callback with the element's current content box.
   *
   * A backend that acquires its device asynchronously needs this. The
   * observer delivers its first size long before a GPU adapter
   * resolves, so the only size the backend was told about arrived
   * while it was still unable to act on it. Calling this once the
   * backend is ready re-applies that size at a point where it takes
   * effect, instead of leaving the route waiting for whatever
   * incidental later resize happens to come along.
   */
  remeasure(): void;
  /** Stops observing. */
  stop(): void;
}

/**
 * Observes an element's content box, invoking `onResize` only for
 * non-degenerate sizes.
 *
 * Every route previously wrote this same loop, and every one of them
 * needed the same guard: a hidden or not-yet-laid-out preview reports
 * 0x0, and relaying out a tree to zero throws away all its measured
 * sizes for nothing.
 */
export function observeSize(target: HTMLElement, onResize: (width: number, height: number) => void): SizeObservation {
  const deliver = (width: number, height: number): void => {
    if (width > 0 && height > 0) {
      onResize(width, height);
    }
  };
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      deliver(width, height);
    }
  });
  observer.observe(target);

  return {
    remeasure() {
      // clientWidth/Height exclude the border and any scrollbar but
      // include padding, so the padding is subtracted to match the
      // content box the observer reports.
      const style = getComputedStyle(target);
      const width = target.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
      const height = target.clientHeight - parseFloat(style.paddingTop || '0') - parseFloat(style.paddingBottom || '0');
      deliver(width, height);
    },
    stop: () => observer.disconnect()
  };
}
