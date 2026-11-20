---
'gesso-core': minor
'gesso-framework': patch
'gesso-components': minor
---

A text field can ask for a phone keyboard and for spellchecking. `EditableText` takes `inputMode` (`'numeric'`, `'decimal'`, `'email'`, `'tel'`, `'url'`, `'search'`) and `spellCheck`, and the shell's editing proxy sets `inputmode`, `spellcheck` and `autocorrect` from them while the field has focus; they were always off before. `TextInput` and `TextArea` take both, and spellchecking is on by default in a `TextArea`, which is for prose, and off in a `TextInput`. `NumberInput` asks for the decimal pad when its `min` is zero or more (iOS's has no minus sign), and `RichTextEditor` spellchecks its text but not its code blocks. A `secret` field is never spellchecked.
