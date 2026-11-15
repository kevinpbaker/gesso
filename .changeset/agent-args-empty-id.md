---
'gesso-framework': patch
---

An optional tool argument sent as `""` where the schema needs one of an enum's words, or text matching a pattern that `""` does not match (an id such as `after: ""`), is left out, as if it had not been sent, as `null` already was. gpt-oss:20b fills every optional field this way and stops after the refusal. Free text keeps its `""`, and a required field is still refused.
