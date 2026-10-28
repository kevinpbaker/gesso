---
'gesso-framework': patch
---

`tokens_view` and `render_frame` default to the themes an application designs in, when it names them with `renderThemesWith`: a design editor's project's theme rather than the editor's own, which is what an agent designing that project needs to read and draw in. Both take `theme: 'app' | 'light' | 'dark'`, `app` being the running application's own. `formatThemeTokens`'s second argument is now the sentence that names the theme ("The theme in force at …"), not only the place.
