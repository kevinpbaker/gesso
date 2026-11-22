---
'gesso-framework': patch
'gesso-vite-plugin': patch
---

`render_frame` draws the theme it says it drew. A root that picks its theme from `ShellService.colorScheme`, as every new project's does, drew light whatever was asked, while the answer said dark; the frame's shell now reports the scheme asked for (`renderFrame`'s new `colorScheme`). A frame given a height that drew nothing but its background says so (`RenderedFrame.blank`), as one with no height already did. In a dev server, a component of the project drawn without an input it requires is refused before it is drawn, naming the input: the issue tracker's `NewIssueDialog` drew as an empty frame because nobody passed `open`.
