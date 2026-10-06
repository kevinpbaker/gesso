import type { UiKeyModifiers, UiPointerEvent } from 'gesso-core';

import { buildPath, formatUrl, type RouterService, type RouteTarget, type ShellService } from 'gesso-framework';

/**
 * Following an in-app link: in place, or somewhere new.
 *
 * `Link` and `Breadcrumb` both draw links that may name a destination
 * inside the application, and both answer a Cmd-click the way a
 * browser answers one on an anchor. The rules live here once so the
 * two cannot drift apart.
 */

/**
 * Whether a press asks for its destination somewhere new.
 *
 * **Either Command or Control**, on every platform. That is the choice
 * `UiShortcuts` makes for `Mod`, and for the same reason: the render
 * thread is a worker with no reliable answer to which platform it is
 * on, and a guess from the user agent would be wrong for a Mac
 * keyboard on a Linux machine. Accepting both costs one thing worth
 * knowing: on a Mac, Control-click is the system's secondary click,
 * and a browser opens a context menu for it on an anchor. Here the
 * press arrives as a primary click with Control held, and it opens the
 * destination somewhere new instead.
 *
 * Shift and Alt are left alone. A browser gives Shift-click a new
 * window and Alt-click a download, and neither has a meaning inside a
 * canvas application that this could honour.
 */
export function opensElsewhere(modifiers: UiKeyModifiers): boolean {
  return modifiers.meta || modifiers.ctrl;
}

/**
 * Remembers whether the press a click ends was made with the middle
 * button.
 *
 * A Click event cannot say: it is dispatched on release, and carries
 * the buttons held at the release, which is none. The PointerDown that
 * started the press carries them, so `onPointerDown` notes it and
 * `take` hands it to the click and forgets it, and a keyboard
 * activation later never inherits a middle press from before it.
 *
 * A middle press is the DOM's button 4 alone. Pressed with another
 * button, it is a chord and not a request for a new tab.
 */
export function middlePress(): { onPointerDown: (event: UiPointerEvent) => void; take: () => boolean } {
  let middle = false;
  return {
    onPointerDown: event => {
      middle = event.buttons === MIDDLE_BUTTON;
    },
    take: () => {
      const was = middle;
      middle = false;
      return was;
    }
  };
}

/**
 * Goes to `to`: the router navigates in place, or the shell is asked to
 * open the app there somewhere new and the current screen stays.
 */
export function followRoute(
  to: string | RouteTarget,
  elsewhere: boolean,
  router: RouterService,
  shell: ShellService
): void {
  const url = urlOf(to);
  if (elsewhere) {
    shell.openRoute(url);
  } else {
    router.navigate(url);
  }
}

/** A target's url, as `RouterService.go` would build it. */
function urlOf(to: string | RouteTarget): string {
  return typeof to === 'string' ? to : formatUrl(buildPath(to.route.path, to.params), to.query);
}

/** The DOM's `buttons` bit for the middle button. */
const MIDDLE_BUTTON = 4;
