---
'gesso-framework': patch
'gesso-devtools': patch
---

`render_frame` joins the screen tools an agent gets: it draws a module of the project to a PNG, at the width asked for, and answers with it as an MCP image. It draws the module's default export, its only component, or the export named, with the inputs given, in the running application's theme unless `light` or `dark` is asked for. Without a height a frame is as tall as its content; given one, a screen fills it. The answer says when nothing was drawn, and what was thrown while it was drawn. A frame shares the application's channels and services, so a screen shows its real data.

`renderFrame(root, { width })` is the same drawing for any other use: a tree drawn once by a runtime of its own on an `OffscreenCanvas`, run until it stops asking for frames, sized to its content and read back as PNG bytes.

An error a frame causes is reported to the agent rather than over the person's screen. The render worker and the devtools overlay leave alone an error a frame has claimed (`claimErrors` in the framework, under a `Symbol.for` key the overlay reads).

`ServiceRegistry` takes a parent, which `get` falls back to and `has` does not consult, so an offscreen runtime finds the application's services and still registers its own.

A tool result's `content` can now hold an image (`AgentContent`), so code that read `content[0].text` without checking the part's type needs `resultText(result)`, which joins a result's text.
