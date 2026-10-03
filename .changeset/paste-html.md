---
'gesso-core': minor
'gesso-framework': minor
'gesso-testing': minor
---

A paste carries the clipboard's HTML along with its text. The shell read only the plain text, so a copy from a web page or a document arrived without its headings, lists and links. `UiBeforeInputEvent`, `UiPasteEvent` and an editing group's edit now have `html` (null when the clipboard had none); the field still inserts the plain text, and an editor that keeps structure can cancel that and convert the HTML. `fireEvent.paste` takes the HTML as a second argument.
