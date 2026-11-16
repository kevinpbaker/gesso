---
'gesso-framework': minor
'gesso-electrobun': patch
'create-gesso-app': patch
---

A screen in a desktop window can ask for `light` or `dark`, and the main process's appearance no longer overrides it. The shells have `setPlatformColorScheme(scheme)`: what `auto` follows in place of `prefers-color-scheme`, once a host has reported it. It leaves the preference alone. The Electrobun template and the desktop guide now pass the bridge's `onColorScheme` to it. They passed it to `setColorScheme`, so each report from the main process replaced what the screen had asked for through `ShellService.preferColorScheme`. `createDesktopApp` draws the title bar of a page asked for `auto` in the appearance `colorScheme` last pushed, which is the page's appearance, and in the system's only when there is no `colorScheme`.
