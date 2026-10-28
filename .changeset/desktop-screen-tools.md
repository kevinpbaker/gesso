---
'gesso-electrobun': patch
'gesso-framework': patch
---

A desktop app's agents get `tokens_view` and `render_frame` from its windows, as a dev server's do. The relay from a window to the main process let through only tools named `ui_*`, so the two newer screen tools never crossed; it now lets through the screen's tools by name (`SCREEN_TOOL_NAMES`). `createScreenAgent({ windowChannels: true })` lets the window's channels through as well, for an application whose state lives in its window, and takes a `confirm` for their `@confirm` commands.

`renderRoot(App).loadModulesWith(load)` says how `render_frame` loads the module an agent names, for an application whose modules are served from somewhere other than its own root, such as an editor serving the project it designs from another folder.
