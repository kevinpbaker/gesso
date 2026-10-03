---
'gesso-core': minor
'gesso-framework': minor
---

`EditingService.select(anchor, focus)` sets a selection from code, in one field or across the fields of an editing group, and focuses the field its focus end is in. An editor needs it to leave a selection selected after a command over it, since its fields can only select their own text.
