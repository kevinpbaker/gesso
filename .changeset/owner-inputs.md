---
'gesso-framework': minor
---

An inspector report's owners say what each component's parent supplied for its inputs, as `inputs`: a word, a number or a flag as it is, an element (a slot the parent filled) as `{ element: true }`, and handlers or data left out. A design tool can then write a component's use back as code, `<TextField label="Email" />`, and an inspector can show a component's props. `ComponentHost.suppliedInputs()` is what it reads.
