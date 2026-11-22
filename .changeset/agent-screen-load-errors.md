---
'gesso-framework': patch
---

The screen tools say when the application's code threw as it loaded. When the app threw as it started, `ui_snapshot` and the others answer with what was thrown and where (`ReferenceError: Each is not defined at App (src/App.tsx:88:12)`) instead of "The application has not started yet.", and a saved fix that hot-swaps the root now starts the app, where before it stayed unstarted until the page was reloaded. When a later change threw as it loaded, the outline comes back headed with the error and a note that it is the screen from before the change. A render worker whose tree throws during `init` now has no runtime, not a disposed one.
