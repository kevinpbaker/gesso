---
'gesso-core': patch
'gesso-framework': patch
'gesso-components': patch
---

`TextInput` takes `secret`, and `EditableText` a `secret` property, for a password or a passphrase. The field draws a bullet for every character, copy and cut take nothing from it, and while it has focus the shell edits it through a hidden `<input type="password">`, so the browser and the platform treat it as a password: secure input on macOS, no autocorrect, and a screen reader that calls it a secure text field. The value still reaches `onChange`; the shell's element, the semantics record and the accessibility mirror only ever hold the bullets. A secret field is one line.
