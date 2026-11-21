---
'gesso-framework': patch
---

A worker application's main thread parses 16.0 kB gzipped before it can draw, down from 19.2. File pickers and the audio element were imported up front though neither is needed for a first frame; the shell now loads both on an idle callback after it mounts. A file or audio request that arrives first waits for its module, audio requests keep the order they were sent in, and once the module is loaded awaiting it costs a microtask, so a file picker still opens inside the click that asked for it. The two key tests the shell makes, `isScrollingKey` and `isContextMenuKey`, moved into a module of their own, so importing them no longer brings the tables beside them.
