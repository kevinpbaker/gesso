---
'gesso-vite-plugin': minor
'gesso-framework': minor
---

A command may carry bytes. An `ArrayBuffer` or a typed array in a command's parameters is no longer reported as unable to cross a channel, because a command's argument is structured-cloned and bytes clone as themselves; a file can be sent as its bytes, with no base64 pass on the render thread. The schema describes such a field as a base64 string tagged `x-gesso-binary` with the type it becomes, and the agent surface decodes an agent's base64 back into that type before the command is sent. Bytes in a view key are still a warning, since a view is diffed.
