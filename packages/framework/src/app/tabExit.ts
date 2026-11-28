/**
 * Where the page's focus goes when Tab leaves an embedded application.
 *
 * The runtime decides that Tab has passed its last stop a worker round
 * trip after the key, too late for the browser's own default to move
 * focus, so the shell moves it: to the first control after the host
 * going forward, the last one before it going back. "Control" is what a
 * page's Tab visits: an element that can take focus with a `tabIndex`
 * of zero or more, enabled, and laid out. Document order only; a page
 * that orders with positive `tabindex` is asking for trouble already,
 * and the shell does not try to follow it there.
 */
const TABBABLE =
  'a[href],area[href],button,input,select,textarea,iframe,summary,audio[controls],video[controls],[contenteditable],[tabindex]';

/** `Node.DOCUMENT_POSITION_FOLLOWING`, spelled out so this reads no global. */
const FOLLOWING = 4;

/** The control beside `host` in the given direction, or null when the page has none there. */
export function tabbableBeside(host: Element, direction: 1 | -1, doc: Document): HTMLElement | null {
  let before: HTMLElement | null = null;
  for (const element of doc.querySelectorAll<HTMLElement>(TABBABLE)) {
    if (
      element.tabIndex < 0 ||
      host.contains(element) ||
      (element as HTMLElement & { disabled?: boolean }).disabled === true ||
      element.getClientRects().length === 0
    ) {
      continue;
    }
    const after = (host.compareDocumentPosition(element) & FOLLOWING) !== 0;
    if (after) {
      if (direction === 1) {
        return element;
      }
      break;
    }
    before = element;
  }
  return direction === -1 ? before : null;
}
