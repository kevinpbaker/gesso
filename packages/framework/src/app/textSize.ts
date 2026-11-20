/**
 * The browser's text-size setting, as a scale on 16 pixels.
 *
 * Chrome's "Font size", Firefox's "Size" and Safari's minimum and
 * default sizes set the size the `medium` keyword resolves to, which is
 * 16 unless a person has changed it. A page that sizes its text in
 * `rem` follows it; a canvas draws its own text and followed nothing,
 * so someone who had asked for larger text got the size the
 * application was written at. Reading `medium` off a probe, rather than
 * the root element's size, gets the setting whatever the host page's
 * own stylesheet does to its root.
 */
export function browserTextScale(doc: Document | undefined = globalThis.document): number {
  const body = doc?.body;
  const view = doc?.defaultView;
  if (body === null || body === undefined || view === null || view === undefined) {
    return 1;
  }
  const probe = doc!.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;font-size:medium;pointer-events:none';
  body.appendChild(probe);
  const size = Number.parseFloat(view.getComputedStyle(probe).fontSize);
  probe.remove();
  return size > 0 && Number.isFinite(size) ? size / 16 : 1;
}

/**
 * Calls `onChange` with the browser's text scale now, and again when it
 * may have changed. No event says it did: the setting is changed in the
 * browser's own settings page, so it is read again when the window
 * comes back to the front, which is the moment after a change.
 *
 * @returns A function that stops listening.
 */
export function observeTextScale(
  onChange: (scale: number) => void,
  view: (Window & typeof globalThis) | undefined = globalThis.window
): () => void {
  const doc = view?.document ?? globalThis.document;
  if (view === undefined || doc === undefined) {
    return () => {};
  }
  let last = Number.NaN;
  const read = (): void => {
    const scale = browserTextScale(doc);
    if (scale !== last) {
      last = scale;
      onChange(scale);
    }
  };
  read();
  const onVisible = (): void => {
    if (doc.visibilityState === 'visible') {
      read();
    }
  };
  view.addEventListener('focus', read);
  doc.addEventListener('visibilitychange', onVisible);
  return () => {
    view.removeEventListener('focus', read);
    doc.removeEventListener('visibilitychange', onVisible);
  };
}
