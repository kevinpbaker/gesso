import type { FocusOptions } from '../input/UiFocusManager';
import { defineModifier, type UiModifier } from './UiModifier';

/**
 * Takes focus the first time the node is laid out.
 *
 * The one a dialog needs: an overlay that opens with the caret already
 * in its first field, without the component that opened it reaching
 * for a `ref` and a focus store.
 *
 * **Why the first layout and not the attach.** A modifier attaches
 * while its node is still being built, before the builder inserts it
 * into its parent, so at attach time the node has no parent and is not
 * under the focus manager's traversal root. `UiFocusManager.focus`
 * would accept it anyway (it asks whether the node is focusable, not
 * where it is), and the result would be a focused node that Tab cannot
 * reach and that no ancestor sees the focus event from. The first
 * layout is the first moment the node is demonstrably on screen, and
 * it is the same frame in every case that matters, because a node
 * mounted into a live tree is laid out on the frame that mounted it.
 *
 * It fires once. A node that is autofocused, loses focus to something
 * the person clicked, and is then laid out again does not steal the
 * focus back; that would make an autofocus a focus trap.
 *
 * A node that cannot take focus is left alone and no error is raised:
 * `focus()` refuses a node that is inert, not focusable, or outside an
 * active focus scope, which is exactly the set of cases where an
 * application would not want the focus moved either.
 */
const kind = defineModifier<FocusOptions>({
  name: 'autoFocus',
  attach(host, options) {
    let done = false;
    host.onLayout(() => {
      if (done) {
        return;
      }
      done = true;
      host.focus(options);
    });
  }
});

/**
 * One shared instance of each, so the arguments keep their identity
 * across renders and the modifier is never detached and re-attached
 * (which would autofocus a second time).
 */
const AUTO_FOCUS: UiModifier<FocusOptions> = kind({});
const AUTO_FOCUS_IN_PLACE: UiModifier<FocusOptions> = kind({ preventScroll: true });

/**
 * Takes focus the first time the node is laid out.
 *
 * The node is scrolled into view, as focus from code always is, once
 * the frame's layout has settled. Pass `{ preventScroll: true }` to
 * leave the page where it is, as `element.focus({ preventScroll: true })`
 * does: for a region focused when a page opens so a screen reader reads
 * it, where revealing it would scroll a tall region to a few pixels
 * short of its own top instead of leaving the page at its start.
 */
export function autoFocus(options: FocusOptions = {}): UiModifier<FocusOptions> {
  return options.preventScroll === true ? AUTO_FOCUS_IN_PLACE : AUTO_FOCUS;
}
