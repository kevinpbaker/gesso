---
'gesso-core': minor
'gesso-framework': minor
---

Text follows the browser's text-size setting. A person who set their browser's text size to 20 rather than 16 gets every font size, line height and letter spacing in the application drawn a quarter larger, runs of a paragraph included, and the tree is laid out again at that size; before, a canvas app drew its written sizes whatever they had asked for. The shell reads the size `medium` resolves to, so a host page's own stylesheet cannot hide it, at start-up and whenever the window comes back to the front. It reaches the tree as `textScale`, an inherited environment value (`UiEnvironmentKeys.textScale`) the runtime writes on the root; `textScale={1}` on an element keeps its subtree at its written sizes, and `createApp({ textSize: 'fixed' })` or `createSyncApp(...).textSize('fixed')` turns it off. `ShellService.textScale` reports the scale, and `GessoRuntime.setTextScale` sets it.
