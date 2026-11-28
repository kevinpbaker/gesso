---
'gesso-core': minor
'gesso-framework': minor
'gesso-react': minor
---

A Gesso app can be one panel of a page that is not Gesso's. `embedSurface(element, options)` from the new `gesso-framework/embed` entry mounts an app with the defaults a shared page needs: history in memory, so the page keeps its address bar; the title and the leave warning sent to `onTitle` and `onLeaveWarning`, so the page keeps its own; and Tab able to leave. `hostChannels` serves channels from the page's own thread, its state as their views and its callbacks as their commands, alone or in front of an application worker that serves the rest. The new `gesso-react` package is the same as a component and a hook: `<GessoSurface>` mounts and disposes the app with the component, and `useHostChannel` gives it a component's props and callbacks.

Tab can leave an app at either end of its tab order. `createApp({ tabExit: true })` moves the page's focus to the control beside the host when Tab passes the app's last stop, or Shift+Tab its first, and Tab from the page lands on the app's first or last stop. It used to wrap inside the app, which in a page with other controls was a keyboard trap. A trap such as a dialog still wraps. `UiFocusManager.edgeExit` and `GessoRuntime.onTabExit` are the runtime's half. `createApp` also takes `onTitle` and `onLeaveWarning`, for any app whose page is not its own.
