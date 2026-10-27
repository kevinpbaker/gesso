---
'gesso-vite-plugin': patch
'gesso-framework': patch
---

The dev server's agent endpoint now offers the project's own components, so an AI agent designing a screen uses what is there instead of drawing it again from boxes. `library_overview` lists every component in one line each, `library_search` finds the ones a few words describe, and `library_get` gives one in full: each input's type, default and meaning, examples, and the files that already use it. They are read from the files the project's tsconfig includes, a component saved in a new file is in the next answer, and they are answered on the dev server, so an agent can read them before a page is open. A library's components join only when named: `gesso({ catalog: { libraries: ['gesso-components'] } })`, and `catalog: false` leaves the tools out.

`tokens_view` joins the screen tools: the colours, type styles, corner radii, spacing scale and shadows of the theme in force, by name and value, at a control or at the application's outermost content. An agent told the names writes `backgroundColor="surface"` rather than a colour that will not follow the theme into dark mode. `GessoRuntime.themeAt(id)` gives the same theme to anything else that asks.
