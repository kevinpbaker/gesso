---
'gesso-core': minor
'gesso-framework': minor
'gesso-components': minor
---

An overlay can open beside a part of its anchor: `anchorRect` on an overlay entry (and on `useOverlay`'s options), and the layout property of the same name, is a rectangle in the anchor's own coordinates that the entry is placed against, with the same flip and shift, and that it follows through scrolling and layout as it follows the anchor. It can be an Observable, so it moves without the entry opening again. `EditingService.caretRectOf(node, offset)` (and `UiEditingController.caretRectOf`) answers for a character other than the caret's, so a list opened by `@` sits under the `@` as the name is typed, and goes to the next line with it when it wraps. A point opened beside the caret stayed behind when the page scrolled.
