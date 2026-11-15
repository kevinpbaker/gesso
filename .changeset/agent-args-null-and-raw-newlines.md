---
'gesso-framework': patch
---

Two more repairs to a tool call's arguments before they are checked, both seen from llama3.1 and qwen3 driving Mockz: an optional value sent as `null` (or as the text `"null"` where text is not taken) where the schema takes no null is left out, as if it had not been sent, rather than refused; and an object or array sent as JSON text with a line break or tab left raw inside a string (a file's contents, written out) is parsed, where it used to be refused as text.
