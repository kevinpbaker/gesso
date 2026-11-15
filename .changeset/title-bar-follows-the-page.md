---
'gesso-framework': minor
'gesso-electrobun': minor
'create-gesso-app': patch
---

A desktop window's title bar can be drawn in the appearance its page is asked for, on macOS. Give `createDesktopApp` the `bun:ffi` module (`ffi`) and each window's `nativeWindow` (Electrobun's `window.ptr`), and the frame follows the page: Light, Dark, or the system's for `auto`. The frame used to keep macOS's appearance, so a page asked for Light sat under a dark title bar whenever macOS was dark. The page's shell tells its application endpoint the appearance it is asked for (`AppLogicEndpoint.colorSchemePreference`), the remote bridge carries it, and `serveRemoteChannels` hands it to `onColorSchemePreference`. `showAppearance(window, preference, ffi)` from `gesso-electrobun/desktop` sets a window's frame directly, for an appearance that is not the page's. The Electrobun template passes both.
