/**
 * Enters or leaves fullscreen on an element, across the prefixes that
 * are still out there.
 *
 * Deliberately fire-and-forget. `requestFullscreen` returns a promise
 * that rejects when the browser refuses -- it only grants fullscreen
 * during a gesture -- and there is nothing useful to do about that
 * here: whether it worked is reported back by the `fullscreenchange`
 * event, which is also the only thing that hears about the person
 * pressing Escape.
 */
export function setElementFullscreen(element: Element, enter: boolean): void {
  const document = documentOf(element);
  if (document === null) {
    return;
  }
  const anyDocument = document as Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => void;
  };
  if (enter) {
    const target = element as Element & { webkitRequestFullscreen?: () => void };
    try {
      if (typeof target.requestFullscreen === 'function') {
        void target.requestFullscreen().catch(() => {});
      } else {
        target.webkitRequestFullscreen?.();
      }
    } catch {
      // Refused, which the change event will confirm by not firing.
    }
    return;
  }
  try {
    if (typeof document.exitFullscreen === 'function') {
      void document.exitFullscreen().catch(() => {});
    } else {
      anyDocument.webkitExitFullscreen?.();
    }
  } catch {
    // Already out of it.
  }
}

/**
 * The document an element belongs to, or null where there is not one.
 *
 * A canvas double in a spec has no `ownerDocument`, and neither has an
 * `OffscreenCanvas`. Falling back to the ambient `document` covers the
 * first case where a real one exists, and answering null covers the
 * rest: fullscreen is a thing a page has, and somewhere without a page
 * should decline rather than throw.
 */
function documentOf(element: Element): Document | null {
  const owner = (element as Partial<Element>).ownerDocument ?? null;
  if (owner !== null && typeof owner.addEventListener === 'function') {
    return owner;
  }
  const ambient = typeof globalThis.document === 'undefined' ? null : globalThis.document;
  return ambient !== null && typeof ambient.addEventListener === 'function' ? ambient : null;
}

/** Whether anything in the element's document is currently fullscreen. */
export function isDocumentFullscreen(element: Element): boolean {
  const document = documentOf(element) as (Document & { webkitFullscreenElement?: Element | null }) | null;
  if (document === null) {
    return false;
  }
  return (document.fullscreenElement ?? document.webkitFullscreenElement ?? null) !== null;
}

/** Calls back whenever the document enters or leaves fullscreen. */
export function observeFullscreen(element: Element, onChange: (active: boolean) => void): () => void {
  const document = documentOf(element);
  if (document === null) {
    return () => {};
  }
  const report = (): void => onChange(isDocumentFullscreen(element));
  document.addEventListener('fullscreenchange', report);
  document.addEventListener('webkitfullscreenchange', report);
  return () => {
    document.removeEventListener('fullscreenchange', report);
    document.removeEventListener('webkitfullscreenchange', report);
  };
}

/**
 * The box an application should lay itself out in, given whether its
 * canvas is currently filling the screen.
 *
 * **A `ResizeObserver` on the host does not see this happen**, and
 * that is the whole reason this exists. The fullscreen API lifts the
 * *canvas* out of the page and stretches it to the screen; the host
 * around it keeps the size it always had, so the observer never fires,
 * the runtime keeps laying out at the old size, and the browser scales
 * the result up. The picture looks right, and every coordinate is
 * wrong by the ratio between the two: a press near the bottom of a
 * fullscreen clip lands somewhere near the middle of the layout.
 *
 * So the size is read from the canvas while it is fullscreen and from
 * the host when it is not. On the way *out* the canvas has not been
 * put back yet when the event fires, which is why the host is the
 * right answer there rather than simply always asking the canvas.
 */
export function surfaceBox(canvas: Element, host: Element, active: boolean): { width: number; height: number } | null {
  const box = (active ? canvas : host).getBoundingClientRect();
  return box.width > 0 && box.height > 0 ? { width: box.width, height: box.height } : null;
}

/**
 * Runs a callback once the browser has actually applied the new
 * geometry.
 *
 * `fullscreenchange` fires *before* the new size is in the layout, so
 * reading a box from inside it gives the size the element had a moment
 * ago. Measured here: entering fullscreen reported the canvas as its
 * old preview size, the surface stayed that size, and the browser
 * stretched it to the screen, which is precisely the thing
 * `surfaceBox` exists to prevent. Two frames, because the first is the
 * one the change lands on.
 */
export function afterLayout(run: () => void): void {
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    run();
    return;
  }
  globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(run));
}
