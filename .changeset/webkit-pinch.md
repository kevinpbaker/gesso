---
'gesso-framework': patch
---

A trackpad pinch in WebKit (Safari, and the macOS web view an Electrobun app runs in) reaches the application as the ctrl-wheel Chromium and Firefox send for one, `deltaY` being -100·ln of each step's scale. Before, WebKit's gesture events went unheard, so a canvas that zooms on a ctrl-wheel could not be pinched there and a web view that magnifies zoomed the whole page instead. The gesture is kept from the page by the same rule as a wheel: when the chain under the pointer would take it, which `overscrollBehavior="contain"` says of every wheel.
