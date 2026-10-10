---
'gesso-core': minor
'gesso-framework': minor
'gesso-testing': minor
---

A node can take text without being a field: `textInput` makes it a surface that keeps and draws its own text, such as a code editor, and receives typed text through `onBeforeInput`, IME composition through the new `onCompositionStart`, `onCompositionUpdate` and `onCompositionEnd`, and the clipboard through `onPaste` and its state's `clipboard`. Keys belonging to an open IME composition (the Enter that commits a candidate, the arrows that choose one) are no longer forwarded as keys, which inserted a line on commit in a field too. A key whose `onKeyDown` called `preventDefault()` now keeps its text out, as in a browser; `UiKeyboardEvent.textFollows` says whether text follows a key at all. `fireEvent` gains `beforeInput`, the composition events, `copy` and `cut`.

Key events carry `code`, the physical key (`KeyZ`), so a shortcut can match Option+Z on a Mac, where the key is `Ω`.
