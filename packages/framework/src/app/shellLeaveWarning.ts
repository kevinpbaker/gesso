/**
 * The shell's half of `ShellService.warnOnLeave`: a `beforeunload`
 * listener on the window while the application says leaving would lose
 * work, and none otherwise.
 *
 * Both hosts answer the request — `WorkerApp` when it arrives as a
 * message, `GessoApp` when the runtime hands it over on the same
 * thread — through here. None otherwise matters as much as the
 * listener: a browser does not keep a page that has a `beforeunload`
 * listener in its back/forward cache, so a page that only ever turned
 * the warning on would lose the cache for good.
 */
type LeaveTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

const listening = new WeakMap<LeaveTarget, (event: Event) => void>();

export function setLeaveWarning(view: LeaveTarget | null | undefined, on: boolean): void {
  if (view === null || view === undefined) {
    return;
  }
  const listener = listening.get(view);
  if (on && listener === undefined) {
    const warn = (event: Event): void => {
      // `preventDefault` is the standard; `returnValue` is what browsers
      // before it asked for. The text is the browser's own either way.
      event.preventDefault();
      (event as BeforeUnloadEvent).returnValue = '';
    };
    listening.set(view, warn);
    view.addEventListener('beforeunload', warn);
  } else if (!on && listener !== undefined) {
    listening.delete(view);
    view.removeEventListener('beforeunload', listener);
  }
}
