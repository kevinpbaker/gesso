---
'gesso-components': patch
---

A `TextArea`, or a multiline `TextInput`, with no `onSubmit` leaves Command-Enter and Control-Enter to what holds it again. Since `onSubmit` was called from one, the field took those keys whether or not it had an `onSubmit`, so a form that submits from its own key handler, as a commit message's box does, never heard them.
